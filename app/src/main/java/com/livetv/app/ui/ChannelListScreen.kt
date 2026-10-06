package com.livetv.app.ui

import androidx.compose.material3.ScaffoldDefaults
import androidx.compose.foundation.layout.WindowInsets
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.material3.AlertDialog
import kotlinx.coroutines.flow.MutableStateFlow
import com.livetv.app.Plans
import com.livetv.app.Premium
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.SideEffect
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.roundToInt
import android.app.Activity
import android.content.Context
import android.net.ConnectivityManager
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableStateMapOf
import android.view.TextureView
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.C
import androidx.media3.common.Player
import com.livetv.app.data.MyChannel
import com.livetv.app.data.YouTube
import com.livetv.app.player.StreamPlayer
import androidx.compose.foundation.layout.IntrinsicSize
import com.livetv.app.data.Weather
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.text.format.DateFormat
import java.util.Locale
import java.text.SimpleDateFormat
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.TextButton
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.coerceAtLeast
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import java.util.Date
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import com.livetv.app.R
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.ViewColumn
import androidx.compose.material.icons.filled.ViewQuilt
import androidx.compose.material.icons.filled.ViewArray
import androidx.compose.material.icons.filled.ViewCarousel
import androidx.compose.material.icons.filled.ViewDay
import androidx.compose.material.icons.filled.VerticalSplit
import androidx.compose.material.icons.filled.ViewSidebar
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.key
import com.livetv.app.BuildConfig
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.focus.focusRequester
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import com.livetv.app.Edition
import com.livetv.app.EditionSponsorBar
import com.livetv.app.EditionTicker
import com.livetv.app.Watching
import com.livetv.app.data.Channel

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun ChannelListScreen(
    state: UiState,
    onPlay: (Channel) -> Unit,
    onToggleFavorite: (Channel) -> Unit,
    onQueryChange: (String) -> Unit,
    onFilterChange: (String) -> Unit,
    onCategoryChange: (String?) -> Unit,
    onRefresh: () -> Unit,
    /** This app's Settings dialog; it calls the given function to close. */
    settings: @Composable (onDismiss: () -> Unit) -> Unit,
    /** Stream Player Plus: adds the built-in demo playlist. */
    onTryDemo: () -> Unit = {},
    /** Opens the Library (movies, series and shows); null hides its button. */
    onOpenVod: (() -> Unit)? = null,
    /** Live TV Max's home screen: opens the Library at a movie or show. */
    onOpenVodItem: ((VodTarget) -> Unit)? = null,
    /** Opens the Games section; null hides its button. */
    onOpenGames: (() -> Unit)? = null,
    /** A channel picked to play in 1+List's player, remembered as the last one watched. */
    onWatch: (Channel) -> Unit = {},
) {
    var searching by rememberSaveable { mutableStateOf(false) }
    val searchButtonFocus = remember { FocusRequester() }
    var showSettings by rememberSaveable { mutableStateOf(false) }
    val gridState = rememberLazyGridState()
    val lastWatchedFocus = remember { FocusRequester() }
    // Lets 1×2 move the highlight to a card or the layout button directly.
    val cardFocus = remember { mutableMapOf<String, FocusRequester>() }
    fun cardRequester(id: String): FocusRequester =
        if (id == state.lastWatchedId) lastWatchedFocus else cardFocus.getOrPut(id) { FocusRequester() }
    val layoutButtonFocus = remember { FocusRequester() }
    val favoriteButtonFocus = remember { FocusRequester() }
    val chipFocus = remember { FocusRequester() }
    // 2×1: Up is being held down (it goes to the filter row instead of changing channel).
    var upHeld by remember { mutableStateOf(false) }

    // Live previews in low quality: the highlighted card plays with sound, and every other
    // card on screen shows one still picture of what's on. Wi-Fi or Ethernet only, so mobile
    // data isn't used up.
    val context = LocalContext.current
    var inForeground by remember { mutableStateOf(true) }
    var focusedId by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    // Players are pooled and reused: creating and releasing ExoPlayers while scrolling
    // blocked the main thread (release() waits for the playback thread) and froze the app.
    val rowPreviews = remember { mutableStateMapOf<String, Preview>() }
    // Tiles of our YouTube channels and Bazaar Hits play their own page (1.9.60), not their backup films;
    // by channel id. A page that gives up on YouTube drops back to the films.
    val pageTiles = remember { mutableStateMapOf<String, String>() }
    val failedPages = remember { mutableStateMapOf<String, Boolean>() }
    val pool = remember { mutableListOf<Preview>() }
    val gridIds by remember {
        derivedStateOf<List<String>?> {
            // Only one video plays (several at once made the highlight lag on the Chromecast).
            // It keeps playing when the highlight moves up to the top bar, so the sound
            // button there can be used while it plays.
            if (gridState.isScrollInProgress) null
            else {
                val items = gridState.layoutInfo.visibleItemsInfo
                // Every card on screen, the highlighted row first so its pictures come first.
                val row = items.firstOrNull { it.key == focusedId }?.row
                items.sortedBy { it.row != row }.map { it.key as String }
            }
        }
    }
    DisposableEffect(Unit) {
        onDispose { (pool + rowPreviews.values).distinct().forEach { it.stream.release() } }
    }
    // Only the highlighted tile has sound; the speaker button in the top bar mutes it (remembered).
    val prefs = remember { context.getSharedPreferences("live_tv", Context.MODE_PRIVATE) }
    var previewSound by remember { mutableStateOf(prefs.getBoolean(PREF_PREVIEW_SOUND, true)) }
    // TV and tablet layout, picked with the button in the top bar. Each time the app opens, Live TV Max
    // starts on the Browse home screen; Cable TV and the other apps start in 1+List (user's choice, 1.9.41).
    val wideScreen = LocalConfiguration.current.screenWidthDp >= 600
    var tileLayout by remember {
        mutableStateOf(
            sessionTileLayout
                ?: if (Edition.MAX) TileLayout.Browse else TileLayout.List,
        )
    }
    // Cable TV's packages: a mode the viewer's package doesn't have (it ran out, say) goes back to Browse or 1+List.
    val tier by Plans.current.collectAsStateWithLifecycle()
    LaunchedEffect(tier, tileLayout) {
        if (!Plans.allows(tileLayout.tier)) {
            tileLayout = if (Edition.MAX) TileLayout.Browse else TileLayout.List
            sessionTileLayout = tileLayout
        }
    }
    // 2×3, 2×2 and 1×2 are Premium in Live TV Plus (free in the other apps).
    val premium by Premium.active.collectAsStateWithLifecycle()
    var upsellFor by remember { mutableStateOf<TileLayout?>(null) }
    LaunchedEffect(premium) {
        if (premium) {
            upsellFor?.let { tileLayout = it; sessionTileLayout = it }
            upsellFor = null
        } else if (tileLayout.separateTvs) {
            tileLayout = TileLayout.List
            sessionTileLayout = null
        }
    }
    // The weather follows the device's location; phones ask for it here, TVs when News mode opens.
    DeviceLocation(ask = !wideScreen)
    // "1+List": the channel playing on the left, kept when coming back from full screen.
    val listMode = wideScreen && tileLayout == TileLayout.List
    // "News": the top bar and filters hide; Back brings them back (newsBar) until the player is highlighted again.
    val newsMode = wideScreen && tileLayout in INFO_LAYOUTS
    var newsBar by remember { mutableStateOf(false) }
    // "Browse": its own rail and search bar take the place of the top bar and filters.
    // Live TV Max shows it on phones too (the other layouts are for TVs and tablets).
    val browseMode = (wideScreen || Edition.MAX) && tileLayout == TileLayout.Browse
    // "Carousel": like News, the top bar hides; Back brings it back (newsBar).
    val carouselMode = wideScreen && tileLayout == TileLayout.Carousel
    // "Strip": a big player on top and a strip of channel tiles along the bottom; Back on its Modes button shows the top bar.
    val stripMode = wideScreen && tileLayout == TileLayout.Strip
    // "Duo": two silent players side by side on top and rows of channel cards below; Back on its Modes button shows the top bar.
    val duoMode = wideScreen && tileLayout == TileLayout.Duo
    val newsFocus = remember { FocusRequester() }
    var listChannelId by rememberSaveable { mutableStateOf(state.lastWatchedId) }
    // TVs and tablets show a fixed window of tiles that slides along the list one channel at a
    // time; [windowStart] is the channel in the first tile.
    val windowed = wideScreen && !listMode && !newsMode && !browseMode && !carouselMode && !stripMode && !duoMode
    val slots = tileLayout.columns * tileLayout.rows
    var windowStart by rememberSaveable { mutableIntStateOf(0) }
    val start = windowStart.coerceIn(0, max(0, state.visibleChannels.size - slots))
    // 1×2, 2×2 and 2×3 are separate TVs: Up and Down change the channel on the highlighted tile only.
    // [twoIds] holds the tiles' channels once one has been changed.
    var twoIds by remember { mutableStateOf(sessionTileIds) }
    var tilesFull by remember { mutableStateOf(sessionTilesFull) }
    SideEffect { sessionTileIds = twoIds; sessionTilesFull = tilesFull }
    // 1+3 has no full screen view: OK on its big player opens the channel straight away.
    val fullTiles = tilesFull && windowed && tileLayout != TileLayout.Five
    val hideBars = fullTiles || ((newsMode || carouselMode || stripMode || duoMode) && !newsBar) || browseMode
    val twoChosen = twoIds.mapNotNull { id -> state.visibleChannels.firstOrNull { it.id == id } }
    val window = when {
        !windowed -> emptyList()
        // 1+3 keeps its chosen channels, topped up from the list if any are missing.
        tileLayout == TileLayout.Five ->
            (twoChosen + state.visibleChannels.drop(start) + state.visibleChannels).distinctBy { it.id }.take(slots)
        tileLayout.separateTvs && twoChosen.size == slots && twoChosen.distinctBy { it.id }.size == slots -> twoChosen
        else -> state.visibleChannels.drop(start).take(slots)
    }
    val rowIds: List<String>? = if (windowed) {
        // The highlighted row first, so its pictures come first.
        val row = window.indexOfFirst { it.id == focusedId }.takeIf { it >= 0 }?.div(tileLayout.columns)
        window.withIndex().sortedBy { it.index / tileLayout.columns != row }.map { it.value.id }
    } else gridIds

    // Opening the app, or coming back from the player: show the channel watched last and put
    // the remote's cursor on it (once the list has loaded).
    LaunchedEffect(state.visibleChannels.isNotEmpty()) {
        // On a TV the app opens in 1+List with the channel watched last playing beside the list
        // (1.9.41); it no longer jumps straight to full screen. [START_FULL_SCREEN] turns that back on.
        if (START_FULL_SCREEN && listMode && !sessionStartOpened && state.visibleChannels.isNotEmpty()) {
            sessionStartOpened = true
            (state.visibleChannels + state.channels).firstOrNull { it.id == state.lastWatchedId }?.let {
                onPlay(it)
                return@LaunchedEffect
            }
        }
        val index = state.visibleChannels.indexOfFirst { it.id == state.lastWatchedId }
        if (index >= 0) {
            if (windowed) {
                val opened = sessionOpenedTile
                sessionOpenedTile = -1
                if (tileLayout.separateTvs && opened in window.indices && window.none { it.id == state.lastWatchedId }) {
                    // Back from full screen: the tile that was opened shows the channel watched last.
                    twoIds = window.mapIndexed { i, c -> if (i == opened) state.lastWatchedId!! else c.id }
                } else if (window.none { it.id == state.lastWatchedId }) {
                    windowStart = index
                    twoIds = emptyList()
                }
            } else gridState.scrollToItem(index)
            withFrameNanos { }
            runCatching { lastWatchedFocus.requestFocus() }
        }
    }

    // Still pictures for the cards on screen, kept while scrolling around.
    val snapshots = remember { mutableStateMapOf<String, ImageBitmap>() }
    // A card that stops playing keeps its last frame as its picture.
    fun release(id: String) {
        pageTiles.remove(id)
        rowPreviews.remove(id)?.let { p ->
            if (p.showing) p.view?.bitmap?.let { snapshots[id] = it.asImageBitmap() }
            p.stream.stop(); p.showing = false; pool += p
        }
    }
    // The highlighted card has the sound; in 1+3 only the big player has it.
    val bigPlayer = wideScreen && tileLayout == TileLayout.Five
    val soundId = if (bigPlayer) window.firstOrNull()?.id else focusedId
    LaunchedEffect(rowIds, focusedId, inForeground, showSettings, tileLayout) {
        val ids = rowIds ?: return@LaunchedEffect // wait for scrolling to settle
        val live = focusedId?.takeIf { it in ids }
        // In 1+3, 2×3, 2×2 and 1×2 every card plays; on phones only the highlighted one,
        // and the rest show a picture.
        val playAll = wideScreen && tileLayout.separateTvs
        val playing = if (playAll) ids.take(tileLayout.columns * tileLayout.rows).toSet() else setOfNotNull(live)
        val allowed = inForeground && !showSettings && !listMode && !newsMode && !browseMode && !carouselMode && !stripMode && !duoMode && !Preview.metered(context)
        for (id in rowPreviews.keys.toList()) if (!allowed || id !in playing) release(id)
        for (id in pageTiles.keys.toList()) if (!allowed || id !in playing) pageTiles.remove(id)
        if (!allowed) return@LaunchedEffect
        delay(600)
        // With several videos at once, each plays smaller so the TV can decode them all.
        val low = playing.size > 2
        val quality = when {
            wideScreen && tileLayout == TileLayout.Six -> Quality.Lower
            low -> Quality.Low
            else -> Quality.Normal
        }
        // 1+3: the big player at normal quality, the small ones like 2×3.
        fun qualityOf(id: String) = when {
            bigPlayer && id == window.firstOrNull()?.id -> Quality.Normal
            bigPlayer -> Quality.Lower
            else -> quality
        }
        // A tile swapped into (or out of) the big player keeps playing at its new size.
        for ((id, p) in rowPreviews) if (id in playing) p.setQuality(qualityOf(id))
        suspend fun start(id: String) {
            val channel = state.channels.firstOrNull { it.id == id } ?: return
            if (failedPages[id] != true) MyChannel.pageFor(channel, BuildConfig.VERSION_CODE)?.let { pageTiles[id] = it; return }
            val p = pool.removeLastOrNull() ?: Preview.create(context)
            p.setQuality(qualityOf(id))
            p.setSound(previewSound && id == soundId)
            rowPreviews[id] = p
            p.stream.play(channel)
            if (low) delay(400) // one decoder at a time
        }
        for (id in playing) if (id !in rowPreviews && id !in pageTiles) start(id)
        if (low) {
            // A video that hasn't started yet gets one more try.
            delay(12_000)
            for (id in playing) if (rowPreviews[id]?.showing == false) { release(id); start(id) }
        }
        if (snapshots.size > 80) snapshots.clear()
        // One picture at a time: the channel opens muted in its card, the first frame is kept
        // and the channel closes again.
        // Each card gets one picture; it isn't refreshed.
        run {
            for (id in ids) {
                if (id in playing || id in snapshots) continue
                val channel = state.channels.firstOrNull { it.id == id } ?: continue
                if (YouTube.isYouTube(channel.url)) continue // plays only in YouTube's player; its picture shows
                if (MyChannel.pageFor(channel, BuildConfig.VERSION_CODE) != null) continue
                val p = pool.removeLastOrNull() ?: Preview.create(context)
                p.setQuality(Quality.Normal)
                p.setSound(false)
                rowPreviews[id] = p
                try {
                    p.stream.play(channel)
                    withTimeoutOrNull(10_000) { snapshotFlow { p.showing }.first { it } }
                    if (p.showing) delay(300) // release() keeps this frame
                } finally {
                    release(id)
                }
                delay(500)
            }
        }
    }
    // 1+3: the big player always comes first. When it starts dropping frames (the TV is short of
    // power), the side tiles pause one by one on their last picture; once the big player has run
    // smoothly for a while, they play again one by one.
    LaunchedEffect(bigPlayer, soundId, inForeground) {
        if (!bigPlayer || !inForeground) return@LaunchedEffect
        val bigId = soundId ?: return@LaunchedEffect
        val paused = mutableListOf<Pair<String, Preview>>()
        fun resume(id: String, p: Preview) {
            if (rowPreviews[id] === p) p.stream.player.run { seekToDefaultPosition(); play() }
        }
        try {
            var last = -1
            var calm = 0
            while (true) {
                delay(2_000)
                val big = rowPreviews[bigId]
                val dropped = big?.stream?.player?.videoDecoderCounters?.droppedBufferCount
                if (big == null || !big.showing || dropped == null) { last = -1; continue }
                val delta = if (last < 0) 0 else dropped - last
                last = dropped
                paused.removeAll { (id, p) -> rowPreviews[id] !== p }
                if (delta > 4) {
                    calm = 0
                    rowPreviews.entries.lastOrNull { (id, p) -> id != bigId && paused.none { it.second === p } }
                        ?.let { (id, p) -> p.stream.player.pause(); paused += id to p }
                } else if (++calm >= 5 && paused.isNotEmpty()) {
                    calm = 0
                    paused.removeAt(paused.lastIndex).let { (id, p) -> resume(id, p) }
                }
            }
        } finally {
            paused.forEach { (id, p) -> resume(id, p) }
        }
    }
    // On TVs, the tile with the sound is the one being watched (counted for the owner's stats page).
    val watchedTile = soundId?.takeIf { wideScreen && !listMode && previewSound && inForeground && it in rowPreviews }
        ?.let { id -> state.channels.firstOrNull { it.id == id } }
    DisposableEffect(watchedTile?.id) {
        if (watchedTile != null) Watching.watch(rowPreviews, watchedTile)
        onDispose { Watching.stop(rowPreviews) }
    }
    LaunchedEffect(previewSound, soundId, rowPreviews.keys.toSet()) {
        // Pictures being taken stay silent; only the highlighted card has sound.
        rowPreviews.forEach { (id, p) -> p.setSound(previewSound && id == soundId) }
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> inForeground = false
                Lifecycle.Event.ON_START -> inForeground = true
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Back closes the search bar (and clears the search) instead of closing the app.
    BackHandler(enabled = searching) {
        onQueryChange("")
        searching = false
        scope.launch { delay(50); runCatching { searchButtonFocus.requestFocus() } }
    }
    // The Modes menu: every layout in one list, picked with OK.
    var modesOpen by remember { mutableStateOf(false) }
    fun pickLayout(next: TileLayout) {
        modesOpen = false
        tilesFull = false
        // Browse's search only applies there.
        if (tileLayout == TileLayout.Browse && next != TileLayout.Browse && state.query.isNotBlank()) onQueryChange("")
        if (next.separateTvs && !premium) {
            upsellFor = next
        } else if (Plans.ask("${next.label} mode", next.tier)) {
            // Cable TV shows its packages; the mode stays as it was.
        } else {
            tileLayout = next
            sessionTileLayout = tileLayout
        }
    }
    // Otherwise Back doesn't close the app at once: on a TV it first goes up to the top bar,
    // then it asks "Exit?" with Yes and No (the cursor starts on No).
    var topBarFocused by remember { mutableStateOf(false) }
    var exitOpen by remember { mutableStateOf(false) }
    BackHandler(enabled = !searching) {
        when {
            fullTiles -> tilesFull = false
            wideScreen && !topBarFocused -> runCatching { layoutButtonFocus.requestFocus() }
            // Browse never closes the app: Back on its rail opens the Modes menu instead.
            browseMode && !Edition.MAX -> modesOpen = true
            else -> exitOpen = true
        }
    }

    Scaffold(
        // Full-screen tiles: no top bar and nothing around the tiles, which stays pure black.
        containerColor = if (hideBars) Color.Black else MaterialTheme.colorScheme.background,
        contentWindowInsets = if (hideBars) WindowInsets(0) else ScaffoldDefaults.contentWindowInsets,
        topBar = {
            if (!hideBars) TopAppBar(
                title = {
                    if (searching) {
                        OutlinedTextField(
                            value = state.query,
                            onValueChange = { windowStart = 0; twoIds = emptyList(); onQueryChange(it) },
                            placeholder = { Text("Search channels") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else {
                        // Logo and title, with the clock and weather spread evenly underneath.
                        Column(Modifier.width(IntrinsicSize.Max)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                AppLogo(size = 32.dp)
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    state.title,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Clock()
                                if (Edition.HAS_WEATHER) WeatherNow()
                            }
                        }
                    }
                },
                actions = {
                    if (wideScreen) {
                        TextButton(
                            onClick = { modesOpen = true },
                            colors = ButtonDefaults.textButtonColors(contentColor = LocalContentColor.current),
                            modifier = Modifier.focusRequester(layoutButtonFocus).focusGlow(),
                        ) {
                            Icon(Icons.Filled.Tv, contentDescription = null)
                            Text("Modes", fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 6.dp))
                        }
                    }
                    if (onOpenVod != null) {
                        TextButton(
                            onClick = onOpenVod,
                            colors = ButtonDefaults.textButtonColors(contentColor = LocalContentColor.current),
                            modifier = Modifier.focusGlow(),
                        ) {
                            Icon(Icons.Filled.VideoLibrary, contentDescription = null)
                            Text("Library", fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 6.dp))
                        }
                    }
                    if (onOpenGames != null) {
                        if (wideScreen) {
                            TextButton(
                                onClick = onOpenGames,
                                colors = ButtonDefaults.textButtonColors(contentColor = LocalContentColor.current),
                                modifier = Modifier.focusGlow(),
                            ) {
                                Icon(Icons.Filled.SportsEsports, contentDescription = null)
                                Text("Games", fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 6.dp))
                            }
                        } else {
                            IconButton(onClick = onOpenGames, modifier = Modifier.focusGlow()) {
                                Icon(Icons.Filled.SportsEsports, contentDescription = "Games")
                            }
                        }
                    }
                    IconButton(
                        onClick = {
                            previewSound = !previewSound
                            prefs.edit().putBoolean(PREF_PREVIEW_SOUND, previewSound).apply()
                        },
                        modifier = Modifier.focusGlow(),
                    ) {
                        Icon(
                            if (previewSound) Icons.AutoMirrored.Filled.VolumeUp else Icons.AutoMirrored.Filled.VolumeOff,
                            contentDescription = if (previewSound) "Mute previews" else "Unmute previews",
                        )
                    }
                    IconButton(modifier = Modifier.focusRequester(searchButtonFocus).focusGlow(), onClick = {
                        if (searching) onQueryChange("")
                        searching = !searching
                    }) {
                        Icon(
                            if (searching) Icons.Filled.Close else Icons.Filled.Search,
                            contentDescription = if (searching) "Close search" else "Search",
                        )
                    }
                    IconButton(onClick = { showSettings = true }, modifier = Modifier.focusGlow()) {
                        Icon(Icons.Filled.Settings, contentDescription = "Settings")
                    }
                },
                modifier = Modifier.onFocusChanged { topBarFocused = it.hasFocus },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.loading,
            onRefresh = onRefresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            Column(Modifier.fillMaxSize()) {
                if (state.needsPlaylist) {
                    Message(
                        text = "Add a playlist to start watching.\n\nPaste a playlist link (M3U) from your TV " +
                            "provider, or open a playlist file saved on this device. " +
                            "${Edition.APP_NAME} doesn't include any channels.",
                        action = "Add a playlist",
                        onAction = { showSettings = true },
                        secondAction = "Try demo channels",
                        onSecondAction = onTryDemo,
                    )
                    return@Column
                }
                // One row: All, Favorites, then genres (countries are picked in Settings; favorites
                // also lead the list). All clears every filter; tapping a selected chip clears it.
                if (!hideBars) ChipRow(
                    focus = chipFocus,
                    items = listOf(FILTER_ALL, FILTER_FAVORITES) + state.categories,
                    selected = setOfNotNull(
                        FILTER_ALL.takeIf { state.filter == FILTER_ALL && state.category == null },
                        FILTER_FAVORITES.takeIf { state.filter == FILTER_FAVORITES },
                        state.category,
                    ),
                    onSelect = {
                        windowStart = 0
                        twoIds = emptyList()
                        when (it) {
                            FILTER_ALL -> onFilterChange(FILTER_ALL)
                            FILTER_FAVORITES ->
                                onFilterChange(if (state.filter == FILTER_FAVORITES) FILTER_ALL else FILTER_FAVORITES)
                            else -> onCategoryChange(it.takeUnless { c -> c == state.category })
                        }
                    },
                )
                if (!hideBars && !newsMode && !carouselMode && !stripMode && !duoMode && !state.loading && state.channels.isNotEmpty()) {
                    // The channel count. (The "advertise with us" ticker used to run beside it; since 1.9.58
                    // it runs along the bottom of the screen instead, see below.)
                    Row(
                        Modifier.fillMaxWidth().height(24.dp).padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "${state.visibleChannels.size} channels",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                val channels = state.visibleChannels
                when {
                    browseMode -> BrowseMode(
                        channels = state.channels.filter { state.languageFilter.isEmpty() || it.language in state.languageFilter },
                        favorites = state.favorites,
                        lastWatchedId = state.lastWatchedId,
                        query = state.query,
                        onQueryChange = onQueryChange,
                        sound = previewSound,
                        playing = inForeground && !showSettings,
                        modeFocus = layoutButtonFocus,
                        modeLabel = "Modes",
                        // Phones have no other layout to go to.
                        onNextMode = if (wideScreen) ({ modesOpen = true }) else null,
                        onOpen = onPlay,
                        onOpenGames = onOpenGames,
                        onOpenVodItem = onOpenVodItem,
                        onOpenSettings = { showSettings = true },
                        onRailFocused = { topBarFocused = it },
                    )
                    carouselMode -> CarouselMode(
                        channels = state.channels.filter { state.languageFilter.isEmpty() || it.language in state.languageFilter },
                        favorites = state.favorites,
                        lastWatchedId = state.lastWatchedId,
                        sound = previewSound,
                        playing = inForeground && !showSettings,
                        focus = newsFocus,
                        onWatch = onWatch,
                        onOpen = onPlay,
                        onToggleFavorite = onToggleFavorite,
                        onBack = {
                            newsBar = true
                            scope.launch {
                                withFrameNanos { }
                                withFrameNanos { }
                                runCatching { layoutButtonFocus.requestFocus() }
                            }
                        },
                        onFocused = { newsBar = false },
                    )
                    stripMode -> StripMode(
                        channels = state.channels.filter { state.languageFilter.isEmpty() || it.language in state.languageFilter },
                        favorites = state.favorites,
                        lastWatchedId = state.lastWatchedId,
                        sound = previewSound,
                        playing = inForeground && !showSettings,
                        focus = newsFocus,
                        onWatch = onWatch,
                        onOpen = onPlay,
                        onToggleFavorite = onToggleFavorite,
                        onModes = { modesOpen = true },
                        onBack = {
                            newsBar = true
                            scope.launch {
                                withFrameNanos { }
                                withFrameNanos { }
                                runCatching { layoutButtonFocus.requestFocus() }
                            }
                        },
                        onFocused = { newsBar = false },
                    )
                    duoMode -> DuoMode(
                        channels = state.channels.filter { state.languageFilter.isEmpty() || it.language in state.languageFilter },
                        favorites = state.favorites,
                        lastWatchedId = state.lastWatchedId,
                        playing = inForeground && !showSettings,
                        focus = newsFocus,
                        onOpen = onPlay,
                        onToggleFavorite = onToggleFavorite,
                        onModes = { modesOpen = true },
                        onBack = {
                            newsBar = true
                            scope.launch {
                                withFrameNanos { }
                                withFrameNanos { }
                                runCatching { layoutButtonFocus.requestFocus() }
                            }
                        },
                        onFocused = { newsBar = false },
                    )
                    state.error != null && state.channels.isEmpty() -> Message(
                        text = state.error,
                        action = "Retry",
                        onAction = onRefresh,
                    )
                    !state.loading && channels.isEmpty() -> Message(
                        text = if (state.filter == FILTER_FAVORITES) {
                            "No favorites yet. Long-press a channel or tap its star to add one."
                        } else {
                            "No channels match."
                        },
                    )
                    // Tiles are sized so the screen holds whole rows, and the remote scrolls a
                    // row at a time, so no tile is ever cut off at the top or bottom. Each
                    // tile's picture is 16:9, so a playing channel fills it edge to edge.
                    newsMode -> NewsMode(
                        cp24 = tileLayout == TileLayout.Cp24,
                        home = tileLayout == TileLayout.Home,
                        mine = tileLayout == TileLayout.Mine,
                        channels = channels,
                        all = state.channels,
                        selectedId = listChannelId ?: state.lastWatchedId,
                        sound = previewSound,
                        playing = inForeground && !showSettings,
                        favorites = state.favorites,
                        focus = newsFocus,
                        onSelect = { listChannelId = it.id; onWatch(it) },
                        onOpen = onPlay,
                        onBack = {
                            newsBar = true
                            scope.launch {
                                withFrameNanos { }
                                withFrameNanos { }
                                runCatching { layoutButtonFocus.requestFocus() }
                            }
                        },
                        onFocused = { newsBar = false },
                    )
                    listMode -> PlayerWithList(
                        channels = channels,
                        all = state.channels,
                        selectedId = listChannelId ?: state.lastWatchedId,
                        sound = previewSound,
                        playing = inForeground && !showSettings,
                        favorites = state.favorites,
                        onToggleFavorite = onToggleFavorite,
                        focusId = state.lastWatchedId,
                        focus = lastWatchedFocus,
                        onSelect = { listChannelId = it.id; onWatch(it) },
                        onOpen = onPlay,
                    )
                    else -> BoxWithConstraints(Modifier.fillMaxSize().then(if (fullTiles || bigPlayer) Modifier.background(Color.Black) else Modifier)) {
                    // TVs and tablets: the chosen layout (16, 6, 4 or 2 tiles). Phones: as many as fit.
                    val gap = 14.dp
                    val wide = windowed
                    val fitColumns = if (wide) tileLayout.columns else max(1, ((maxWidth - gap) / (MinTileWidth + gap)).toInt())
                    val naturalHeight = (maxWidth - gap * (fitColumns + 1)) / fitColumns * 9f / 16f + TileTextHeight
                    val rows = if (wide) tileLayout.rows else max(1, ((maxHeight - gap) / (naturalHeight + gap)).roundToInt())
                    val tileHeight = (maxHeight - gap * (rows + 1)) / rows
                    val pictureWidth = (tileHeight - TileTextHeight) * 16f / 9f
                    val tileWidth = minOf(pictureWidth, (maxWidth - gap * (fitColumns + 1)) / fitColumns)
                    val columns = if (wide) fitColumns else max(1, ((maxWidth - gap) / (tileWidth + gap)).toInt())
                    // When the width decides the tile size, spread the spare height between the rows
                    // so exactly [rows] rows show and the next row stays off screen.
                    // Full screen: 16:9 cells packed together and centred, so no black bands between rows.
                    val fullHeight = minOf(maxWidth / columns * 9f / 16f, maxHeight / rows)
                    val cardHeight = if (fullTiles) fullHeight else tileWidth * 9f / 16f + TileTextHeight
                    val rowGap = if (fullTiles) 0.dp else maxOf(gap, (maxHeight - cardHeight * rows) / (rows + 1))
                    // Likewise across: when the height decides the tile size, widen the gaps so the
                    // grid fits exactly [columns] tiles in a row (a bit under, so rounding can't drop one).
                    val columnGap = when {
                        fullTiles -> 0.dp
                        wide -> maxOf(gap, (maxWidth - tileWidth * columns) / (columns + 1) - 1.dp)
                        else -> gap
                    }
                    val cellWidth = if (fullTiles) fullHeight * 16f / 9f else tileWidth
                    // TVs, 1×2, 2×2 and 2×3: the tiles touch, edge to edge across the screen at 16:9,
                    // (no sponsor banner under them since 1.9.32).
                    // When the screen isn't tall enough for that, the tiles get shorter and their
                    // pictures stretch a little (at most a quarter wider than 16:9) to keep the width.
                    val packed = wide && !fullTiles && !bigPlayer
                    val hasAd = false
                    val minBanner = if (hasAd) 48.dp else 0.dp
                    val packedNaturalWidth = maxWidth / columns
                    val packedFits = packedNaturalWidth * 9f / 16f * rows + minBanner <= maxHeight
                    val sharedHeight = if (packedFits) packedNaturalWidth * 9f / 16f else (maxHeight - minBanner) / rows
                    // 2×2 always spans the whole width (its pictures stretch), so there are no black bands at the sides.
                    val sharedWidth = if (packedFits || tileLayout == TileLayout.Four) packedNaturalWidth else minOf(packedNaturalWidth, sharedHeight * 16f / 9f * 1.25f)
                    // 1×2: the banner is the size 2×3's gets, and the two players sit in the middle with
                    // the same gap above, between, beside and below them (and around the banner).
                    val evenTwo = packed && tileLayout == TileLayout.Two
                    val sixBanner = run {
                        val natural = maxWidth / 3 * 9f / 16f
                        val height = if (natural * 2 + minBanner <= maxHeight) natural else (maxHeight - minBanner) / 2
                        if (hasAd) minOf(maxHeight - height * 2 - 8.dp, maxWidth / 8) else 0.dp
                    }.coerceAtLeast(0.dp)
                    val twoBanner = if (sixBanner >= 36.dp) sixBanner else 0.dp
                    // 1×2 (owner, 1.9.61): the two players fill the whole width, side by side and touching in
                    // the middle, no black at the sides or between them; centred top to bottom.
                    val twoGap = 0.dp
                    val packedWidth = if (evenTwo) maxWidth / 2 else sharedWidth
                    val packedHeight = if (evenTwo) minOf(packedWidth * 9f / 16f, maxHeight) else sharedHeight
                    val twoTop = if (evenTwo) ((maxHeight - packedHeight) / 2).coerceAtLeast(0.dp) else 0.dp
                    val bannerSpace = if (evenTwo) maxHeight - twoGap - packedHeight else maxHeight - packedHeight * rows
                    val bannerHeight = if (evenTwo) twoBanner else minOf(bannerSpace - 8.dp, maxWidth / 8)
                    @Composable
                    fun Tile(
                        index: Int,
                        channel: Channel,
                        onKey: (KeyEvent) -> Boolean,
                        onFocused: () -> Unit = {},
                        arrows: Boolean = false,
                        onOpen: () -> Unit = {},
                        height: Dp = cardHeight,
                        keepName: Boolean = false,
                        favoriteBadge: Boolean = false,
                        stretch: Boolean = false,
                        onClick: () -> Unit = { onOpen(); onPlay(channel) },
                    ) =
                        ChannelCard(
                            height = height,
                            channel = channel,
                            favorite = channel.id in state.favorites,
                            onClick = onClick,
                            bare = fullTiles || bigPlayer || packed,
                            sound = if (bigPlayer) channel.id == soundId else null,
                            keepName = keepName,
                            favoriteBadge = favoriteBadge,
                            stretch = stretch,
                            glow = !windowed,
                            onToggleFavorite = { onToggleFavorite(channel) },
                            focusRequester = cardRequester(channel.id),
                            onKey = onKey,
                            onFocusChange = { focused ->
                                if (focused) {
                                    focusedId = channel.id
                                    onFocused()
                                }
                            },
                            preview = rowPreviews[channel.id],
                            page = pageTiles[channel.id]?.let { if (previewSound && channel.id == soundId) it else "$it&mute=1" },
                            onPageFailed = {
                                if (MyChannel.webPage(channel) != null) {
                                    failedPages[channel.id] = true
                                    pageTiles.remove(channel.id)
                                }
                            },
                            snapshot = snapshots[channel.id],
                            arrows = arrows,
                        )
                    if (wide) {
                        // A fixed window of tiles that slides along the list. Only Left and Right
                        // change channels: they move the highlight, and past the last (or first) tile
                        // every channel moves along one place and one new channel comes in. Up goes
                        // to the layout button and Down does nothing.
                        // 2×1 (and 2×2, where Left and Right go round all four tiles): Left and Right
                        // move the highlight (and the sound) between the two
                        // sides, Up and Down change the highlighted side's channel, holding Up goes to
                        // the filter row, and Back goes up to the top bar.
                        fun twoKey(channel: Channel): (KeyEvent) -> Boolean = onKey@{ event ->
                            if (event.key == Key.Back) {
                                // Taken on both press and release, so the app doesn't also go back.
                                if (event.type == KeyEventType.KeyUp) {
                                    if (fullTiles) tilesFull = false else runCatching { layoutButtonFocus.requestFocus() }
                                }
                                return@onKey true
                            }
                            // Up changes channel when it's let go, unless it was held down.
                            if (event.key == Key.DirectionUp && event.type == KeyEventType.KeyDown) {
                                if (event.nativeKeyEvent.repeatCount == 0) upHeld = false
                                if (event.nativeKeyEvent.repeatCount == 1) {
                                    upHeld = true
                                    if (!fullTiles) runCatching { chipFocus.requestFocus() }
                                }
                                return@onKey true
                            }
                            val up = event.key == Key.DirectionUp && event.type == KeyEventType.KeyUp
                            if (up && upHeld) {
                                upHeld = false
                                return@onKey true
                            }
                            if (!up && event.type != KeyEventType.KeyDown) return@onKey false
                            val side = window.indexOfFirst { it.id == channel.id }
                            val others = window.map { it.id }.toSet() - channel.id
                            // 2×2 and 2×3: Left and Right go round all the tiles in reading order.
                            val loop = window.size > 2
                            val target = when {
                                event.key == Key.DirectionLeft ->
                                    window.getOrNull(if (loop) (side - 1 + window.size) % window.size else side - 1)
                                event.key == Key.DirectionRight ->
                                    window.getOrNull(if (loop) (side + 1) % window.size else side + 1)
                                up || event.key == Key.DirectionDown -> {
                                    val step = if (up) -1 else 1
                                    var j = channels.indexOfFirst { it.id == channel.id } + step
                                    while (channels.getOrNull(j)?.id.let { it != null && it in others }) j += step
                                    channels.getOrNull(j)?.also { next ->
                                        twoIds = window.map { if (it.id == channel.id) next.id else it.id }
                                    }
                                }
                                else -> return@onKey false
                            }
                            target?.let { next ->
                                scope.launch {
                                    withFrameNanos { }
                                    runCatching { cardRequester(next.id).requestFocus() }
                                }
                            }
                            true
                        }
                        fun onKey(index: Int): (KeyEvent) -> Boolean = onKey@{ event ->
                            if (event.type != KeyEventType.KeyDown) return@onKey false
                            val first = windowStart.coerceIn(0, max(0, channels.size - slots))
                            val last = first + slots - 1
                            val canSlideOn = first + slots < channels.size
                            val target = when (event.key) {
                                Key.DirectionUp -> {
                                    runCatching { layoutButtonFocus.requestFocus() }
                                    return@onKey true
                                }
                                Key.DirectionRight -> when {
                                    index < last -> index + 1
                                    canSlideOn -> { windowStart = first + 1; index + 1 }
                                    else -> null
                                }
                                Key.DirectionLeft -> when {
                                    index > first -> index - 1
                                    first > 0 -> { windowStart = first - 1; index - 1 }
                                    else -> null
                                }
                                Key.DirectionDown -> null
                                else -> return@onKey false
                            }
                            channels.getOrNull(target ?: -1)?.let { next ->
                                scope.launch {
                                    withFrameNanos { }
                                    runCatching { cardRequester(next.id).requestFocus() }
                                }
                            }
                            true
                        }
                        if (bigPlayer) {
                            // 1+3: the big player in the top left corner (85% of the width, or the full
                            // height if that's less), and three small tiles on the right, together exactly as
                            // tall as it. Up/Down move through them, and past either end the column slides on by
                            // one channel (a new one comes in, the one at the other end goes). OK on a
                            // small tile swaps it into the big player; OK on the big player opens it.
                            val bigWidth = minOf(maxWidth * 0.85f, maxHeight * 16f / 9f)
                            val bigHeight = bigWidth * 9f / 16f
                            val smallWidth = maxWidth - bigWidth
                            // The three side tiles share the big player's height exactly, top to bottom,
                            // their pictures stretched to fill them (no sponsor picture under them since 1.9.30).
                            val smallHeight = bigHeight / 3
                            val big = window.firstOrNull()
                            val column = window.drop(1)
                            fun focus(id: String) = scope.launch {
                                withFrameNanos { }
                                runCatching { cardRequester(id).requestFocus() }
                            }
                            // Slides the column one channel along (+1 next, -1 previous), skipping the
                            // channels already showing, and highlights the one that came in.
                            fun slide(step: Int) {
                                val list = column
                                if (list.isEmpty()) return
                                val shown = window.map { it.id }.toSet()
                                val from = channels.indexOfFirst { it.id == (if (step > 0) list.last() else list.first()).id }
                                var j = from + step
                                while (channels.getOrNull(j)?.id.let { it != null && it in shown }) j += step
                                val next = channels.getOrNull(j) ?: return
                                val moved = if (step > 0) list.drop(1) + next else listOf(next) + list.dropLast(1)
                                twoIds = (listOfNotNull(big) + moved).map { it.id }
                                focus(next.id)
                            }
                            fun backKey(event: KeyEvent): Boolean {
                                if (event.type == KeyEventType.KeyUp) {
                                    runCatching { layoutButtonFocus.requestFocus() }
                                }
                                return true
                            }
                            fun bigKey(event: KeyEvent): Boolean {
                                if (event.key == Key.Back) return backKey(event)
                                if (event.type != KeyEventType.KeyDown) return false
                                when (event.key) {
                                    Key.DirectionRight -> column.firstOrNull()?.let { focus(it.id) }
                                    Key.DirectionUp -> runCatching { layoutButtonFocus.requestFocus() }
                                    Key.DirectionDown -> runCatching { favoriteButtonFocus.requestFocus() }
                                    Key.DirectionLeft -> Unit
                                    else -> return false
                                }
                                return true
                            }
                            fun smallKey(index: Int): (KeyEvent) -> Boolean = onKey@{ event ->
                                if (event.key == Key.Back) return@onKey backKey(event)
                                if (event.type != KeyEventType.KeyDown) return@onKey false
                                fun move(step: Int) {
                                    column.getOrNull(index + step)?.let { focus(it.id) } ?: slide(step)
                                }
                                when (event.key) {
                                    Key.DirectionDown -> move(1)
                                    Key.DirectionUp -> move(-1)
                                    Key.DirectionRight -> Unit
                                    Key.DirectionLeft -> big?.let { focus(it.id) }
                                    else -> return@onKey false
                                }
                                true
                            }
                            @Composable
                            fun SmallTile(index: Int, small: Channel) = key(small.id) {
                                Box(Modifier.width(smallWidth)) {
                                    Tile(0, small, smallKey(index), height = smallHeight, keepName = true, stretch = true, onClick = {
                                        val bigId = big?.id
                                        twoIds = window.map {
                                            when (it.id) {
                                                bigId -> small.id
                                                small.id -> bigId ?: it.id
                                                else -> it.id
                                            }
                                        }
                                        focus(small.id)
                                    })
                                }
                            }
                            Column(Modifier.fillMaxSize()) {
                            Row(Modifier.fillMaxWidth().height(bigHeight)) {
                                Box(Modifier.width(bigWidth)) {
                                    big?.let {
                                        key(it.id) {
                                            Tile(0, it, { e -> bigKey(e) }, height = bigHeight, favoriteBadge = true, onClick = {
                                                sessionOpenedTile = 0
                                                onPlay(it)
                                            })
                                        }
                                    }
                                }
                                Column(Modifier.width(smallWidth).fillMaxHeight()) {
                                    column.forEachIndexed { i, small -> SmallTile(i, small) }
                                }
                            }
                            // Under the big player: add it to (or remove it from) Favorites.
                            big?.let { channel ->
                                val isFavorite = channel.id in state.favorites
                                var buttonFocused by remember { mutableStateOf(false) }
                                Row(
                                    Modifier
                                        .padding(start = 12.dp, top = 8.dp)
                                        .focusRequester(favoriteButtonFocus)
                                        .onFocusChanged { buttonFocused = it.hasFocus }
                                        .onPreviewKeyEvent { e ->
                                            when {
                                                e.key == Key.Back -> backKey(e)
                                                e.type != KeyEventType.KeyDown -> false
                                                e.key == Key.DirectionUp -> { focus(channel.id); true }
                                                e.key == Key.DirectionRight -> { column.firstOrNull()?.let { focus(it.id) }; true }
                                                e.key == Key.DirectionDown || e.key == Key.DirectionLeft -> true
                                                else -> false
                                            }
                                        }
                                        .background(if (buttonFocused) Color.White.copy(alpha = 0.15f) else Color.Transparent, ChipShape)
                                        .border(1.dp, if (buttonFocused) FocusColor.copy(alpha = 0.7f) else Color.White.copy(alpha = 0.3f), ChipShape)
                                        .clickable(
                                            interactionSource = remember { MutableInteractionSource() },
                                            indication = null,
                                        ) { onToggleFavorite(channel) }
                                        .padding(horizontal = 14.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(
                                        if (isFavorite) Icons.Filled.Star else Icons.Outlined.StarBorder,
                                        contentDescription = null,
                                        tint = if (isFavorite) FocusColor else Color.White,
                                        modifier = Modifier.size(20.dp),
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text(
                                        if (isFavorite) "In Favorites (OK to remove)" else "Add to Favorites",
                                        color = Color.White,
                                        style = MaterialTheme.typography.labelLarge,
                                    )
                                }
                            }
                            }
                        } else
                        Column(
                            when {
                                evenTwo -> Modifier.fillMaxSize().padding(top = twoTop)
                                packed -> Modifier.fillMaxSize()
                                else -> Modifier.fillMaxSize().padding(vertical = rowGap)
                            },
                            verticalArrangement = when {
                                evenTwo -> Arrangement.Top
                                packed -> if (hasAd) Arrangement.Top else Arrangement.Center
                                fullTiles -> Arrangement.Center
                                else -> Arrangement.spacedBy(rowGap)
                            },
                        ) {
                            window.chunked(columns).forEachIndexed { r, row ->
                                Row(
                                    Modifier.fillMaxWidth().padding(horizontal = if (evenTwo) twoGap else if (packed) 0.dp else columnGap),
                                    horizontalArrangement = Arrangement.spacedBy(if (evenTwo) twoGap else if (packed) 0.dp else columnGap, Alignment.CenterHorizontally),
                                ) {
                                    row.forEachIndexed { c, channel ->
                                        // Keyed by channel, so a playing card slides over without restarting.
                                        key(channel.id) {
                                            Box(Modifier.width(if (packed) packedWidth else cellWidth)) {
                                                if (tileLayout.separateTvs) {
                                                    // OK fills the screen with the tiles; OK again opens the channel.
                                                    val open = { sessionOpenedTile = window.indexOfFirst { it.id == channel.id } }
                                                    Tile(0, channel, twoKey(channel), arrows = channel.id == focusedId && !fullTiles,
                                                        onOpen = open,
                                                        height = if (packed) packedHeight else cardHeight,
                                                        keepName = packed,
                                                        stretch = packed,
                                                        onClick = { if (fullTiles) { open(); onPlay(channel) } else tilesFull = true })
                                                } else {
                                                    // A grid where only the highlighted tile plays (no layout uses this now).
                                                    Tile(start + r * columns + c, channel, onKey(start + r * columns + c),
                                                        onClick = { if (fullTiles) onPlay(channel) else tilesFull = true })
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                    val cards: LazyGridScope.() -> Unit = {
                        itemsIndexed(channels, key = { _, it -> it.id }) { index, channel ->
                            Tile(index, channel, onKey = { false }, onFocused = {
                                // The grid moves a whole row at a time and never shows half rows.
                                val at = index / columns
                                val offset = gridState.firstVisibleItemScrollOffset
                                val top = gridState.firstVisibleItemIndex / columns + if (offset > 0) 1 else 0
                                val newTop = when {
                                    at < top -> at
                                    at > top + rows - 1 -> at - rows + 1
                                    else -> top
                                }
                                // Scroll only when the highlight leaves what's on screen.
                                if (newTop != top || offset != 0) {
                                    scope.launch { gridState.scrollToItem(newTop * columns) }
                                }
                            })
                        }
                    }
                    // The default "scroll just enough to show the focused tile" is turned off and
                    // the grid jumps straight to the row instead.
                    CompositionLocalProvider(LocalBringIntoViewSpec provides NoBringIntoView) {
                        LazyVerticalGrid(
                            columns = GridCells.FixedSize(tileWidth),
                            contentPadding = PaddingValues(horizontal = columnGap, vertical = rowGap),
                            horizontalArrangement = Arrangement.spacedBy(columnGap, Alignment.CenterHorizontally),
                            verticalArrangement = Arrangement.spacedBy(rowGap),
                            state = gridState,
                            modifier = Modifier.fillMaxSize(),
                            content = cards,
                        )
                    }
                    }
                    // 1×2, 2×2 and 2×3: Cable TV's sponsor banner, centred in the space under the tiles.
                    if (packed && hasAd && bannerHeight >= 36.dp) {
                        Box(
                            Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(bannerSpace),
                            contentAlignment = Alignment.Center,
                        ) {
                            EditionSponsorBar(Modifier.height(bannerHeight))
                        }
                    }
                    }
                }
            }
            // Cable TV's "advertise with us" line along the bottom of every channel screen (owner's rule,
            // 1.9.58): 1+List, the tile layouts and their full-screen tiles, Browse, Carousel, Strip and Duo.
            // News, CP24, Home and My Screen have their own band at the bottom.
            if (!newsMode && !state.needsPlaylist) {
                EditionTicker(
                    Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(36.dp),
                    big = true,
                    band = true,
                )
            }
        }
    }

    if (showSettings) settings { showSettings = false }
    if (exitOpen) ExitDialog(onExit = { (context as? Activity)?.finish() }, onDismiss = { exitOpen = false })
    if (modesOpen) {
        ModesMenu(
            current = tileLayout,
            locked = { it.separateTvs && !premium },
            needs = { if (Plans.allows(it.tier)) null else it.tier.label },
            onPick = ::pickLayout,
            onDismiss = { modesOpen = false },
        )
    }
    upsellFor?.let { wanted ->
        PremiumDialog(
            layout = wanted.label,
            onSubscribe = { option -> (context as? Activity)?.let { Premium.billing?.subscribe(it, option) } },
            onDismiss = {
                // Skip past the Premium layouts to the next free one.
                tileLayout = TileLayout.entries.drop(wanted.ordinal).firstOrNull { !it.separateTvs } ?: TileLayout.entries.first()
                sessionTileLayout = tileLayout
                upsellFor = null
            },
        )
    }
}

/** What each mode is, under its name in the Modes menu. */
private val TileLayout.about: String
    get() = when (this) {
        TileLayout.List -> "One channel with the channel list beside it"
        TileLayout.Browse -> "Rows of big channel cards, like a streaming app"
        TileLayout.Carousel -> "One big channel in the middle, slide left and right"
        TileLayout.Strip -> "A big channel on top, channel tiles along the bottom"
        TileLayout.Duo -> "Two channels playing on top, channel cards below"
        TileLayout.Five -> "One big channel and three small ones"
        TileLayout.Two -> "Two channels side by side"
        TileLayout.Four -> "Four channels at once"
        TileLayout.Six -> "Six channels at once"
        TileLayout.News -> "Your channel with weather, markets and stories"
        TileLayout.Cp24 -> "A big channel with the clock and weather, CP24 style"
        TileLayout.Home -> "Your channel with cards around it"
        TileLayout.Mine -> "A screen you build yourself"
    }

private val TileLayout.icon: androidx.compose.ui.graphics.vector.ImageVector
    get() = when (this) {
        TileLayout.List -> Icons.Filled.ViewSidebar
        TileLayout.Browse -> Icons.Filled.ViewCarousel
        TileLayout.Carousel -> Icons.Filled.ViewArray
        TileLayout.Strip -> Icons.Filled.ViewDay
        TileLayout.Duo -> Icons.Filled.VerticalSplit
        TileLayout.Five -> Icons.Filled.ViewQuilt
        TileLayout.Two -> Icons.Filled.ViewColumn
        TileLayout.Four -> Icons.Filled.GridView
        TileLayout.Six -> Icons.Filled.Apps
        TileLayout.News -> Icons.Filled.Public
        TileLayout.Cp24 -> Icons.Filled.Schedule
        TileLayout.Home -> Icons.Filled.Home
        TileLayout.Mine -> Icons.Filled.Dashboard
    }

/**
 * The Modes menu: every mode in one list, with a line about each and a tick on the one in use.
 * Up and Down move, OK switches to that mode, Back closes it.
 */
@Composable
private fun ModesMenu(
    current: TileLayout,
    /** Live TV Plus: the modes that need Premium. */
    locked: (TileLayout) -> Boolean,
    /** Cable TV: the package a mode needs, when the viewer's package doesn't have it. */
    needs: (TileLayout) -> String? = { null },
    onPick: (TileLayout) -> Unit,
    onDismiss: () -> Unit,
) {
    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        val first = remember { FocusRequester() }
        LaunchedEffect(Unit) {
            withFrameNanos { }
            runCatching { first.requestFocus() }
        }
        androidx.compose.material3.Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.widthIn(min = 300.dp, max = 460.dp),
        ) {
            Column(
                Modifier
                    .verticalScroll(androidx.compose.foundation.rememberScrollState())
                    .padding(vertical = 12.dp, horizontal = 10.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    "Modes",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 10.dp, bottom = 6.dp),
                )
                layouts.forEach { layout ->
                    val on = layout == current
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .then(if (on) Modifier.focusRequester(first) else Modifier)
                            .focusGlow(ChipShape)
                            .clip(ChipShape)
                            .background(if (on) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f) else Color.Transparent)
                            .clickable { onPick(layout) }
                            .padding(horizontal = 10.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(layout.icon, contentDescription = null, modifier = Modifier.size(24.dp))
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                layout.label + when {
                                    locked(layout) -> "  · Premium"
                                    needs(layout) != null -> "  · 🔒 ${needs(layout)}"
                                    else -> ""
                                },
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                layout.about,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        if (on) Icon(Icons.Filled.Check, contentDescription = "In use", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

/** Asks before closing the app. The cursor starts on No, so a stray OK keeps watching. */
@Composable
private fun ExitDialog(onExit: () -> Unit, onDismiss: () -> Unit) {
    val no = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        withFrameNanos { }
        runCatching { no.requestFocus() }
    }
    SettingsTheme {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Exit ${androidx.compose.ui.res.stringResource(R.string.app_name)}?") },
            confirmButton = {
                TextButton(onClick = onExit, modifier = Modifier.focusGlow()) { Text("Yes") }
            },
            dismissButton = {
                TextButton(onClick = onDismiss, modifier = Modifier.focusRequester(no).focusGlow()) { Text("No") }
            },
        )
    }
}

/** Live TV Plus: offers Premium when a Premium layout is picked, with a button per plan length. */
@Composable
private fun PremiumDialog(layout: String, onSubscribe: (option: Int) -> Unit, onDismiss: () -> Unit) {
    val price by remember { Premium.billing?.price ?: MutableStateFlow<String?>(null) }.collectAsStateWithLifecycle()
    val options by remember {
        Premium.billing?.options ?: MutableStateFlow<List<Premium.Option>>(emptyList())
    }.collectAsStateWithLifecycle()
    SettingsTheme {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("$layout is Premium") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Watch two, four or six channels at once with the 1×2, 2×2 and 2×3 layouts. " +
                            "Premium is ${price ?: "a small monthly price"} a month through Google Play (or less with 6 months " +
                            "or a year), works on every phone and TV signed in to your Google account, and you can " +
                            "cancel any time in Google Play."
                    )
                    options.forEachIndexed { i, o ->
                        OutlinedButton(onClick = { onSubscribe(i) }, modifier = Modifier.fillMaxWidth().focusGlow()) {
                            Text("${o.label}: ${o.price}")
                        }
                    }
                }
            },
            confirmButton = {
                if (options.isEmpty()) {
                    TextButton(onClick = { onSubscribe(0) }, modifier = Modifier.focusGlow()) { Text("Get Premium") }
                }
            },
            dismissButton = {
                TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Not now") }
            },
        )
    }
}

@Composable
private fun ChipRow(focus: FocusRequester, items: List<String>, selected: Set<String>, onSelect: (String) -> Unit) {
    // Without the extra invisible touch margin around chips, the focus glow hugs the chip's edges.
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
        ChipRowContent(focus, items, selected, onSelect)
    }
}

@Composable
private fun ChipRowContent(focus: FocusRequester, items: List<String>, selected: Set<String>, onSelect: (String) -> Unit) {
    // Holding Up in 2×1 lands on the selected chip (or All).
    val focusItem = items.firstOrNull { it in selected } ?: items.firstOrNull()
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(items, key = { it }) { item ->
            FilterChip(
                selected = item in selected,
                onClick = { onSelect(item) },
                label = { Text(item) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = AccentBlue,
                    selectedLabelColor = Color.White,
                    selectedLeadingIconColor = Color.White,
                ),
                modifier = Modifier
                    .then(if (item == focusItem) Modifier.focusRequester(focus) else Modifier)
                    .focusGlow(ChipShape),
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChannelCard(
    height: Dp,
    channel: Channel,
    favorite: Boolean,
    onClick: () -> Unit,
    onToggleFavorite: () -> Unit,
    focusRequester: FocusRequester? = null,
    onKey: (KeyEvent) -> Boolean = { false },
    onFocusChange: (Boolean) -> Unit = {},
    preview: Preview? = null,
    /** Our YouTube page for the channel, playing in the card instead of [preview] (1.9.60). */
    page: String? = null,
    onPageFailed: () -> Unit = {},
    snapshot: ImageBitmap? = null,
    /** Up and down arrows: Up and Down change this card's channel (2×1). */
    arrows: Boolean = false,
    /** Full-screen tiles: just the video, the speaker when highlighted, the name for a moment. */
    bare: Boolean = false,
    /**
     * The yellow highlight. The TV layouts turn it off: the picture stays black around the video
     * and a small speaker marks the tile with the sound.
     */
    glow: Boolean = true,
    /** Whether the speaker shows; null shows it on the highlighted card (1+3 keeps it on the big player). */
    sound: Boolean? = null,
    /** Keeps the channel number and name showing, small (the 1+3 side tiles). */
    keepName: Boolean = false,
    /** Shows a star when the channel is a favorite (the 1+3 big player). */
    favoriteBadge: Boolean = false,
    /** Stretches the picture to fill the tile, whatever its shape (the 1+3 side tiles). */
    stretch: Boolean = false,
) {
    if (bare) {
        var focused by remember { mutableStateOf(false) }
        var showName by remember { mutableStateOf(true) }
        LaunchedEffect(Unit) { delay(3_000); showName = false }
        Box(
            Modifier
                .fillMaxWidth()
                .height(height)
                .background(Color.Black)
                .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
                .onPreviewKeyEvent(onKey)
                .onFocusChanged { focused = it.hasFocus; onFocusChange(it.hasFocus) }
                // No highlight tint over the picture; the thin border below marks the tile.
                .combinedClickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onClick,
                    onLongClick = onToggleFavorite,
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (snapshot != null) {
                Image(
                    snapshot,
                    contentDescription = null,
                    contentScale = if (stretch) ContentScale.FillBounds else ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            if (page != null) key(page) { WebPreview(page, Modifier.fillMaxSize(), onFallback = onPageFailed) }
            else if (preview != null) PreviewVideo(preview, stretch)
            if (arrows) {
                Column(
                    Modifier
                        .align(Alignment.CenterEnd)
                        .padding(8.dp)
                        .background(Color.Black.copy(alpha = 0.55f), ChipShape)
                        .padding(4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(Icons.Filled.KeyboardArrowUp, contentDescription = null, tint = Color.White)
                    Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Color.White)
                }
            }
            if (keepName) {
                Text(
                    if (channel.number > 0) "${channel.number}  ${channel.name}" else channel.name,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(4.dp)
                        .background(Color.Black.copy(alpha = 0.6f), ChipShape)
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            } else if (showName) {
                Text(
                    channel.name,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(12.dp)
                        .background(Color.Black.copy(alpha = 0.6f), ChipShape)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
            // A thin, soft yellow line marks the tile with the sound.
            if (focused) Box(Modifier.fillMaxSize().border(1.dp, FocusColor.copy(alpha = 0.7f)))
            if (sound ?: focused) SoundBadge(Modifier.align(Alignment.TopEnd))
            if (favoriteBadge && favorite) {
                Icon(
                    Icons.Filled.Star,
                    contentDescription = "In favorites",
                    tint = FocusColor,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(8.dp)
                        .background(Color.Black.copy(alpha = 0.6f), ChipShape)
                        .padding(4.dp)
                        .size(22.dp),
                )
            }
        }
        return
    }
    var focused by remember { mutableStateOf(false) }
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier
            .fillMaxWidth()
            .height(height)
            .then(if (glow) Modifier.focusGlow(CardShape) else Modifier)
            .clip(CardShape)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .onPreviewKeyEvent(onKey)
            .onFocusChanged { focused = it.hasFocus; onFocusChange(it.hasFocus) }
            // TV layouts: a thin, soft yellow line marks the tile with the sound, with no tint over it.
            .then(if (!glow && focused) Modifier.border(1.dp, FocusColor.copy(alpha = 0.7f), CardShape) else Modifier)
            .then(
                if (glow) Modifier.combinedClickable(onClick = onClick, onLongClick = onToggleFavorite)
                else Modifier.combinedClickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onClick,
                    onLongClick = onToggleFavorite,
                )
            ),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(if (glow) MaterialTheme.colorScheme.surfaceVariant else Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            if (channel.logo != null) {
                SubcomposeAsyncImage(
                    model = channel.logo,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    error = { Initials(channel.name) },
                    loading = { Initials(channel.name) },
                )
            } else {
                Initials(channel.name)
            }
            if (snapshot != null) {
                Image(
                    snapshot,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            if (page != null) key(page) { WebPreview(page, Modifier.fillMaxSize(), onFallback = onPageFailed) }
            else if (preview != null) PreviewVideo(preview)
            if (arrows) {
                Column(
                    Modifier
                        .align(Alignment.CenterEnd)
                        .padding(8.dp)
                        .background(Color.Black.copy(alpha = 0.55f), ChipShape)
                        .padding(4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(Icons.Filled.KeyboardArrowUp, contentDescription = null, tint = Color.White)
                    Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Color.White)
                }
            }
            if (!glow && focused) SoundBadge(Modifier.align(Alignment.BottomEnd))
            if (channel.number > 0) {
                Text(
                    "${channel.number}",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(6.dp)
                        .background(AccentBlue, ChipShape)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
            IconButton(
                onClick = onToggleFavorite,
                modifier = Modifier.align(Alignment.TopEnd).focusGlow(),
            ) {
                Icon(
                    if (favorite) Icons.Filled.Star else Icons.Outlined.StarBorder,
                    contentDescription = if (favorite) "Remove from favorites" else "Add to favorites",
                    tint = if (favorite) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Column(
            Modifier
                .height(TileTextHeight)
                .padding(horizontal = 10.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                channel.name,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** A small speaker on the tile that has the sound (TV layouts, with the thin yellow line). */
@Composable
private fun SoundBadge(modifier: Modifier) {
    Icon(
        Icons.AutoMirrored.Filled.VolumeUp,
        contentDescription = "Sound",
        tint = Color.White,
        modifier = modifier
            .padding(8.dp)
            .background(Color.Black.copy(alpha = 0.6f), ChipShape)
            .padding(4.dp)
            .size(22.dp),
    )
}

/** The app icon: a white TV with a red play button on a red tile. */
@Composable
internal fun AppLogo(size: Dp = 40.dp) {
    Box(
        Modifier
            .size(size)
            .clip(RoundedCornerShape(10.dp))
            .background(colorResource(R.color.ic_launcher_background)),
    ) {
        Image(
            painter = painterResource(R.drawable.ic_launcher_foreground),
            contentDescription = null,
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { scaleX = 1.3f; scaleY = 1.3f },
        )
    }
}

/**
 * The "1+List" layout: one channel plays in the left three quarters, and the right quarter is a
 * list of channels. OK on a channel in the list plays it on the left; OK on the player opens it
 * full screen, and Back returns here. Holding OK on a channel in the list offers to add it to (or
 * remove it from) the favorites.
 */
@Composable
private fun PlayerWithList(
    channels: List<Channel>,
    /** Every channel: the one playing keeps playing when the filters leave it out of the list. */
    all: List<Channel>,
    selectedId: String?,
    sound: Boolean,
    playing: Boolean,
    favorites: Set<String>,
    onToggleFavorite: (Channel) -> Unit,
    focusId: String?,
    focus: FocusRequester,
    onSelect: (Channel) -> Unit,
    onOpen: (Channel) -> Unit,
) {
    val context = LocalContext.current
    val selected = all.firstOrNull { it.id == selectedId } ?: channels.firstOrNull()
    // Keep the first channel playing when the filters change, rather than jumping to the new first one.
    LaunchedEffect(selected?.id) { if (selectedId == null && selected != null) onSelect(selected) }
    val stream = remember { StreamPlayer(context) }
    var showing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    DisposableEffect(stream) {
        val listener = object : Player.Listener {
            override fun onRenderedFirstFrame() {
                showing = true
            }
        }
        stream.player.addListener(listener)
        stream.onError = { error = it }
        onDispose {
            stream.player.removeListener(listener)
            stream.release()
        }
    }
    // Our YouTube channels, Bazaar Hits and YouTube videos play their locked page right in the picture
    // (1.9.50); our channels' free films play there instead when YouTube won't.
    var pageFailed by remember(selected?.id) { mutableStateOf(false) }
    // Bazaar TV's upcoming trailers too, while they're on (then its own player again).
    val block = rememberBlockPage(selected)
    val page = selected?.takeIf { !pageFailed }?.let { block ?: MyChannel.pageFor(it, BuildConfig.VERSION_CODE) }
    LaunchedEffect(selected?.id, page) {
        showing = false
        error = null
        if (selected != null && page == null) stream.play(selected) else stream.stop()
    }
    LaunchedEffect(sound) { stream.player.volume = if (sound) 1f else 0f }
    LaunchedEffect(playing) { stream.player.playWhenReady = playing }
    // The big player's channel is counted for the owner's stats page while it plays.
    DisposableEffect(selected?.id, playing) {
        if (selected != null && playing) Watching.watch(stream, selected)
        onDispose { Watching.stop(stream) }
    }
    val listState = rememberLazyListState(
        initialFirstVisibleItemIndex = max(0, channels.indexOfFirst { it.id == selected?.id } - 2),
    )
    // Favorites lead the list, so a new filter (All, Favorites, a genre) shows it from the top.
    // (Adding a favorite only reorders the same channels, so the list stays where it is.)
    var shownList by remember { mutableStateOf(channels.map { it.id }.toSet()) }
    LaunchedEffect(channels) {
        val ids = channels.map { it.id }.toSet()
        if (ids != shownList) {
            shownList = ids
            listState.scrollToItem(0)
        }
    }
    var playerFocused by remember { mutableStateOf(false) }
    Row(
        Modifier
            .fillMaxSize()
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.weight(3f).fillMaxHeight(), contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .clip(CardShape)
                    .background(Color.Black)
                    .onFocusChanged { playerFocused = it.hasFocus }
                    .then(if (playerFocused) Modifier.border(3.dp, FocusColor, CardShape) else Modifier)
                    .clickable { selected?.let(onOpen) },
                contentAlignment = Alignment.Center,
            ) {
                AndroidView(
                    factory = { ctx -> TextureView(ctx).also { stream.player.setVideoTextureView(it) } },
                    onRelease = { stream.player.clearVideoTextureView(it) },
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer { alpha = if (showing) 1f else 0f },
                )
                if (page != null) {
                    key(page) {
                        WebPreview(page, Modifier.fillMaxSize(), onFallback = {
                            if (block != null || MyChannel.webPage(selected) != null) pageFailed = true
                        })
                    }
                } else if (!showing) {
                    Text(
                        error ?: selected?.name.orEmpty(),
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(24.dp),
                    )
                }
                if (showing && MyChannel.isMine(selected)) MyChannelOverlay(selected)
            }
        }
        // The list fills the whole right side (no sponsor strip under it since 1.9.22).
        Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        LazyColumn(
            state = listState,
            verticalArrangement = Arrangement.spacedBy(6.dp),
            contentPadding = PaddingValues(6.dp),
            modifier = Modifier.weight(1f).fillMaxWidth(),
        ) {
            items(channels, key = { it.id }) { channel ->
                val current = channel.id == selected?.id
                var menu by remember { mutableStateOf(false) }
                Box {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .then(if (channel.id == focusId) Modifier.focusRequester(focus) else Modifier)
                        .focusGlow(ChipShape)
                        .clip(ChipShape)
                        .background(if (current) AccentBlue else MaterialTheme.colorScheme.surface)
                        .combinedClickable(onClick = { onSelect(channel) }, onLongClick = { menu = true })
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val color = if (current) Color.White else MaterialTheme.colorScheme.onSurface
                    if (channel.number > 0) {
                        Text(
                            "${channel.number}",
                            color = color,
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            modifier = Modifier.width(44.dp),
                        )
                    }
                    Text(
                        countryName(channel)?.let { "$it · ${channel.name}" } ?: channel.name,
                        color = color,
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    if (channel.id in favorites) {
                        Icon(
                            Icons.Filled.Star,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(
                        text = { Text(if (channel.id in favorites) "Remove from favorites" else "Add to favorites") },
                        leadingIcon = {
                            Icon(
                                if (channel.id in favorites) Icons.Outlined.StarBorder else Icons.Filled.Star,
                                contentDescription = null,
                            )
                        },
                        onClick = {
                            menu = false
                            onToggleFavorite(channel)
                        },
                    )
                }
                }
            }
        }
        }
    }
}

/** The channel's country as a short code, e.g. "PK" (the United Kingdom shows as "UK"), or null when it isn't known. */
private fun countryName(channel: Channel): String? =
    channel.country?.takeIf { it.length == 2 && it.all(Char::isLetter) }?.uppercase()
        ?.let { if (it == "GB") "UK" else it }

@Composable
internal fun Initials(name: String) {
    val initials = name.split(' ', '-', '_')
        .filter { it.isNotBlank() }
        .take(2)
        .joinToString("") { it.first().uppercase() }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            initials,
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun Message(
    text: String,
    action: String? = null,
    onAction: () -> Unit = {},
    secondAction: String? = null,
    onSecondAction: () -> Unit = {},
) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text, textAlign = TextAlign.Center)
        if (action != null) {
            Spacer(Modifier.height(16.dp))
            AccentButton(onClick = onAction, modifier = Modifier.focusGlow()) { Text(action) }
        }
        if (secondAction != null) {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(
                onClick = onSecondAction,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = AccentText),
                modifier = Modifier.focusGlow(),
            ) { Text(secondAction) }
        }
    }
}

/** The date and time (e.g. "Fri, Oct 2  9:54 PM"), in the phone's style, updated on the minute. */
@Composable
internal fun Clock() {
    val context = LocalContext.current
    val format = remember { DateFormat.getTimeFormat(context) }
    val dateFormat = remember {
        val locale = Locale.getDefault()
        SimpleDateFormat(DateFormat.getBestDateTimePattern(locale, "EEEMMMd"), locale)
    }
    var now by remember { mutableStateOf(Date()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = Date()
            delay(60_000 - System.currentTimeMillis() % 60_000)
        }
    }
    Text(
        dateFormat.format(now) + "  " + format.format(now),
        fontSize = 13.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        maxLines = 1,
    )
}

/** Temperature and sky for the viewer's area, refreshed every half hour; hidden until it loads. */
@Composable
internal fun WeatherNow() {
    var weather by remember { mutableStateOf<Weather.Now?>(null) }
    val place by com.livetv.app.data.Location.version.collectAsStateWithLifecycle()
    LaunchedEffect(place) {
        while (true) {
            withContext(Dispatchers.IO) { Weather.load() }?.let { weather = it }
            delay(if (weather == null) 5 * 60_000L else 30 * 60_000L)
        }
    }
    weather?.let {
        Text(
            "$it",
            fontSize = 13.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
    }
}

/**
 * Preview picture quality. Normal: SD. Low (2×2): at most 160×90 and 225 kbit/s. Lower (2×3):
 * half of Low. A stream with no smaller version plays its smallest one.
 */
private enum class Quality { Normal, Low, Lower }

/** A muted, low-quality preview player, and whether its video has started (the logo shows until then). */
@Stable
private class Preview(val stream: StreamPlayer) {
    var showing by mutableStateOf(false)

    /** The card's video view while it's on screen; a still picture is copied from it. */
    var view: TextureView? = null

    init {
        stream.player.addListener(object : Player.Listener {
            override fun onRenderedFirstFrame() {
                showing = true
            }
        })
    }

    fun setQuality(quality: Quality) {
        val params = stream.player.trackSelectionParameters.buildUpon()
        when (quality) {
            Quality.Normal -> params.setMaxVideoSizeSd().setMaxVideoBitrate(Int.MAX_VALUE).setMaxVideoFrameRate(Int.MAX_VALUE)
            Quality.Low -> params.setMaxVideoSize(160, 90).setMaxVideoBitrate(225_000).setMaxVideoFrameRate(30)
            Quality.Lower -> params.setMaxVideoSize(80, 45).setMaxVideoBitrate(112_000).setMaxVideoFrameRate(30)
        }
        stream.player.trackSelectionParameters = params.build()
    }

    /**
     * Only the tile with the sound decodes audio; on the silent ones the audio track is switched
     * off, which saves the TV a decoder per tile.
     */
    fun setSound(on: Boolean) {
        stream.player.volume = if (on) 1f else 0f
        val params = stream.player.trackSelectionParameters
        if (params.disabledTrackTypes.contains(C.TRACK_TYPE_AUDIO) == !on) return
        stream.player.trackSelectionParameters =
            params.buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, !on).build()
    }

    companion object {
        fun create(context: Context) = Preview(
            StreamPlayer(context, preview = true).apply {
                player.volume = 0f
                player.trackSelectionParameters =
                    player.trackSelectionParameters.buildUpon().setMaxVideoSizeSd().build()
            }
        )

        /** True on mobile data (or any connection the system says costs money). */
        fun metered(context: Context): Boolean =
            (context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager)?.isActiveNetworkMetered ?: true
    }
}

/** The preview's video, drawn over the logo once the first frame arrives. */
@Composable
private fun PreviewVideo(preview: Preview, stretch: Boolean = false) {
    val player = preview.stream.player
    AndroidView(
        factory = { ctx -> TextureView(ctx).also { preview.view = it; player.setVideoTextureView(it) } },
        onRelease = {
            if (preview.view === it) preview.view = null
            player.clearVideoTextureView(it)
        },
        modifier = Modifier
            .then(if (stretch) Modifier.fillMaxSize() else Modifier.aspectRatio(16f / 9f))
            .graphicsLayer { alpha = if (preview.showing) 1f else 0f },
    )
}

/** Narrowest a channel tile gets; the screen width decides how many fit in a row. */
private val MinTileWidth = 170.dp

/** How many tiles a TV screen shows; the label is what the top-bar button reads. */
/** In the order the top-bar button steps through them. */
private enum class TileLayout(val label: String, val columns: Int, val rows: Int) {
    /** One big player on the left with a channel list on the right. */
    List("1+List", 1, 1),
    /** A home screen like a streaming app's: an icon rail, a search bar and rows of big channel cards. */
    Browse("Browse", 1, 1),
    /** One big rounded player in the middle, with the channels before and after it peeking in at the sides. */
    Carousel("Carousel", 1, 1),
    /** One big player across the top and a strip of channel tiles along the bottom. */
    Strip("Strip", 1, 1),
    /** Two silent players side by side on top and rows of channel cards below, like the Google TV home screen. */
    Duo("Duo", 1, 1),
    /** One big player (top left, 85% wide) and small ones around it; sound only from the big one. */
    Five("1+3", 4, 1),
    Two("1×2", 2, 1),
    /** Four separate TVs, like 1×2. */
    Four("2×2", 2, 2),
    Six("2×3", 3, 2),
    /** Like a 24-hour news channel: one player with weather, markets, prayer times, stories and a sponsor around it. */
    News("News", 1, 1),
    /** Like CP24: a big player, a red clock and weather column, a sponsor box and two scrolling lines. */
    Cp24("CP24", 1, 1),
    /** A modern home screen: the channel, clock, weather, prayers with reminders, stories, markets, rates and the sponsor on cards. */
    Home("Home", 1, 1),
    /** The viewer's own screen: layout, style, colour and information picked in Settings. */
    Mine("My Screen", 1, 1),
}

/**
 * The layout picked with the layout button since the app was opened. Each time the app opens
 * it starts again (Browse on Cable TV's TV screens), so the pick is kept only until then, not saved.
 */
private var sessionTileLayout: TileLayout? = null

/** News, CP24 and Home: one channel with information around it (Cable TV only). */
private val INFO_LAYOUTS = setOf(TileLayout.News, TileLayout.Cp24, TileLayout.Home, TileLayout.Mine)

/** The layouts the top-bar button steps through; News mode is Cable TV's only. Home mode is back (user's choice, 1.9.18). */
private val layouts = TileLayout.entries.filter {
    (it !in INFO_LAYOUTS && it != TileLayout.Browse && it != TileLayout.Carousel && it != TileLayout.Strip && it != TileLayout.Duo) || Edition.LIVE_TV
}

/** Cable TV's package each mode needs (see [Plans]). */
private val TileLayout.tier: Plans.Tier
    get() = when (this) {
        TileLayout.List, TileLayout.Browse, TileLayout.Carousel, TileLayout.Strip -> Plans.Tier.Free
        TileLayout.Two, TileLayout.Five, TileLayout.Duo -> Plans.Tier.Silver
        TileLayout.Four, TileLayout.News, TileLayout.Cp24, TileLayout.Home, TileLayout.Mine -> Plans.Tier.Gold
        TileLayout.Six -> Plans.Tier.Platinum
    }

/** 1+3, 1×2, 2×2 and 2×3: every tile plays and has its own channel, changed with Up and Down. */
private val TileLayout.separateTvs get() =
    this != TileLayout.List && this != TileLayout.Browse && this != TileLayout.Carousel && this != TileLayout.Strip && this != TileLayout.Duo && this !in INFO_LAYOUTS

/**
 * 1×2, 2×2 and 2×3's channels, and the tile opened full screen, kept while a channel plays full
 * screen so Back returns to the same tiles (with the opened one on the channel watched last).
 */
private var sessionTileIds: List<String> = emptyList()
private var sessionOpenedTile: Int = -1

/** The TV layouts fill the whole screen (OK on a tile); Back returns to the tiles under the top bar. */
private var sessionTilesFull = false

/** Set once the app has opened the channel watched last at start-up (1+List on a TV). */
private var sessionStartOpened = false

/** Open the channel watched last in full screen at start-up (off since 1.9.41: the app opens in 1+List). */
private const val START_FULL_SCREEN = false

private const val PREF_PREVIEW_SOUND = "preview_sound_highlighted"

/** Leaves scrolling to the focused tile to the grid's own row-at-a-time handling. */
@OptIn(ExperimentalFoundationApi::class)
private val NoBringIntoView = object : BringIntoViewSpec {
    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float = 0f
}

/** Room under a tile's picture for the channel name (one line). */
private val TileTextHeight = 30.dp
