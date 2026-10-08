package com.livetv.app

import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.graphics.PixelFormat
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
import com.livetv.app.data.MyChannel
import com.livetv.app.ui.rememberBlockPage
import com.livetv.app.ui.ChannelListScreen
import com.livetv.app.ui.LiveTvTheme
import com.livetv.app.ui.MainViewModel
import com.livetv.app.ui.VodScreen
import com.livetv.app.ui.VodTarget
import com.livetv.app.ui.isTv

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

    /** Cable TV's Weather section is open (1.10.13). */
    private var showWeather by mutableStateOf(false)

    /** Cable TV's Iqra Quran section is open. */
    private var showQuran by mutableStateOf(false)

    /** Our YouTube-run channels that couldn't play there this session; their free-film schedule plays instead. */
    private var fellBack by mutableStateOf(setOf<String>())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (CrashGuard.start(this)) return
        Watching.init(this)
        Features.init(this)
        com.livetv.app.data.Location.init(this)
        com.livetv.app.data.WeatherApp.init(this)
        com.livetv.app.data.NewsScreen.init(this)
        com.livetv.app.data.Cp24Screen.init(this)
        com.livetv.app.data.MyScreen.init(this)
        com.livetv.app.data.ScreenLooks.init(this)
        com.livetv.app.ui.Themes.init(this)
        // Azan at prayer times while Cable TV is on screen (Iqra Quran > Namaz settings).
        QuranSection.startAzan(this)
        enableEdgeToEdge()
        // TVs draw a web page's video (YouTube) underneath the window, showing through a hole in the page;
        // an opaque window keeps that hole black, with only the sound (1.9.55).
        window.setFormat(PixelFormat.TRANSLUCENT)
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
        // Bazaar TV's upcoming trailers play on our locked YouTube page; its own player plays the rest.
        val block = rememberBlockPage(playing)
        val page = playing?.let { block ?: MyChannel.pageFor(it, BuildConfig.VERSION_CODE) }
        // Which part of the app is on screen, for the owner's "most used features" (the modes report themselves).
        val screen = when {
            showWeather && playing == null -> "weather"
            showGames && playing == null -> "games"
            showVod && playing == null -> "library"
            playing != null -> "full"
            else -> null
        }
        LaunchedEffect(screen) { screen?.let(Features::use) }
        // A Gold section tried on Free closes when its minute is up (or the package no longer has it): 1+List again.
        val trying by Plans.trying.collectAsStateWithLifecycle()
        val tier by Plans.current.collectAsStateWithLifecycle()
        val packages by Plans.features.collectAsStateWithLifecycle()
        LaunchedEffect(trying, tier, packages) {
            if (showWeather && !Plans.canUse(Plans.Feature.Weather)) showWeather = false
            if (showGames && !Plans.canUse(Plans.Feature.Games)) showGames = false
            if (showQuran && !Plans.canUse(Plans.Feature.Quran)) showQuran = false
            if (showVod && !Plans.canUse(Plans.Feature.Library)) { showVod = false; vodStart = null }
            if (viewModel.state.value.playing != null && !Plans.canUse(Plans.Feature.FullScreen)) viewModel.stop()
            // The theme picked stays saved; without Themes the usual one shows.
            com.livetv.app.ui.Themes.unlocked = Plans.canUse(Plans.Feature.Themes)
        }
        if (showWeather && playing == null) {
            com.livetv.app.ui.WeatherScreen(onClose = { showWeather = false })
        } else if (showGames && playing == null) {
            GamesScreen(onClose = { showGames = false })
        } else if (showQuran && playing == null) {
            QuranSection.Screen(onClose = { showQuran = false })
        } else if (showVod && playing == null) {
            VodScreen(inPictureInPicture = inPictureInPicture, onClose = { showVod = false; vodStart = null }, start = vodStart)
        } else if (playing != null && page != null && playing.url !in fellBack && page !in fellBack) {
            // Our channels that run like Bazaar Hits, Bazaar Hits itself, and any YouTube channel: YouTube's
            // player with its buttons off, so it can't be paused, skipped or left for YouTube (owner's rule, 1.9.46).
            // Our channels' free-film schedule plays if YouTube won't.
            // It opens in its own plain window (WebChannelActivity, 1.9.51): inside this screen TVs kept the picture black.
            // When the trailers are over (or won't play) our own player takes over again.
            OpenWebChannel(page, onBack = viewModel::stop, onDone = {},
                onFallback = {
                    when {
                        block != null -> fellBack = fellBack + page
                        MyChannel.webPage(playing) != null -> fellBack = fellBack + playing.url
                        else -> viewModel.stop()
                    }
                })
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
                onZap = viewModel::zap,
            )
        } else {
            ChannelListScreen(
                state = state,
                onPlay = viewModel::play,
                onToggleFavorite = viewModel::toggleFavorite,
                onQueryChange = viewModel::setQuery,
                onFilterChange = viewModel::setFilter,
                onCategoryChange = viewModel::setCategory,
                onLanguageChange = viewModel::setLanguage,
                onRefresh = viewModel::reload,
                settings = { onDismiss -> EditionSettings(state, viewModel, onDismiss) },
                onTryDemo = viewModel::addDemoPlaylist,
                onOpenVod = if (Edition.HAS_VOD) ({ if (!Plans.ask("Movies & Dramas", Plans.Feature.Library)) showVod = true }) else null,
                onOpenVodItem = if (Edition.HAS_VOD) ({ if (!Plans.ask("Movies & Dramas", Plans.Feature.Library)) { vodStart = it; showVod = true } }) else null,
                // The games are made for the TV remote, so the phone app has none (owner's rule, 2026-10-08).
                onOpenGames = if (Edition.LIVE_TV && isTv(this@MainActivity)) ({ if (!Plans.ask("Games", Plans.Feature.Games)) showGames = true }) else null,
                onOpenQuran = if (QuranSection.AVAILABLE) ({ if (!Plans.ask("Iqra Quran", Plans.Feature.Quran)) showQuran = true }) else null,
                onOpenWeather = if (Edition.LIVE_TV) ({ if (!Plans.ask("Weather", Plans.Feature.Weather)) showWeather = true }) else null,
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
    private fun OpenWebChannel(url: String, onBack: () -> Unit, onFallback: () -> Unit, onDone: () -> Unit = onBack) {
        var launcher: androidx.activity.result.ActivityResultLauncher<android.content.Intent>? = null
        launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val before = viewModel.state.value.playing?.id
            when (result.resultCode) {
                WebChannelActivity.RESULT_FALLBACK -> onFallback()
                // Bazaar TV's YouTube run (trailers, music, dramas...) is over: its own player goes on.
                WebChannelActivity.RESULT_DONE -> onDone()
                // Channel up/down or a typed number in the YouTube window: the next channel opens as usual.
                WebChannelActivity.RESULT_ZAP -> viewModel.zap(result.data?.getIntExtra(WebChannelActivity.EXTRA_STEP, 1) ?: 1)
                WebChannelActivity.RESULT_NUMBER -> {
                    result.data?.getStringExtra(WebChannelActivity.EXTRA_NUMBER).orEmpty().forEach { viewModel.typeDigit(it - '0') }
                    viewModel.goToTyped()
                }
                else -> onBack()
            }
            // No such channel (or the same one): this channel opens again.
            if (result.resultCode != WebChannelActivity.RESULT_FALLBACK && result.resultCode != WebChannelActivity.RESULT_DONE &&
                result.resultCode != android.app.Activity.RESULT_CANCELED &&
                viewModel.state.value.playing?.id == before
            ) launcher?.launch(WebChannelActivity.intent(this@MainActivity, url))
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
        Features.foreground(true)
    }

    override fun onStop() {
        super.onStop()
        Watching.foreground(false)
        Features.foreground(false)
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
