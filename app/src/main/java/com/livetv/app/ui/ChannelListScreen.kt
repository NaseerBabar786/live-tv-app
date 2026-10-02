package com.livetv.app.ui

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.roundToInt
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
import androidx.media3.common.Player
import com.livetv.app.player.StreamPlayer
import androidx.compose.foundation.layout.IntrinsicSize
import com.livetv.app.data.Weather
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.text.format.DateFormat
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.TextButton
import androidx.compose.ui.unit.Dp
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
import androidx.compose.material.icons.filled.VideoLibrary
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
) {
    var searching by rememberSaveable { mutableStateOf(false) }
    var showSettings by rememberSaveable { mutableStateOf(false) }
    val gridState = rememberLazyGridState()
    val lastWatchedFocus = remember { FocusRequester() }
    // Lets 2×1 move the highlight to a card or the layout button directly.
    val cardFocus = remember { mutableMapOf<String, FocusRequester>() }
    fun cardRequester(id: String): FocusRequester =
        if (id == state.lastWatchedId) lastWatchedFocus else cardFocus.getOrPut(id) { FocusRequester() }
    val layoutButtonFocus = remember { FocusRequester() }
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
    // TV and tablet layout, picked with the button in the top bar (remembered).
    var tileLayout by remember {
        mutableStateOf(TileLayout.entries.firstOrNull { it.name == prefs.getString(PREF_TILE_LAYOUT, null) } ?: TileLayout.Eight)
    }
    val wideScreen = LocalConfiguration.current.screenWidthDp >= 600
    // "1+List": the channel playing on the left, kept when coming back from full screen.
    val listMode = wideScreen && tileLayout == TileLayout.List
    var listChannelId by rememberSaveable { mutableStateOf(state.lastWatchedId) }
    // TVs and tablets show a fixed window of tiles that slides along the list one channel at a
    // time; [windowStart] is the channel in the first tile.
    val windowed = wideScreen && !listMode
    val slots = tileLayout.columns * tileLayout.rows
    var windowStart by rememberSaveable { mutableIntStateOf(0) }
    val start = windowStart.coerceIn(0, max(0, state.visibleChannels.size - slots))
    // 2×1 is two separate TVs: Up and Down change the channel on the highlighted side only.
    // [twoIds] holds the two sides' channels once one has been changed.
    var twoIds by rememberSaveable { mutableStateOf(emptyList<String>()) }
    val twoChosen = twoIds.mapNotNull { id -> state.visibleChannels.firstOrNull { it.id == id } }
    val window = when {
        !windowed -> emptyList()
        tileLayout == TileLayout.Two && twoChosen.size == 2 && twoChosen[0].id != twoChosen[1].id -> twoChosen
        else -> state.visibleChannels.drop(start).take(slots)
    }
    val rowIds: List<String>? = if (windowed) {
        // The highlighted row first, so its pictures come first.
        val row = window.indexOfFirst { it.id == focusedId }.takeIf { it >= 0 }?.div(tileLayout.columns)
        window.withIndex().sortedBy { it.index / tileLayout.columns != row }.map { it.value.id }
    } else gridIds

    // Coming back from the player: show the channel that was playing and put the remote's
    // cursor on it.
    LaunchedEffect(Unit) {
        val index = state.visibleChannels.indexOfFirst { it.id == state.lastWatchedId }
        if (index >= 0) {
            if (windowed) {
                if (window.none { it.id == state.lastWatchedId }) {
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
        rowPreviews.remove(id)?.let { p ->
            if (p.showing) p.view?.bitmap?.let { snapshots[id] = it.asImageBitmap() }
            p.stream.stop(); p.showing = false; pool += p
        }
    }
    // The highlighted card has the sound.
    val soundId = focusedId
    LaunchedEffect(rowIds, focusedId, inForeground, showSettings, tileLayout) {
        val ids = rowIds ?: return@LaunchedEffect // wait for scrolling to settle
        val live = focusedId?.takeIf { it in ids }
        // In 2×1 both cards play; otherwise only the highlighted one.
        val playAll = wideScreen && tileLayout == TileLayout.Two
        val playing = if (playAll) ids.take(tileLayout.columns * tileLayout.rows).toSet() else setOfNotNull(live)
        val allowed = inForeground && !showSettings && !listMode && !Preview.metered(context)
        for (id in rowPreviews.keys.toList()) if (!allowed || id !in playing) release(id)
        if (!allowed) return@LaunchedEffect
        delay(600)
        for (id in playing) {
            if (id in rowPreviews) continue
            val channel = state.channels.firstOrNull { it.id == id } ?: continue
            val p = pool.removeLastOrNull() ?: Preview.create(context)
            p.stream.player.volume = if (previewSound && id == soundId) 1f else 0f
            rowPreviews[id] = p
            p.stream.play(channel)
        }
        if (snapshots.size > 80) snapshots.clear()
        // One picture at a time: the channel opens muted in its card, the first frame is kept
        // and the channel closes again.
        // Each card gets one picture; it isn't refreshed.
        run {
            for (id in ids) {
                if (id in playing || id in snapshots) continue
                val channel = state.channels.firstOrNull { it.id == id } ?: continue
                val p = pool.removeLastOrNull() ?: Preview.create(context)
                p.stream.player.volume = 0f
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
    LaunchedEffect(previewSound, soundId, rowPreviews.keys.toSet()) {
        // Pictures being taken stay silent; only the highlighted card has sound.
        rowPreviews.forEach { (id, p) -> p.stream.player.volume = if (previewSound && id == soundId) 1f else 0f }
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

    Scaffold(
        topBar = {
            TopAppBar(
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
                            onClick = {
                                tileLayout = TileLayout.entries[(tileLayout.ordinal + 1) % TileLayout.entries.size]
                                prefs.edit().putString(PREF_TILE_LAYOUT, tileLayout.name).apply()
                            },
                            colors = ButtonDefaults.textButtonColors(contentColor = LocalContentColor.current),
                            modifier = Modifier.focusRequester(layoutButtonFocus).focusGlow(),
                        ) { Text("${tileLayout.label} Mode", fontWeight = FontWeight.Bold) }
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
                    IconButton(modifier = Modifier.focusGlow(), onClick = {
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
                ChipRow(
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
                if (!state.loading && state.channels.isNotEmpty()) {
                    Text(
                        "${state.visibleChannels.size} channels",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp),
                    )
                }

                val channels = state.visibleChannels
                when {
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
                        onSelect = { listChannelId = it.id },
                        onOpen = onPlay,
                    )
                    else -> BoxWithConstraints(Modifier.fillMaxSize()) {
                    // TVs and tablets: the chosen layout (8, 6 or 2 tiles). Phones: as many as fit.
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
                    val cardHeight = tileWidth * 9f / 16f + TileTextHeight
                    val rowGap = maxOf(gap, (maxHeight - cardHeight * rows) / (rows + 1))
                    // Likewise across: when the height decides the tile size, widen the gaps so the
                    // grid fits exactly [columns] tiles in a row (a bit under, so rounding can't drop one).
                    val columnGap = if (wide) maxOf(gap, (maxWidth - tileWidth * columns) / (columns + 1) - 1.dp) else gap
                    @Composable
                    fun Tile(
                        index: Int,
                        channel: Channel,
                        onKey: (KeyEvent) -> Boolean,
                        onFocused: () -> Unit = {},
                        arrows: Boolean = false,
                    ) =
                        ChannelCard(
                            height = cardHeight,
                            channel = channel,
                            favorite = channel.id in state.favorites,
                            onClick = { onPlay(channel) },
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
                            snapshot = snapshots[channel.id],
                            arrows = arrows,
                        )
                    if (wide) {
                        // A fixed window of tiles that slides along the list. Only Left and Right
                        // change channels: they move the highlight, and past the last (or first) tile
                        // every channel moves along one place and one new channel comes in. Up goes
                        // to the layout button and Down does nothing.
                        // 2×1: Left and Right move the highlight (and the sound) between the two
                        // sides, Up and Down change the highlighted side's channel, holding Up goes to
                        // the filter row, and Back goes up to the top bar.
                        fun twoKey(channel: Channel): (KeyEvent) -> Boolean = onKey@{ event ->
                            if (event.key == Key.Back) {
                                // Taken on both press and release, so the app doesn't also go back.
                                if (event.type == KeyEventType.KeyUp) runCatching { layoutButtonFocus.requestFocus() }
                                return@onKey true
                            }
                            // Up changes channel when it's let go, unless it was held down.
                            if (event.key == Key.DirectionUp && event.type == KeyEventType.KeyDown) {
                                if (event.nativeKeyEvent.repeatCount == 0) upHeld = false
                                if (event.nativeKeyEvent.repeatCount == 1) {
                                    upHeld = true
                                    runCatching { chipFocus.requestFocus() }
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
                            val other = window.getOrNull(1 - side)
                            val target = when {
                                event.key == Key.DirectionLeft -> window.first().takeIf { side == 1 }
                                event.key == Key.DirectionRight -> window.getOrNull(1).takeIf { side == 0 }
                                up || event.key == Key.DirectionDown -> {
                                    val step = if (up) -1 else 1
                                    var j = channels.indexOfFirst { it.id == channel.id } + step
                                    if (channels.getOrNull(j)?.id == other?.id) j += step
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
                        Column(
                            Modifier.fillMaxSize().padding(vertical = rowGap),
                            verticalArrangement = Arrangement.spacedBy(rowGap),
                        ) {
                            window.chunked(columns).forEachIndexed { r, row ->
                                Row(
                                    Modifier.fillMaxWidth().padding(horizontal = columnGap),
                                    horizontalArrangement = Arrangement.spacedBy(columnGap, Alignment.CenterHorizontally),
                                ) {
                                    row.forEachIndexed { c, channel ->
                                        // Keyed by channel, so a playing card slides over without restarting.
                                        key(channel.id) {
                                            Box(Modifier.width(tileWidth)) {
                                                if (tileLayout == TileLayout.Two) {
                                                    Tile(0, channel, twoKey(channel), arrows = channel.id == focusedId)
                                                } else {
                                                    Tile(start + r * columns + c, channel, onKey(start + r * columns + c))
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
                    }
                }
            }
        }
    }

    if (showSettings) settings { showSettings = false }
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
    snapshot: ImageBitmap? = null,
    /** Up and down arrows: Up and Down change this card's channel (2×1). */
    arrows: Boolean = false,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier
            .fillMaxWidth()
            .height(height)
            .focusGlow(CardShape)
            .clip(CardShape)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .onPreviewKeyEvent(onKey)
            .onFocusChanged { onFocusChange(it.hasFocus) }
            .combinedClickable(onClick = onClick, onLongClick = onToggleFavorite),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(MaterialTheme.colorScheme.surfaceVariant),
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
            if (preview != null) PreviewVideo(preview)
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

/** The app icon: a white TV with a red play button on a red tile. */
@Composable
private fun AppLogo(size: Dp = 40.dp) {
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
    LaunchedEffect(selected?.id) {
        showing = false
        error = null
        if (selected != null) stream.play(selected) else stream.stop()
    }
    LaunchedEffect(sound) { stream.player.volume = if (sound) 1f else 0f }
    LaunchedEffect(playing) { stream.player.playWhenReady = playing }
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
                if (!showing) {
                    Text(
                        error ?: selected?.name.orEmpty(),
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(24.dp),
                    )
                }
            }
        }
        LazyColumn(
            state = listState,
            verticalArrangement = Arrangement.spacedBy(6.dp),
            contentPadding = PaddingValues(6.dp),
            modifier = Modifier.weight(1f).fillMaxHeight(),
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

/** The channel's country as a short code, e.g. "PK" (the United Kingdom shows as "UK"), or null when it isn't known. */
private fun countryName(channel: Channel): String? =
    channel.country?.takeIf { it.length == 2 && it.all(Char::isLetter) }?.uppercase()
        ?.let { if (it == "GB") "UK" else it }

@Composable
private fun Initials(name: String) {
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

/** The time, in the phone's 12- or 24-hour style, updated on the minute. */
@Composable
private fun Clock() {
    val context = LocalContext.current
    val format = remember { DateFormat.getTimeFormat(context) }
    var now by remember { mutableStateOf(Date()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = Date()
            delay(60_000 - System.currentTimeMillis() % 60_000)
        }
    }
    Text(
        format.format(now),
        fontSize = 13.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        maxLines = 1,
    )
}

/** Temperature and sky for the viewer's area, refreshed every half hour; hidden until it loads. */
@Composable
private fun WeatherNow() {
    var weather by remember { mutableStateOf<Weather.Now?>(null) }
    LaunchedEffect(Unit) {
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
private fun PreviewVideo(preview: Preview) {
    val player = preview.stream.player
    AndroidView(
        factory = { ctx -> TextureView(ctx).also { preview.view = it; player.setVideoTextureView(it) } },
        onRelease = {
            if (preview.view === it) preview.view = null
            player.clearVideoTextureView(it)
        },
        modifier = Modifier
            .aspectRatio(16f / 9f)
            .graphicsLayer { alpha = if (preview.showing) 1f else 0f },
    )
}

/** Narrowest a channel tile gets; the screen width decides how many fit in a row. */
private val MinTileWidth = 170.dp

/** How many tiles a TV screen shows; the label is what the top-bar button reads. */
private enum class TileLayout(val label: String, val columns: Int, val rows: Int) {
    Eight("2×4", 4, 2),
    Six("2×3", 3, 2),
    Two("2×1", 2, 1),
    /** One big player on the left with a channel list on the right. */
    List("1+List", 1, 1),
}

private const val PREF_TILE_LAYOUT = "tile_layout"

private const val PREF_PREVIEW_SOUND = "preview_sound_highlighted"

/** Leaves scrolling to the focused tile to the grid's own row-at-a-time handling. */
@OptIn(ExperimentalFoundationApi::class)
private val NoBringIntoView = object : BringIntoViewSpec {
    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float = 0f
}

/** Room under a tile's picture for the channel name (one line). */
private val TileTextHeight = 30.dp
