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
import com.livetv.app.games.GamesScreen
import com.livetv.app.player.PlayerScreen
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import com.livetv.app.data.MyChannel
import com.livetv.app.ui.ChannelListScreen
import com.livetv.app.ui.LiveTvTheme
import com.livetv.app.ui.MainViewModel
import com.livetv.app.ui.VodScreen
import com.livetv.app.ui.VodTarget

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()
    private var inPictureInPicture by mutableStateOf(false)

    /** The start screen (Cable TV's sponsor screen) shows once per launch, not again after rotation. */
    private var showStartScreen by mutableStateOf(Edition.HAS_START_SCREEN)

    /** Cable TV's Movies & Series screen is open. */
    private var showVod by mutableStateOf(false)
    /** A movie or show picked on Live TV Max's home screen, for the Library to open at. */
    private var vodStart by mutableStateOf<VodTarget?>(null)

    /** Cable TV's Games section is open. */
    private var showGames by mutableStateOf(false)

    /** Why the app closed last time, shown once on this start (1.9.58). */
    private var lastCrash by mutableStateOf<String?>(null)

    /** Our YouTube-run channels that couldn't play there this session; their free-film schedule plays instead. */
    private var fellBack by mutableStateOf(setOf<String>())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CrashNote.install(this)
        if (savedInstanceState == null) lastCrash = CrashNote.takeLast(this)
        Watching.init(this)
        com.livetv.app.data.Location.init(this)
        com.livetv.app.data.NewsScreen.init(this)
        com.livetv.app.data.Cp24Screen.init(this)
        com.livetv.app.data.MyScreen.init(this)
        com.livetv.app.data.ScreenLooks.init(this)
        com.livetv.app.ui.Themes.init(this)
        enableEdgeToEdge()
        if (savedInstanceState != null) showStartScreen = false
        setContent {
            LiveTvTheme {
                if (showStartScreen) EditionStartScreen(onDone = { showStartScreen = false }) else AppContent()
                lastCrash?.let { text ->
                    androidx.compose.material3.AlertDialog(
                        onDismissRequest = { lastCrash = null },
                        title = { androidx.compose.material3.Text("Cable TV closed by itself last time") },
                        text = {
                            androidx.compose.material3.Text(
                                "Please send a photo of this to Bulk Bazaar so it can be fixed.\n\n$text",
                                fontSize = 11.sp,
                            )
                        },
                        confirmButton = {
                            androidx.compose.material3.TextButton(onClick = { lastCrash = null }) { androidx.compose.material3.Text("OK") }
                        },
                    )
                }
            }
        }
    }

    @Composable
    private fun AppContent() {
        val state by viewModel.state.collectAsStateWithLifecycle()
        val playing = state.playing
        if (showGames && playing == null) {
            GamesScreen(onClose = { showGames = false })
        } else if (showVod && playing == null) {
            VodScreen(inPictureInPicture = inPictureInPicture, onClose = { showVod = false; vodStart = null }, start = vodStart)
        } else if (playing != null && playing.url !in fellBack && MyChannel.pageFor(playing, BuildConfig.VERSION_CODE) != null) {
            // Our channels that run like Bazaar Hits, Bazaar Hits itself, and any YouTube channel: YouTube's
            // player with its buttons off, so it can't be paused, skipped or left for YouTube (owner's rule, 1.9.46).
            // Our channels' free-film schedule plays if YouTube won't.
            // It opens in its own plain window (WebChannelActivity, 1.9.51): inside this screen TVs kept the picture black.
            OpenWebChannel(MyChannel.pageFor(playing, BuildConfig.VERSION_CODE)!!, onBack = viewModel::stop,
                onFallback = { if (MyChannel.webPage(playing) != null) fellBack = fellBack + playing.url else viewModel.stop() })
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
                onOpenVod = if (Edition.HAS_VOD) ({ if (!Plans.ask("Movies & Dramas", Plans.LIBRARY)) showVod = true }) else null,
                onOpenVodItem = if (Edition.HAS_VOD) ({ if (!Plans.ask("Movies & Dramas", Plans.LIBRARY)) { vodStart = it; showVod = true } }) else null,
                onOpenGames = if (Edition.LIVE_TV) ({ if (!Plans.ask("Games", Plans.GAMES)) showGames = true }) else null,
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

    /** OK went down while a sponsor card was showing: its key-up belongs to the card too. */
    private var okForSponsor = false

    /** Opens [url] in [WebChannelActivity] (black here meanwhile); Back there comes back with [onBack]. */
    @Composable
    private fun OpenWebChannel(url: String, onBack: () -> Unit, onFallback: () -> Unit) {
        val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == WebChannelActivity.RESULT_FALLBACK) onFallback() else onBack()
        }
        // Once per channel, also when this screen is rebuilt (a turned phone) while it's open.
        var opened by rememberSaveable(url) { mutableStateOf(false) }
        LaunchedEffect(url) {
            if (!opened) {
                opened = true
                launcher.launch(WebChannelActivity.intent(this@MainActivity, url))
            }
        }
        Box(Modifier.fillMaxSize().background(Color.Black))
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // A sponsor card is showing: OK opens the sponsor's website.
        if (event.keyCode in okKeys) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0 && SponsorKey.onOk != null) okForSponsor = true
            if (okForSponsor) {
                if (event.action == KeyEvent.ACTION_UP) {
                    okForSponsor = false
                    SponsorKey.onOk?.invoke()
                }
                return true
            }
        }
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
