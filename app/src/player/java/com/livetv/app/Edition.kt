package com.livetv.app

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.runtime.LaunchedEffect
import com.livetv.app.ui.MainViewModel
import com.livetv.app.ui.PlaylistSettingsDialog
import com.livetv.app.ui.SettingsTheme
import com.livetv.app.ui.UiState

/**
 * Stream Player Plus: the Google Play app. It is only a player: no channels of its own,
 * no sponsor screen and no self-updates (Google Play updates it).
 */
object Edition {
    const val LIVE_TV = false
    const val MAX = false
    const val APP_NAME = "Stream Player Plus"
    const val USER_AGENT = "StreamPlayerPlus-Android/1.0"
    const val HAS_START_SCREEN = false
    const val HAS_WEATHER = false
    const val HAS_DEVICE_LOCATION = false
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

/** No sponsors here. */
@Composable
fun EditionSponsorStrip(modifier: Modifier) = Unit

@Composable
fun EditionSponsorBar(modifier: Modifier) = Unit

@Composable
fun EditionSponsorBox(modifier: Modifier) = Unit

@Composable
fun EditionSponsorVideoBox(modifier: Modifier, allowVideo: Boolean) = Unit

@Composable
fun editionHasSponsors(): Boolean = false

@Composable
fun EditionTicker(modifier: Modifier, big: Boolean = false, always: Boolean = false) = Unit

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
