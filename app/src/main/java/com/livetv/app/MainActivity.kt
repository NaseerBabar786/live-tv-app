package com.livetv.app

import android.app.PictureInPictureParams
import android.app.SearchManager
import android.content.Intent
import android.content.res.Configuration
import android.graphics.PixelFormat
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.speech.RecognizerIntent
import android.util.Rational
import android.view.KeyEvent
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.livetv.app.data.MyChannel
import com.livetv.app.extras.Extras
import com.livetv.app.extras.GuideScreen
import com.livetv.app.extras.HomeScreenRow
import com.livetv.app.extras.Profiles
import com.livetv.app.extras.ReminderPopup
import com.livetv.app.extras.Screensaver
import com.livetv.app.extras.SleepTimerDialog
import com.livetv.app.extras.SleepWarning
import com.livetv.app.extras.VoiceSearch
import com.livetv.app.extras.VoiceSearchDialog
import com.livetv.app.extras.WhoIsWatching
import com.livetv.app.extras.WidgetStack
import com.livetv.app.extras.WidgetsDialog
import com.livetv.app.games.GamesScreen
import com.livetv.app.player.PlayerScreen
import com.livetv.app.ui.ChannelListScreen
import com.livetv.app.ui.LiveTvTheme
import com.livetv.app.ui.MainViewModel
import com.livetv.app.ui.VodScreen
import com.livetv.app.ui.VodTarget
import com.livetv.app.ui.focusGlow
import com.livetv.app.ui.isTv
import com.livetv.app.ui.rememberBlockPage
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

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

    /** Cable TV's TV guide is open (2026-10-09). */
    private var showGuide by mutableStateOf(false)

    /** The sleep timer and widget pickers, from the full-screen channel bar. */
    private var showSleep by mutableStateOf(false)
    private var showWidgets by mutableStateOf(false)
    private var showVoice by mutableStateOf(false)
    // The mic button shows only on TVs where voice search can work.
    private val voiceAvailable by lazy { VoiceSearch.available(this) }

    /** Voice search: the TV's speech screen, then [MainViewModel.spoken] with what was said. */
    // The plain activity-result call: the newer API needs a Fragment library this app doesn't carry (lint).
    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == VOICE_SEARCH) {
            data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let(viewModel::spoken)
        }
    }

    private fun startVoiceSearch() {
        if (VoiceSearch.canListen(this)) {
            showVoice = true
            return
        }
        @Suppress("DEPRECATION")
        val started = runCatching { startActivityForResult(VoiceSearch.speechIntent(this), VOICE_SEARCH) }.isSuccess
        if (!started) {
            Toast.makeText(this, "Voice search isn't available on this TV. Use the search button instead.", Toast.LENGTH_LONG).show()
        }
    }

    /** A click on a channel on the TV's home screen opens it (HomeScreenRow). */
    private fun takeChannelFrom(intent: Intent?) {
        intent?.getStringExtra(HomeScreenRow.EXTRA_CHANNEL)?.let {
            viewModel.pendingUrl = it
            viewModel.openPending()
        }
        // Google TV's own voice search ("Geo News on Cable TV"): the words come here, once the channels are in.
        if (Edition.LIVE_TV && intent?.action in SEARCH_ACTIONS) {
            intent?.getStringExtra(SearchManager.QUERY)?.takeIf { it.isNotBlank() }?.let { said ->
                lifecycleScope.launch {
                    viewModel.state.first { it.channels.isNotEmpty() }
                    viewModel.spoken(said)
                }
            }
        }
    }

    /** The remote's search / microphone key, where the TV hands it to the app: Cable TV's voice search. */
    override fun onSearchRequested(): Boolean {
        if (!Edition.LIVE_TV) return super.onSearchRequested()
        startVoiceSearch()
        return true
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        takeChannelFrom(intent)
    }

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
        Extras.init(this)
        if (savedInstanceState == null) takeChannelFrom(intent)
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
            if (showGuide && !Plans.canUse(Plans.Feature.Guide)) showGuide = false
            if (viewModel.state.value.playing != null && !Plans.canUse(Plans.Feature.FullScreen)) viewModel.stop()
            // The theme picked stays saved; without Themes the usual one shows.
            com.livetv.app.ui.Themes.unlocked = Plans.canUse(Plans.Feature.Themes)
        }
        // A channel clicked on the TV's home screen opens once the channels are in.
        LaunchedEffect(state.channels) { viewModel.openPending() }
        // Our channels and the viewer's favourites in the TV home screen's "Cable TV" row (older Android TV).
        LaunchedEffect(state.channels.size, state.favorites) {
            if (Edition.LIVE_TV && state.channels.isNotEmpty()) HomeScreenRow.update(this@MainActivity, state.channels, state.favorites)
        }
        if (showWeather && playing == null) {
            com.livetv.app.ui.WeatherScreen(onClose = { showWeather = false })
        } else if (showGuide && playing == null) {
            GuideScreen(
                channels = state.visibleChannels.ifEmpty { state.channels },
                onPlay = viewModel::play,
                onClose = { showGuide = false },
            )
        } else if (showGames && playing == null) {
            GamesScreen(onClose = { showGames = false })
        } else if (showQuran && playing == null) {
            QuranSection.Screen(
                onClose = { showQuran = false },
                // The Weather section draws over the Azan Clock (checked first above), so closing it comes back here.
                onWeather = if (Edition.LIVE_TV) ({ if (!Plans.ask("Weather", Plans.Feature.Weather)) showWeather = true }) else null,
            )
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
                onReport = if (Edition.LIVE_TV) ({ Extras.reportBroken(this@MainActivity, playing); viewModel.zap(1) }) else null,
                barButtons = { if (Edition.LIVE_TV) ChannelBarExtras() },
                overlay = { if (Edition.LIVE_TV) FloatingWidgets(playing) },
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
                onOpenGuide = if (Edition.LIVE_TV) ({ if (!Plans.ask("TV guide", Plans.Feature.Guide)) showGuide = true }) else null,
                // The owner wants voice on the remote's mic key, as in Google's apps; this button goes once that is
                // proven on his TV (2026-10-10).
                onVoiceSearch = if (Edition.LIVE_TV && voiceAvailable) ::startVoiceSearch else null,
                searchWake = viewModel.searchWake,
                onReport = if (Edition.LIVE_TV) ({ Extras.reportBroken(this@MainActivity, it) }) else null,
            )
        }
        EditionOverlay()
        if (Edition.LIVE_TV) {
            if (showSleep) SleepTimerDialog(onDismiss = { showSleep = false })
            if (showWidgets) WidgetsDialog(onDismiss = { showWidgets = false })
            if (showVoice) VoiceSearchDialog(onSpoken = viewModel::spoken, onDismiss = { showVoice = false })
            ReminderPopup(onWatch = { url ->
                state.channels.firstOrNull { it.url == url }?.let { c ->
                    showGuide = false
                    if (Plans.has(Plans.Feature.FullScreen)) viewModel.play(c) else viewModel.watched(c)
                }
            })
            SleepWarning(onSleep = { finishAffinity() })
            if (Plans.has(Plans.Feature.Profiles)) {
                WhoIsWatching(onPick = { if (Profiles.switchTo(it)) viewModel.profileChanged() })
            }
            Screensaver()
        }
    }

    /** Cable TV's buttons on the full-screen channel bar: last channel, sleep timer, widgets. */
    @Composable
    private fun ChannelBarExtras() {
        IconButton(onClick = viewModel::lastChannel, modifier = Modifier.focusGlow()) {
            Icon(Icons.Filled.History, contentDescription = "Last channel", tint = Color.White)
        }
        val sleepAt by Extras.sleepAt.collectAsStateWithLifecycle()
        IconButton(onClick = { showSleep = true }, modifier = Modifier.focusGlow()) {
            Icon(Icons.Filled.Bedtime, contentDescription = "Sleep timer", tint = if (sleepAt != null) com.livetv.app.ui.Themes.current.secondary else com.livetv.app.ui.Themes.current.onSurface)
        }
        IconButton(onClick = { showWidgets = true }, modifier = Modifier.focusGlow()) {
            Icon(Icons.Filled.Widgets, contentDescription = "Widgets", tint = Color.White)
        }
    }

    /** The floating widgets in the corner the viewer picked, clear of the channel bar and the bottom line. */
    @Composable
    private fun BoxScope.FloatingWidgets(channel: com.livetv.app.data.Channel) {
        val corner by Extras.corner.collectAsStateWithLifecycle()
        val align = when (corner) {
            Extras.Corner.TopRight -> Alignment.TopEnd
            Extras.Corner.TopLeft -> Alignment.TopStart
            Extras.Corner.BottomRight -> Alignment.BottomEnd
            Extras.Corner.BottomLeft -> Alignment.BottomStart
        }
        val top = corner == Extras.Corner.TopRight || corner == Extras.Corner.TopLeft
        WidgetStack(
            channel,
            Modifier
                .align(align)
                .padding(start = 24.dp, end = 24.dp, top = if (top) 72.dp else 0.dp, bottom = if (top) 0.dp else 64.dp),
        )
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

    override fun dispatchTouchEvent(ev: android.view.MotionEvent): Boolean {
        Extras.touch()
        if (Extras.screensaverOn.value) {
            if (ev.actionMasked == android.view.MotionEvent.ACTION_UP) Extras.screensaverOn.value = false
            return true
        }
        return super.dispatchTouchEvent(ev)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        Extras.touch()
        // The screensaver is up: this press only closes it.
        if (Extras.screensaverOn.value) {
            if (event.action == KeyEvent.ACTION_UP) Extras.screensaverOn.value = false
            return true
        }
        if (Edition.LIVE_TV) {
            // The remote's Last / Recall key goes back to the channel before.
            if (event.keyCode == KeyEvent.KEYCODE_LAST_CHANNEL) {
                if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) viewModel.lastChannel()
                return true
            }
            // The search or microphone key, on remotes that pass it to the app: voice search.
            if (event.keyCode == KeyEvent.KEYCODE_SEARCH || event.keyCode == KeyEvent.KEYCODE_VOICE_ASSIST) {
                if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) startVoiceSearch()
                return true
            }
        }
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

/** Request code for the TV speech screen (voice search). */
private const val VOICE_SEARCH = 4207
private val SEARCH_ACTIONS = setOf(Intent.ACTION_SEARCH, MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH)
