package com.livetv.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import com.livetv.app.ui.MainViewModel
import com.livetv.app.ui.PlaylistSettingsDialog
import com.livetv.app.ui.SettingsTheme
import com.livetv.app.ui.UiState

/**
 * Live TV Plus: the Google Play edition of Live TV. Same look as Live TV (logo, clock and
 * weather), but only a player: no channels of its own, no sponsor screen, no outside links
 * and no self-updates (Google Play updates it).
 */
object Edition {
    const val LIVE_TV = false
    const val APP_NAME = "Live TV Plus"
    const val USER_AGENT = "LiveTVPlus-Android/1.0"
    const val HAS_START_SCREEN = false
    const val HAS_WEATHER = true
    /** Movies & Series from the saved playlists (Live TV only). */
    const val HAS_VOD = false
}

/** No start screen ([Edition.HAS_START_SCREEN] is false), so this only hands straight on. */
@Composable
fun EditionStartScreen(onDone: () -> Unit) {
    LaunchedEffect(Unit) { onDone() }
}

@Composable
fun EditionOverlay() = Unit

@Composable
fun EditionSettings(state: UiState, viewModel: MainViewModel, onDismiss: () -> Unit) {
    SettingsTheme {
        PlaylistSettingsDialog(
            state = state,
            onSelect = {
                onDismiss()
                viewModel.setPlaylistSource(it.source)
            },
            onAdd = { name, source ->
                onDismiss()
                viewModel.addPlaylist(name, source)
            },
            onTryDemo = {
                onDismiss()
                viewModel.addDemoPlaylist()
            },
            onRemove = viewModel::removePlaylist,
            onDismiss = onDismiss,
        )
    }
}
