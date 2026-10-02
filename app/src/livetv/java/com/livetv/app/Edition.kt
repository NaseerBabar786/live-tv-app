package com.livetv.app

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.livetv.app.ui.MainViewModel
import com.livetv.app.ui.SettingsDialog
import com.livetv.app.ui.SettingsTheme
import com.livetv.app.ui.SponsorScreen
import com.livetv.app.ui.UiState
import com.livetv.app.ui.UpdatePromptDialog
import com.livetv.app.ui.UpdateState
import com.livetv.app.ui.UpdateViewModel
import com.livetv.app.ui.focusGlow

/** Live TV: built-in free channels, a sponsor screen at start, and self-updates from GitHub. */
object Edition {
    const val LIVE_TV = true
    const val APP_NAME = "Live TV"
    const val USER_AGENT = "LiveTV-Android/1.0"
    const val HAS_START_SCREEN = true
    const val HAS_WEATHER = true
    /** Movies & Series from the saved playlists (Live TV only). */
    const val HAS_VOD = true
}

/** The sponsor screen. Also starts the update check so its answer is ready when the screen ends. */
@Composable
fun EditionStartScreen(onDone: () -> Unit) {
    viewModel<UpdateViewModel>()
    SponsorScreen(onDone = onDone)
}

/** Asks to update when the start-up check found a newer version; quiet otherwise. */
@Composable
fun EditionOverlay() {
    val updates = viewModel<UpdateViewModel>()
    val prompting by updates.prompting.collectAsStateWithLifecycle()
    val update by updates.update.collectAsStateWithLifecycle()
    if (!prompting) return
    when (val u = update) {
        is UpdateState.Available, is UpdateState.Downloading, is UpdateState.NeedsPermission ->
            UpdatePromptDialog(update = u, onInstall = updates::installUpdate, onLater = updates::dismissPrompt)
        is UpdateState.Failed -> if (updates.installStarted) {
            SettingsTheme {
                AlertDialog(
                    onDismissRequest = updates::dismissPrompt,
                    title = { Text("Update failed") },
                    text = { Text(u.message + " Live TV will offer the update again next time it starts.") },
                    confirmButton = {
                        TextButton(onClick = updates::dismissPrompt, modifier = Modifier.focusGlow()) { Text("OK") }
                    },
                )
            }
        } else {
            LaunchedEffect(Unit) { updates.dismissPrompt() }
        }
        UpdateState.UpToDate -> LaunchedEffect(Unit) { updates.dismissPrompt() }
        else -> Unit
    }
}

@Composable
fun EditionSettings(state: UiState, viewModel: MainViewModel, onDismiss: () -> Unit) {
    SettingsTheme {
        SettingsDialog(
            currentSource = state.playlistSource,
            provider = state.provider,
            onProviderChange = {
                onDismiss()
                viewModel.setProvider(it)
            },
            playlists = state.playlists,
            onSelectPlaylist = {
                onDismiss()
                viewModel.setPlaylistSource(it.source)
            },
            onAddPlaylist = { name, url ->
                onDismiss()
                viewModel.addPlaylist(name, url)
            },
            onRemovePlaylist = viewModel::removePlaylist,
            loadCatalogue = { viewModel.playlistCatalogue() },
            countries = state.countries,
            languages = state.allLanguages,
            selectedLanguages = state.languageFilter,
            onLanguagesChange = {
                onDismiss()
                viewModel.setLanguages(it)
            },
            onDismiss = onDismiss,
            onSave = {
                onDismiss()
                viewModel.setPlaylistSource(it)
            },
        )
    }
}
