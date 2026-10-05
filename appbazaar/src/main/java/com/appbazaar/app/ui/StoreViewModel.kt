package com.appbazaar.app.ui

import android.app.Application
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

enum class Section(val label: String) { ALL("All apps"), TV("TV apps"), PHONE("Phone apps"), UPDATES("Updates") }

/** What the main button of an app shows. */
sealed interface Action {
    data object Install : Action
    data object Update : Action
    data object Open : Action
    data object Website : Action
    data object Unavailable : Action
    data class Downloading(val progress: Float) : Action
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
    val message: String? = null,
) {
    fun action(app: StoreApp): Action {
        downloads[app.id]?.let { return Action.Downloading(it) }
        if (app.apkUrl == null) return if (app.webUrl != null) Action.Website else Action.Unavailable
        val have = installed[app.id] ?: return Action.Install
        return if (app.version.isNotBlank() && Versions.isNewer(app.version, have)) Action.Update else Action.Open
    }

    val updates: List<StoreApp> get() = apps.filter { action(it) == Action.Update }

    /** App Bazaar's own entry when a newer App Bazaar is out. */
    val selfUpdate: StoreApp? get() = apps.firstOrNull { it.id == Catalog.SELF_ID && action(it) == Action.Update }

    fun visible(): List<StoreApp> = when (section) {
        // Apps for PCs only (no Android download and no web app) have nothing to offer here.
        Section.ALL -> apps.filter { it.apkUrl != null || it.webUrl != null }
        Section.TV -> apps.filter { it.forTv }
        Section.PHONE -> apps.filter { it.forPhone }
        Section.UPDATES -> updates
    }
}

class StoreViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = StoreRepository(app)
    val installer = Installer(app)
    val isTv = installer.isTv()

    private val _state = MutableStateFlow(StoreState(section = if (isTv) Section.TV else Section.PHONE))
    val state: StateFlow<StoreState> = _state.asStateFlow()

    /** A finished download waiting for the "Install unknown apps" switch. */
    private var pending: File? = null
    private var lastRefresh = 0L

    init {
        val cached = repo.cached()
        if (cached.isNotEmpty()) setApps(cached)
        refresh()
    }

    fun refresh() {
        if (_state.value.loading) return
        lastRefresh = System.currentTimeMillis()
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { repo.refresh() }
                .onSuccess { apps -> setApps(apps); _state.update { it.copy(loading = false) }; autoUpdateSelf() }
                .onFailure { e ->
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
        pending?.let { file ->
            if (installer.canInstall()) {
                pending = null
                _state.update { it.copy(askInstallPermission = false) }
                runCatching { installer.install(file) }
            }
        }
        if (System.currentTimeMillis() - lastRefresh > 10 * 60_000L) refresh()
    }

    fun select(section: Section) = _state.update { it.copy(section = section) }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun dismissPermission() {
        pending = null
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
            Action.Unavailable, is Action.Downloading -> Unit
        }
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
                if (installer.canInstall()) {
                    runCatching { installer.install(file) }.onFailure { say("Could not open the installer: ${it.message}") }
                } else {
                    pending = file
                    _state.update { it.copy(askInstallPermission = true) }
                }
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
