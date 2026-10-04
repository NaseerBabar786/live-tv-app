package com.livetv.app

import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Rational
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.data.YouTube
import com.livetv.app.player.PlayerScreen
import com.livetv.app.ui.YouTubePlayer
import com.livetv.app.ui.ChannelListScreen
import com.livetv.app.ui.LiveTvTheme
import com.livetv.app.ui.MainViewModel
import com.livetv.app.ui.VodScreen

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()
    private var inPictureInPicture by mutableStateOf(false)

    /** The start screen (Live TV's sponsor screen) shows once per launch, not again after rotation. */
    private var showStartScreen by mutableStateOf(Edition.HAS_START_SCREEN)

    /** Live TV's Movies & Series screen is open. */
    private var showVod by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Watching.init(this)
        com.livetv.app.data.Location.init(this)
        com.livetv.app.data.NewsScreen.init(this)
        enableEdgeToEdge()
        if (savedInstanceState != null) showStartScreen = false
        setContent {
            LiveTvTheme {
                if (showStartScreen) EditionStartScreen(onDone = { showStartScreen = false }) else AppContent()
            }
        }
    }

    @Composable
    private fun AppContent() {
        val state by viewModel.state.collectAsStateWithLifecycle()
        val playing = state.playing
        if (showVod && playing == null) {
            VodScreen(inPictureInPicture = inPictureInPicture, onClose = { showVod = false })
        } else if (playing != null && YouTube.videoId(playing.url) != null) {
            YouTubePlayer(YouTube.videoId(playing.url)!!, onBack = viewModel::stop)
        } else if (playing != null) {
            PlayerScreen(
                channel = playing,
                favorite = playing.id in state.favorites,
                inPictureInPicture = inPictureInPicture,
                onBack = viewModel::stop,
                onToggleFavorite = { viewModel.toggleFavorite(playing) },
                typedNumber = viewModel.typedNumber,
                numberPadOpen = viewModel.numberPadOpen,
                onNumberPad = { viewModel.numberPadOpen = it; if (!it) viewModel.clearTyped() },
                onDigit = viewModel::typeDigit,
                onDeleteDigit = viewModel::deleteDigit,
                onGo = viewModel::goToTyped,
                tip = viewModel.favoritesTip,
                onTipDone = { viewModel.favoritesTip = null },
                barWake = viewModel.channelBarWake,
                onBarHidden = { viewModel.channelBarHidden = it },
            )
        } else {
            ChannelListScreen(
                state = state,
                onPlay = viewModel::play,
                onToggleFavorite = viewModel::toggleFavorite,
                onQueryChange = viewModel::setQuery,
                onFilterChange = viewModel::setFilter,
                onCategoryChange = viewModel::setCategory,
                onRefresh = viewModel::reload,
                settings = { onDismiss -> EditionSettings(state, viewModel, onDismiss) },
                onTryDemo = viewModel::addDemoPlaylist,
                onOpenVod = if (Edition.HAS_VOD) ({ showVod = true }) else null,
                onWatch = viewModel::watched,
            )
        }
        EditionOverlay()
    }

    /**
     * Change channel while one is playing: Channel Up/Down, Page Up/Down, and the D-pad's
     * Up/Down buttons on TV remotes. Both key-down and key-up are consumed so the player
     * doesn't also pop up its controls. Holding the button doesn't skip through channels.
     */
    private val okKeys = setOf(
        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER,
    )
    private var okBringsBar = false

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (viewModel.state.value.playing != null) {
            // Any button closes the Favourites reminder (and still does its job).
            if (event.action == KeyEvent.ACTION_DOWN) viewModel.favoritesTip = null
            // Number buttons type a channel number (it changes 2 seconds after the last digit).
            if (event.keyCode in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9) {
                if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                    viewModel.typeDigit(event.keyCode - KeyEvent.KEYCODE_0)
                }
                return true
            }
            // With the number pad open, Up and Down move around the pad.
            if (viewModel.numberPadOpen) return super.dispatchKeyEvent(event)
            // OK while the channel bar is hidden only brings the bar back (no pause).
            if (event.keyCode in okKeys) {
                if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                    okBringsBar = viewModel.channelBarHidden
                    if (okBringsBar) viewModel.channelBarWake++
                }
                if (okBringsBar) {
                    if (event.action == KeyEvent.ACTION_UP) okBringsBar = false
                    return true
                }
            }
            val step = when (event.keyCode) {
                KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP, KeyEvent.KEYCODE_DPAD_UP -> -1
                KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN, KeyEvent.KEYCODE_DPAD_DOWN -> 1
                else -> 0
            }
            if (step != 0) {
                if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) viewModel.zap(step)
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    /** Keep watching in a small window when the user leaves the app mid-channel. */
    override fun onStart() {
        super.onStart()
        Watching.foreground(true)
    }

    override fun onStop() {
        super.onStop()
        Watching.foreground(false)
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            viewModel.state.value.playing != null &&
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
