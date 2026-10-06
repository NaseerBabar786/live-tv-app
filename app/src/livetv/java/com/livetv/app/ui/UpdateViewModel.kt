package com.livetv.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.livetv.app.data.Updater
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Progress of the update check that runs at start. */
sealed interface UpdateState {
    data object Idle : UpdateState
    data object Checking : UpdateState
    data object UpToDate : UpdateState
    data class Available(val release: Updater.Release) : UpdateState
    data class Downloading(val release: Updater.Release, val progress: Float) : UpdateState
    /** The user was sent to allow installs from this app; pressing Update again continues. */
    data class NeedsPermission(val release: Updater.Release) : UpdateState
    data class Failed(val message: String) : UpdateState
}

/**
 * Checks GitHub for a newer Cable TV once per launch (the view model outlives rotation).
 * Only versions the owner tested and approved are published where this looks, and even then
 * it only shows a "New update available" reminder: nothing downloads until the viewer taps
 * Update now.
 */
class UpdateViewModel(app: Application) : AndroidViewModel(app) {

    private val updater = Updater(app)

    private val _update = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val update: StateFlow<UpdateState> = _update.asStateFlow()

    /** Whether the start-up prompt may still show; false once the viewer dismisses it. */
    val prompting = MutableStateFlow(true)

    /** Set once the viewer pressed Update now, so a failure is worth reporting. */
    var installStarted = false
        private set

    init {
        checkForUpdate()
    }

    fun dismissPrompt() {
        prompting.value = false
    }

    private fun checkForUpdate() {
        _update.value = UpdateState.Checking
        viewModelScope.launch {
            _update.value = runCatching { updater.checkForUpdate() }.fold(
                onSuccess = { release -> release?.let { UpdateState.Available(it) } ?: UpdateState.UpToDate },
                onFailure = { UpdateState.Failed(it.message ?: "Could not check for updates.") },
            )
        }
    }

    /** Downloads [release] and opens the installer. */
    fun installUpdate(release: Updater.Release) {
        if (_update.value is UpdateState.Downloading) return
        installStarted = true
        if (!updater.ensureInstallAllowed()) {
            _update.value = UpdateState.NeedsPermission(release)
            return
        }
        _update.value = UpdateState.Downloading(release, 0f)
        viewModelScope.launch {
            runCatching {
                val apk = updater.download(release) { p -> _update.value = UpdateState.Downloading(release, p) }
                updater.install(apk)
            }.onSuccess {
                _update.value = UpdateState.Available(release)
            }.onFailure {
                _update.value = UpdateState.Failed(it.message ?: "The update could not be installed.")
            }
        }
    }
}
