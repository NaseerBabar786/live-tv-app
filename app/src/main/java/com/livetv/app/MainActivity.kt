package com.livetv.app

import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.os.Bundle
import android.util.Rational
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.player.PlayerScreen
import com.livetv.app.ui.ChannelListScreen
import com.livetv.app.ui.LiveTvTheme
import com.livetv.app.ui.MainViewModel

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()
    private var inPictureInPicture by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LiveTvTheme {
                val state by viewModel.state.collectAsStateWithLifecycle()
                val playing = state.playing
                if (playing != null) {
                    PlayerScreen(
                        channel = playing,
                        favorite = playing.id in state.favorites,
                        inPictureInPicture = inPictureInPicture,
                        onBack = viewModel::stop,
                        onZap = viewModel::zap,
                        onToggleFavorite = { viewModel.toggleFavorite(playing) },
                    )
                } else {
                    ChannelListScreen(
                        state = state,
                        onPlay = viewModel::play,
                        onToggleFavorite = viewModel::toggleFavorite,
                        onQueryChange = viewModel::setQuery,
                        onFilterChange = viewModel::setFilter,
                        onLanguageChange = viewModel::setLanguage,
                        onCategoryChange = viewModel::setCategory,
                        onRefresh = viewModel::reload,
                        onSaveSource = viewModel::setPlaylistSource,
                    )
                }
            }
        }
    }

    /** Channel up/down on TV remotes and keyboards while a channel is playing. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (viewModel.state.value.playing != null && event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP -> {
                    viewModel.zap(-1); return true
                }
                KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN -> {
                    viewModel.zap(1); return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    /** Keep watching in a small window when the user leaves the app mid-channel. */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (viewModel.state.value.playing != null &&
            packageManager.hasSystemFeature("android.software.picture_in_picture")
        ) {
            runCatching {
                enterPictureInPictureMode(
                    PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9)).build()
                )
            }
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        inPictureInPicture = isInPictureInPictureMode
    }
}
