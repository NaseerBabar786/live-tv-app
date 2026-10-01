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
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.runtime.mutableStateOf
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
) {
    var searching by rememberSaveable { mutableStateOf(false) }
    var showSettings by rememberSaveable { mutableStateOf(false) }
    val gridState = rememberLazyGridState()
    val lastWatchedFocus = remember { FocusRequester() }

    // Coming back from the player: scroll to the channel that was playing and put the
    // remote's cursor on it.
    LaunchedEffect(Unit) {
        val index = state.visibleChannels.indexOfFirst { it.id == state.lastWatchedId }
        if (index >= 0) {
            gridState.scrollToItem(index)
            withFrameNanos { }
            runCatching { lastWatchedFocus.requestFocus() }
        }
    }

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
    val rowIds by remember {
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
    // Still pictures for the cards on screen, kept while scrolling around.
    val snapshots = remember { mutableStateMapOf<String, ImageBitmap>() }
    // A card that stops playing keeps its last frame as its picture.
    fun release(id: String) {
        rowPreviews.remove(id)?.let { p ->
            if (p.showing) p.view?.bitmap?.let { snapshots[id] = it.asImageBitmap() }
            p.stream.stop(); p.showing = false; pool += p
        }
    }
    LaunchedEffect(rowIds, focusedId, inForeground, showSettings) {
        val ids = rowIds ?: return@LaunchedEffect // wait for scrolling to settle
        val live = focusedId?.takeIf { it in ids }
        val allowed = inForeground && !showSettings && !Preview.metered(context)
        for (id in rowPreviews.keys.toList()) if (!allowed || id != live) release(id)
        if (!allowed) return@LaunchedEffect
        delay(600)
        if (live != null && live !in rowPreviews) {
            val channel = state.channels.firstOrNull { it.id == live } ?: return@LaunchedEffect
            val p = pool.removeLastOrNull() ?: Preview.create(context)
            p.stream.player.volume = if (previewSound) 1f else 0f
            rowPreviews[live] = p
            p.stream.play(channel)
        }
        if (snapshots.size > 80) snapshots.clear()
        // One picture at a time: the channel opens muted in its card, the first frame is kept
        // and the channel closes again.
        // Each card gets one picture; it isn't refreshed.
        run {
            for (id in ids) {
                if (id == live || id in snapshots) continue
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
    LaunchedEffect(previewSound, focusedId, rowPreviews.keys.toSet()) {
        // Pictures being taken stay silent; only the highlighted card has sound.
        rowPreviews.forEach { (id, p) -> p.stream.player.volume = if (previewSound && id == focusedId) 1f else 0f }
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
                            onValueChange = onQueryChange,
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
                                if (Edition.LIVE_TV) WeatherNow()
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
                            modifier = Modifier.focusGlow(),
                        ) { Text(tileLayout.label, fontWeight = FontWeight.Bold) }
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
                // One row: All, then genres (countries are picked in Settings; favorites lead the list).
                // All clears every filter; tapping a selected genre clears it.
                ChipRow(
                    items = listOf(FILTER_ALL) + state.categories,
                    selected = setOfNotNull(
                        FILTER_ALL.takeIf { state.filter == FILTER_ALL && state.category == null },
                        state.category,
                    ),
                    onSelect = {
                        when (it) {
                            FILTER_ALL -> onFilterChange(FILTER_ALL)
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
                    else -> BoxWithConstraints(Modifier.fillMaxSize()) {
                    // TVs and tablets: the chosen layout (8, 4 or 2 tiles). Phones: as many as fit.
                    val gap = 14.dp
                    val wide = maxWidth >= 600.dp
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
                    // The grid moves a whole row at a time and never shows half rows: the default
                    // "scroll just enough to show the focused tile" is turned off and the grid jumps
                    // straight to the row instead.
                    CompositionLocalProvider(LocalBringIntoViewSpec provides NoBringIntoView) {
                    LazyVerticalGrid(
                        columns = GridCells.FixedSize(tileWidth),
                        contentPadding = PaddingValues(horizontal = gap, vertical = rowGap),
                        horizontalArrangement = Arrangement.spacedBy(gap, Alignment.CenterHorizontally),
                        verticalArrangement = Arrangement.spacedBy(rowGap),
                        state = gridState,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        itemsIndexed(channels, key = { _, it -> it.id }) { index, channel ->
                            ChannelCard(
                                height = cardHeight,
                                channel = channel,
                                favorite = channel.id in state.favorites,
                                onClick = { onPlay(channel) },
                                onToggleFavorite = { onToggleFavorite(channel) },
                                focusRequester = lastWatchedFocus.takeIf { channel.id == state.lastWatchedId },
                                onFocusChange = { focused ->
                                    if (focused) {
                                        focusedId = channel.id
                                        val row = index / columns
                                        val offset = gridState.firstVisibleItemScrollOffset
                                        val top = gridState.firstVisibleItemIndex / columns + if (offset > 0) 1 else 0
                                        val newTop = when {
                                            row < top -> row
                                            row > top + rows - 1 -> row - rows + 1
                                            else -> top
                                        }
                                        // Scroll only when the highlight leaves the rows on screen.
                                        if (newTop != top || offset != 0) {
                                            scope.launch { gridState.scrollToItem(newTop * columns) }
                                        }
                                    }
                                },
                                preview = rowPreviews[channel.id],
                                snapshot = snapshots[channel.id],
                            )
                        }
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
private fun ChipRow(items: List<String>, selected: Set<String>, onSelect: (String) -> Unit) {
    // Without the extra invisible touch margin around chips, the focus glow hugs the chip's edges.
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
        ChipRowContent(items, selected, onSelect)
    }
}

@Composable
private fun ChipRowContent(items: List<String>, selected: Set<String>, onSelect: (String) -> Unit) {
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
                modifier = Modifier.focusGlow(ChipShape),
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
    onFocusChange: (Boolean) -> Unit = {},
    preview: Preview? = null,
    snapshot: ImageBitmap? = null,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier
            .fillMaxWidth()
            .height(height)
            .focusGlow(CardShape)
            .clip(CardShape)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
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
    Four("2×2", 2, 2),
    Two("2×1", 2, 1),
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
