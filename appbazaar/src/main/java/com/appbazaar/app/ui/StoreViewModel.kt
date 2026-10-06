package com.appbazaar.app.ui

import android.app.Application
import android.content.pm.PackageInstaller
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.appbazaar.app.data.Catalog
import com.appbazaar.app.data.Installer
import com.appbazaar.app.data.StoreApp
import com.appbazaar.app.data.StoreRepository
import com.appbazaar.app.data.Versions
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File

enum class Section(val label: String) { ALL("All apps"), TV("TV apps"), PHONE("Phone apps"), PC("PC apps"), UPDATES("Updates") }

/** What the main button of an app shows. */
sealed interface Action {
    data object Install : Action
    data object Update : Action
    data object Open : Action
    data object Website : Action
    /** Only for computers: the button shows how to get it on a PC (QR code and link). */
    data object OnPc : Action
    data object Unavailable : Action
    data class Downloading(val progress: Float) : Action
    data object Installing : Action
}

data class StoreState(
    val apps: List<StoreApp> = emptyList(),
    /** App id -> installed versionName, only for installed apps. */
    val installed: Map<String, String> = emptyMap(),
    /** App id -> download progress (0..1, or -1 while the size isn't known yet). */
    val downloads: Map<String, Float> = emptyMap(),
    val loading: Boolean = false,
    val error: String? = null,
    val section: Section = Section.ALL,
    val askInstallPermission: Boolean = false,
    /** The app whose install is running now. */
    val installing: String? = null,
    val message: String? = null,
) {
    fun action(app: StoreApp): Action {
        if (installing == app.id) return Action.Installing
        downloads[app.id]?.let { return Action.Downloading(it) }
        if (app.apkUrl == null) return when {
            app.forPc -> Action.OnPc
            app.webUrl != null -> Action.Website
            else -> Action.Unavailable
        }
        val have = installed[app.id] ?: return Action.Install
        return if (app.version.isNotBlank() && Versions.isNewer(app.version, have)) Action.Update else Action.Open
    }

    val updates: List<StoreApp> get() = apps.filter { action(it) == Action.Update }

    /** App Bazaar's own entry when a newer App Bazaar is out. */
    val selfUpdate: StoreApp? get() = apps.firstOrNull { it.id == Catalog.SELF_ID && action(it) == Action.Update }

    fun visible(): List<StoreApp> = when (section) {
        Section.ALL -> apps.filter { it.apkUrl != null || it.webUrl != null || it.forPc }
        Section.TV -> apps.filter { it.forTv }
        Section.PHONE -> apps.filter { it.forPhone }
        Section.PC -> apps.filter { it.forPc }
        Section.UPDATES -> updates
    }
}

class StoreViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = StoreRepository(app)
    val installer = Installer(app)
    val isTv = installer.isTv()

    private val _state = MutableStateFlow(StoreState(section = if (isTv) Section.TV else Section.PHONE))
    val state: StateFlow<StoreState> = _state.asStateFlow()

    /**
     * Finished downloads waiting for Android's installer. Installers open one at a time: the next one
     * opens when the user comes back from the previous one (Android asks for one Install tap per app).
     */
    private val installQueue = ArrayDeque<Pair<StoreApp, File>>()
    /** An install is running (a session, or Android's install screen opened the old way). */
    private var waitingForInstaller = false
    /** The old-style install screen is open; its end is only seen when the store comes back. */
    private var waitingForIntent = false
    private var lastRefresh = 0L

    init {
        val cached = repo.cached()
        if (cached.isNotEmpty()) setApps(cached)
        refresh()
    }

    /** Fetches the app list again. [manual] is the Refresh button: it then says what it found. */
    fun refresh(manual: Boolean = false) {
        if (_state.value.loading) return
        lastRefresh = System.currentTimeMillis()
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { repo.refresh() }
                .onSuccess { apps ->
                    setApps(apps)
                    refreshInstalled()
                    _state.update { it.copy(loading = false) }
                    if (manual) {
                        val n = _state.value.updates.size
                        say(if (n == 0) "Checked just now. All your apps are up to date." else "Checked just now. $n update${if (n > 1) "s" else ""} ready.")
                    }
                    autoUpdateSelf()
                }
                .onFailure { e ->
                    if (manual && _state.value.apps.isNotEmpty()) say("Could not reach App Bazaar (${e.message ?: "no internet"}). Please try again.")
                    _state.update {
                        it.copy(
                            loading = false,
                            error = if (it.apps.isEmpty()) "Could not load the apps. Check the internet and press Try again."
                            else "Showing the saved list. Could not reach App Bazaar (${e.message ?: "no internet"}).",
                        )
                    }
                }
        }
    }

    /** Called whenever the screen comes back: an app may have been installed or removed meanwhile. */
    fun onResume() {
        refreshInstalled()
        if (waitingForIntent) {
            waitingForIntent = false
            waitingForInstaller = false
            pumpInstalls()
        } else if (_state.value.askInstallPermission && installer.canInstall()) {
            pumpInstalls()
        }
        // Coming back to the store (from the home screen or another app) fetches the list again.
        if (System.currentTimeMillis() - lastRefresh > 30_000L) refresh()
    }

    fun select(section: Section) = _state.update { it.copy(section = section) }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun dismissPermission() {
        installQueue.clear()
        _state.update { it.copy(askInstallPermission = false) }
    }

    fun openPermissionSettings() {
        if (!installer.openInstallPermission()) {
            _state.update {
                it.copy(message = "Open Settings > Apps > Security (or Special app access) > Install unknown apps, and turn on App Bazaar.")
            }
        }
    }

    fun act(app: StoreApp) {
        when (_state.value.action(app)) {
            Action.Install, Action.Update -> download(app)
            Action.Open -> if (!installer.open(app.packageName ?: return)) say("${app.name} has no screen to open on this device.")
            Action.Website -> app.webUrl?.let { if (!installer.openWeb(it)) say("This device has no web browser for ${it}.") }
            Action.OnPc, Action.Unavailable, Action.Installing, is Action.Downloading -> Unit
        }
    }

    /** Updates every one of our apps on this device in one go. */
    fun updateAll() {
        // App Bazaar's own update restarts the store and would stop the others, so it waits for its
        // own turn (it updates itself on the next start) unless it is the only one.
        val list = _state.value.updates.filter { it.id != Catalog.SELF_ID }.ifEmpty { _state.value.updates }
        if (list.isEmpty()) {
            say("All your apps are up to date.")
            return
        }
        say(
            if (list.size == 1) "Updating ${list[0].name}…"
            else "Updating ${list.size} apps…",
        )
        list.forEach { if (_state.value.downloads[it.id] == null) download(it) }
    }

    fun uninstall(app: StoreApp) {
        app.packageName?.let { installer.uninstall(it) }
    }

    private fun download(app: StoreApp) {
        _state.update { it.copy(downloads = it.downloads + (app.id to -1f)) }
        viewModelScope.launch {
            runCatching {
                installer.download(app) { p -> _state.update { it.copy(downloads = it.downloads + (app.id to p)) } }
            }.onSuccess { file ->
                _state.update { it.copy(downloads = it.downloads - app.id) }
                // App Bazaar's own update restarts the store, so it always installs last.
                if (app.id == Catalog.SELF_ID) installQueue.addLast(app to file) else installQueue.addFirst(app to file)
                pumpInstalls()
            }.onFailure { e ->
                _state.update { it.copy(downloads = it.downloads - app.id) }
                say("${app.name} did not download: ${e.message ?: "no internet"}")
            }
        }
    }

    /**
     * When a newer App Bazaar is listed, download it straight away (once per start) and open the
     * installer. Android still asks the user to press Install once: sideloaded apps can't skip that.
     */
    private var selfUpdateStarted = false

    private fun autoUpdateSelf() {
        if (selfUpdateStarted) return
        val self = _state.value.selfUpdate ?: return
        selfUpdateStarted = true
        say("Updating App Bazaar to ${self.version}…")
        download(self)
    }

    /** Opens the installer for the next finished download, asking for the install switch first if needed. */
    /**
     * Installs the next finished download. Updates to apps App Bazaar installed go through without an
     * Install tap on Android 12 and newer; others show Android's Install screen. App Bazaar's own
     * update always asks, so the store doesn't close by surprise.
     */
    private fun pumpInstalls() {
        if (waitingForInstaller || installQueue.isEmpty()) return
        if (!installer.canInstall()) {
            _state.update { it.copy(askInstallPermission = true) }
            return
        }
        _state.update { it.copy(askInstallPermission = false) }
        val (app, file) = installQueue.removeFirst()
        waitingForInstaller = true
        _state.update { it.copy(installing = app.id) }
        viewModelScope.launch {
            runCatching {
                installer.installSession(file, silent = app.id != Catalog.SELF_ID) { status, message ->
                    installDone(app, status, message)
                }
            }.onFailure {
                // Fall back to the classic install screen.
                runCatching { installer.install(file) }
                    .onSuccess { waitingForIntent = true }
                    .onFailure { e -> installDone(app, PackageInstaller.STATUS_FAILURE, e.message) }
            }
        }
    }

    private fun installDone(app: StoreApp, status: Int, message: String?) {
        waitingForInstaller = false
        _state.update { it.copy(installing = null) }
        refreshInstalled()
        when (status) {
            PackageInstaller.STATUS_SUCCESS -> say("${app.name} is up to date.")
            PackageInstaller.STATUS_FAILURE_ABORTED -> Unit
            else -> say("${app.name} did not install${message?.let { ": $it" } ?: "."}")
        }
        pumpInstalls()
    }

    private fun say(text: String) = _state.update { it.copy(message = text) }

    private fun setApps(apps: List<StoreApp>) {
        _state.update { it.copy(apps = apps, installed = installedOf(apps)) }
    }

    private fun refreshInstalled() = _state.update { it.copy(installed = installedOf(it.apps)) }

    private fun installedOf(apps: List<StoreApp>): Map<String, String> = buildMap {
        for (a in apps) {
            val pkg = if (a.id == Catalog.SELF_ID) installer.ownPackage else a.packageName
            installer.installedVersion(pkg)?.let { put(a.id, it) }
        }
    }
}
