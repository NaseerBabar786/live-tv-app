package com.multichat.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.multichat.app.data.Updater
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Progress of the update that runs at start. */
sealed interface UpdateState {
    data object Idle : UpdateState
    data class Downloading(val release: Updater.Release, val progress: Float) : UpdateState
    /** Downloaded; the system installer was opened (or waits on the install permission). */
    data class ReadyToInstall(val release: Updater.Release, val needsPermission: Boolean) : UpdateState
    data class Failed(val message: String) : UpdateState
}

/**
 * Once per launch, checks GitHub for a newer Multi Chat and, when there is one, downloads it
 * straight away and opens the installer. Android always shows its own Install screen; after
 * installing, its Open button starts the new version.
 */
class UpdateViewModel(app: Application) : AndroidViewModel(app) {

    private val updater = Updater(app)
    private var apk: java.io.File? = null

    val installedVersion: String = updater.installedVersion

    private val _update = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val update: StateFlow<UpdateState> = _update.asStateFlow()

    init {
        viewModelScope.launch {
            // No network or GitHub down: carry on quietly, the next start tries again.
            val release = runCatching { updater.checkForUpdate() }.getOrNull() ?: return@launch
            _update.value = UpdateState.Downloading(release, 0f)
            runCatching {
                updater.download(release) { p -> _update.value = UpdateState.Downloading(release, p) }
            }.onSuccess { file ->
                apk = file
                install(release)
            }.onFailure {
                _update.value = UpdateState.Failed(it.message ?: "The update could not be downloaded.")
            }
        }
    }

    /** Opens the installer, or first the one-time permission screen. Also the dialog's Install button. */
    fun install(release: Updater.Release) {
        val file = apk ?: return
        if (!updater.canInstall() && updater.openInstallPermission()) {
            _update.value = UpdateState.ReadyToInstall(release, needsPermission = true)
            return
        }
        _update.value = UpdateState.ReadyToInstall(release, needsPermission = false)
        runCatching { updater.install(file) }
            .onFailure { _update.value = UpdateState.Failed(it.message ?: "The installer could not be opened.") }
    }

    fun dismiss() {
        _update.value = UpdateState.Idle
    }
}
