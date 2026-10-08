package com.livetv.app.ui

import android.view.TextureView
import android.widget.Toast
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.runtime.key
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import coil3.compose.SubcomposeAsyncImage
import com.livetv.app.BuildConfig
import com.livetv.app.Edition
import com.livetv.app.EditionTicker
import com.livetv.app.Watching
import com.livetv.app.data.Channel
import com.livetv.app.data.MyChannel
import com.livetv.app.data.YouTube
import com.livetv.app.player.StreamPlayer
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/** One set of channels the strip shows: Favorites, a country, or every channel. */
private class StripGroup(val key: String, val title: String, val channels: List<Channel>)

/** The group the strip was on, kept while a channel plays full screen. */
private var sessionStripGroup: String? = null

/** Where the remote's cursor is: the big player, the Modes button, the group button or a tile. */
private const val AT_PLAYER = -3
private const val AT_MODES = -2
private const val AT_GROUP = -1

private val Yellow = Color(0xFFFFD54F)
private val TileShape = RoundedCornerShape(8.dp)

/**
 * "Strip" mode: one big player across the top of the screen and a strip of channel tiles along
 * the bottom. Left and Right move along the tiles, OK plays the highlighted tile in the big player
 * (held down, it adds the channel to Favorites or takes it off). Up goes to the big player, where
 * OK opens the channel full screen; Down comes back to the strip. At the start of the strip are
 * the Modes button and the group button (Favorites, each country, All channels). Only the big
 * player plays; the tiles show only each channel's logo, number and name, so the strip stays quick.
 */
@Composable
internal fun StripMode(
    /** Every channel, already limited to the languages chosen in Settings. */
    channels: List<Channel>,
    favorites: Set<String>,
    lastWatchedId: String?,
    sound: Boolean,
    playing: Boolean,
    focus: FocusRequester,
    onWatch: (Channel) -> Unit,
    onOpen: (Channel) -> Unit,
    onToggleFavorite: (Channel) -> Unit,
    onModes: () -> Unit,
    /** Back on the Modes button: shows the top bar. */
    onBack: () -> Unit,
    /** The strip has the remote's cursor again (the top bar hides). */
    onFocused: () -> Unit,
) {
    val context = LocalContext.current
    val palette = Themes.current

    val groups = remember(channels, favorites) {
        buildList {
            val favs = channels.filter { it.id in favorites }
            if (favs.isNotEmpty()) add(StripGroup("favorites", "Favorites", favs))
            channels.mapNotNull { it.group }.distinct().forEach { group ->
                add(StripGroup("group:$group", group, channels.filter { it.group == group }))
            }
            if (channels.isNotEmpty()) add(StripGroup("all", "All channels", channels))
        }
    }
    var groupKey by remember { mutableStateOf(sessionStripGroup) }
    // The channel in the big player, and the tile the cursor is on (or AT_PLAYER, AT_MODES, AT_GROUP).
    var playingId by remember { mutableStateOf(lastWatchedId) }
    var cursor by remember { mutableIntStateOf(0) }
    LaunchedEffect(groups.isNotEmpty()) {
        if (groups.isEmpty()) return@LaunchedEffect
        val group = groups.firstOrNull { g -> g.key == groupKey && g.channels.any { it.id == lastWatchedId } }
            ?: groups.firstOrNull { g -> g.channels.any { it.id == lastWatchedId } }
            ?: groups.firstOrNull { it.key == groupKey }
            ?: groups.first()
        groupKey = group.key
        cursor = group.channels.indexOfFirst { it.id == lastWatchedId }.coerceAtLeast(0)
        if (playingId == null || channels.none { it.id == playingId }) playingId = group.channels.firstOrNull()?.id
    }
    val groupAt = groups.indexOfFirst { it.key == groupKey }.coerceAtLeast(0)
    val group = groups.getOrNull(groupAt)
    val list = group?.channels.orEmpty()
    LaunchedEffect(groupKey) { sessionStripGroup = groupKey }
    val onTile = cursor >= 0
    val at = if (list.isEmpty()) 0 else cursor.coerceIn(0, list.size - 1)
    val current = playingId?.let { id -> channels.firstOrNull { it.id == id } }

    // The channel's name and the clock show for a few seconds after a key is pressed.
    var touchedAt by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var infoShown by remember { mutableStateOf(true) }
    LaunchedEffect(touchedAt) {
        infoShown = true
        delay(6_000)
        infoShown = false
    }

    fun changeGroup(by: Int) {
        if (groups.size < 2) return
        val next = groups[Math.floorMod(groupAt + by, groups.size)]
        groupKey = next.key
        val inNext = next.channels.indexOfFirst { it.id == playingId }
        if (onTile) cursor = inNext.coerceAtLeast(0)
    }

    // Holding OK on a tile, or a long press on it: adds the channel to Favorites (or takes it off).
    fun toggleFavorite(channel: Channel) {
        val adding = channel.id !in favorites
        onToggleFavorite(channel)
        Toast.makeText(
            context,
            if (adding) "${channel.name} added to Favorites" else "${channel.name} removed from Favorites",
            Toast.LENGTH_SHORT,
        ).show()
    }

    // A tap moves the cursor there and does what OK does there.
    fun tapPlayer() {
        touchedAt = System.currentTimeMillis()
        cursor = AT_PLAYER
        current?.let(onOpen)
    }
    fun tapModes() {
        touchedAt = System.currentTimeMillis()
        cursor = AT_MODES
        onModes()
    }
    fun tapGroup() {
        touchedAt = System.currentTimeMillis()
        changeGroup(1)
        cursor = AT_GROUP
    }
    fun tapTile(i: Int, channel: Channel) {
        touchedAt = System.currentTimeMillis()
        cursor = i
        playingId = channel.id
    }
    fun holdTile(i: Int, channel: Channel) {
        touchedAt = System.currentTimeMillis()
        cursor = i
        toggleFavorite(channel)
    }

    // The big player: the chosen channel, live, with sound.
    val stream = remember { StreamPlayer(context, preview = true) }
    val view = remember { ViewHolder() }
    var showing by remember { mutableStateOf(false) }
    var shownId by remember { mutableStateOf<String?>(null) }
    DisposableEffect(stream) {
        val listener = object : Player.Listener {
            override fun onRenderedFirstFrame() {
                showing = true
            }
        }
        stream.player.addListener(listener)
        onDispose {
            stream.player.removeListener(listener)
            Watching.stop(stream)
            stream.release()
        }
    }
    val currentOnWatch by rememberUpdatedState(onWatch)
    // Our YouTube channels and Bazaar Hits play their own page here, as in 1+List (1.9.60); before, the
    // player fell to their backup films, the same film on several channels.
    var pageFailed by remember(current?.id) { mutableStateOf(false) }
    val page = current?.takeIf { playing && !pageFailed }?.let { MyChannel.pageFor(it, BuildConfig.VERSION_CODE) }
    LaunchedEffect(current?.id, playing, page) {
        stream.stop()
        showing = false
        shownId = null
        val channel = current ?: return@LaunchedEffect
        if (!playing) return@LaunchedEffect
        currentOnWatch(channel)
        shownId = channel.id
        if (page == null) stream.play(channel)
    }
    LaunchedEffect(sound) { stream.player.volume = if (sound) 1f else 0f }
    DisposableEffect(shownId, sound, playing) {
        val channel = shownId?.let { id -> channels.firstOrNull { it.id == id } }
        if (channel != null && sound && playing) Watching.watch(stream, channel)
        onDispose { Watching.stop(stream) }
    }

    val rowState = rememberLazyListState()

    // The highlighted tile stays in view, with a tile or two showing before it.
    LaunchedEffect(cursor, groupKey) {
        val item = if (onTile) at + 2 else 0
        rowState.animateScrollToItem((item - 2).coerceAtLeast(0))
    }

    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    var held by remember { mutableStateOf(false) }

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focus)
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onPreviewKeyEvent { e ->
                if (e.type == KeyEventType.KeyDown) touchedAt = System.currentTimeMillis()
                when {
                    e.key == Key.Back -> {
                        if (e.type == KeyEventType.KeyUp) {
                            when (cursor) {
                                AT_PLAYER -> cursor = list.indexOfFirst { it.id == playingId }.coerceAtLeast(0)
                                AT_MODES -> onBack()
                                else -> cursor = AT_MODES
                            }
                        }
                        true
                    }
                    e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter -> {
                        if (e.type == KeyEventType.KeyDown) {
                            // Held down on a tile: adds the channel to Favorites (or takes it off).
                            if (onTile && e.nativeKeyEvent.repeatCount >= 6 && !held) {
                                held = true
                                list.getOrNull(at)?.let { toggleFavorite(it) }
                            }
                        } else if (e.type == KeyEventType.KeyUp) {
                            if (!held) {
                                when (cursor) {
                                    AT_PLAYER -> current?.let(onOpen)
                                    AT_MODES -> onModes()
                                    AT_GROUP -> changeGroup(1)
                                    else -> list.getOrNull(at)?.let { playingId = it.id }
                                }
                            }
                            held = false
                        }
                        true
                    }
                    e.type != KeyEventType.KeyDown -> false
                    e.key == Key.DirectionLeft -> {
                        when {
                            cursor == AT_PLAYER -> {}
                            cursor == AT_MODES -> {}
                            else -> cursor = if (onTile && at == 0) AT_GROUP else if (onTile) at - 1 else cursor - 1
                        }
                        true
                    }
                    e.key == Key.DirectionRight -> {
                        when {
                            cursor == AT_PLAYER -> {}
                            !onTile -> cursor = if (cursor == AT_GROUP) 0 else cursor + 1
                            at < list.size - 1 -> cursor = at + 1
                        }
                        if (cursor >= list.size) cursor = (list.size - 1).coerceAtLeast(0)
                        true
                    }
                    e.key == Key.DirectionUp -> {
                        if (cursor != AT_PLAYER) cursor = AT_PLAYER
                        true
                    }
                    e.key == Key.DirectionDown -> {
                        if (cursor == AT_PLAYER) cursor = list.indexOfFirst { it.id == playingId }.coerceAtLeast(0)
                        true
                    }
                    e.key == Key.ChannelUp -> { changeGroup(-1); true }
                    e.key == Key.ChannelDown -> { changeGroup(1); true }
                    else -> false
                }
            }
            .focusable(),
    ) {
        // The strip is 17% of the screen (about 180 of 1080 lines): the smallest height where
        // the tiles' pictures, numbers and names still read well from the sofa.
        val stripHeight = maxHeight * 0.17f
        val tileHeight = stripHeight - 22.dp
        val tileWidth = tileHeight * 16f / 9f

        Column(Modifier.fillMaxSize()) {
            // The big player, edge to edge.
            Box(
                Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .background(Color.Black),
            ) {
                if (current == null) {
                    Text("Loading channels…", color = palette.onSurfaceVariant, modifier = Modifier.align(Alignment.Center))
                } else if (page != null) {
                    LoadingSpinner()
                    key(page) {
                        WebPreview(page, Modifier.fillMaxSize(), still = false, onFallback = {
                            if (MyChannel.webPage(current) != null) pageFailed = true
                        })
                    }
                } else {
                    if (!showing) LoadingSpinner()
                    if (shownId == current.id) {
                        AndroidView(
                            factory = { ctx -> TextureView(ctx).also { view.view = it; stream.player.setVideoTextureView(it) } },
                            onRelease = {
                                if (view.view === it) view.view = null
                                stream.player.clearVideoTextureView(it)
                            },
                            modifier = Modifier
                                .fillMaxSize()
                                .background(if (showing) Color.Black else Color.Transparent)
                                .graphicsLayer { alpha = if (showing) 1f else 0f },
                        )
                    }
                }
                // A tap on the big player: full screen (over the picture, so the web pages don't take the tap).
                Box(Modifier.matchParentSize().tap { tapPlayer() })
                // The cursor on the big player: a yellow frame and what OK does.
                if (cursor == AT_PLAYER) {
                    Box(Modifier.fillMaxSize().border(BorderStroke(4.dp, Yellow)))
                    Text(
                        "OK: full screen   ▼ channels",
                        color = Color.Black,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 18.dp)
                            .clip(RoundedCornerShape(50))
                            .background(Yellow)
                            .padding(horizontal = 18.dp, vertical = 6.dp),
                    )
                }
                // Over the top of the picture for a few seconds: the channel, the clock and the weather.
                val infoAlpha by animateFloatAsState(if (infoShown || current == null) 1f else 0f, label = "info")
                Box(Modifier.fillMaxWidth().align(Alignment.TopStart).graphicsLayer { alpha = infoAlpha }) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.75f), Color.Transparent)))
                            .padding(start = 32.dp, end = 32.dp, top = 18.dp, bottom = 36.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        if (current != null) {
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    if (current.number > 0) {
                                        Text("${current.number}", color = Yellow, fontWeight = FontWeight.Bold, fontSize = 26.sp)
                                        Spacer(Modifier.width(12.dp))
                                    }
                                    Text(
                                        current.name,
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 24.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    if (current.id in favorites) {
                                        Spacer(Modifier.width(10.dp))
                                        Icon(Icons.Filled.Star, contentDescription = "Favorite", tint = Yellow, modifier = Modifier.size(24.dp))
                                    }
                                }
                                val details = listOfNotNull(current.group, current.category, current.language).distinct().joinToString(" · ")
                                if (details.isNotEmpty()) {
                                    Text(details, color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp, maxLines = 1)
                                }
                            }
                        } else {
                            Spacer(Modifier.weight(1f))
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Clock()
                            if (Edition.HAS_WEATHER) WeatherNow()
                        }
                    }
                }
            }

            // The "advertise with us" line in its own band between the player and the strip, covering
            // neither (the owner, 2026-10-08).
            if (Edition.LIVE_TV) EditionTicker(
                Modifier.fillMaxWidth().height(40.dp).background(Color.Black),
                big = true,
                band = true,
            )

            // The strip: Modes, the group, then the group's channels.
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(stripHeight)
                    .background(Brush.verticalGradient(listOf(palette.homeTop, palette.homeBottom))),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                LazyRow(
                    state = rowState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 24.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    item(key = "modes") {
                        StripButton(
                            height = tileHeight,
                            focused = cursor == AT_MODES,
                            top = "Modes",
                            bottom = "Change mode",
                            icon = true,
                            onTap = { tapModes() },
                        )
                    }
                    item(key = "group") {
                        StripButton(
                            height = tileHeight,
                            focused = cursor == AT_GROUP,
                            top = group?.title ?: "Channels",
                            bottom = if (list.isEmpty()) "" else "${if (onTile) at + 1 else list.indexOfFirst { it.id == playingId } + 1}".let {
                                if (it == "0") "${list.size} channels" else "$it / ${list.size}"
                            },
                            icon = false,
                            arrows = groups.size > 1,
                            onTap = { tapGroup() },
                        )
                    }
                    itemsIndexed(list, key = { _, c -> c.id }) { i, channel ->
                        StripTile(
                            channel = channel,
                            width = tileWidth,
                            height = tileHeight,
                            focused = onTile && i == at,
                            live = channel.id == playingId,
                            favorite = channel.id in favorites,
                            onTap = { tapTile(i, channel) },
                            onLongPress = { holdTile(i, channel) },
                        )
                    }
                }
            }
        }
    }
}

/** The Modes button and the group button at the start of the strip. */
@Composable
private fun StripButton(
    height: Dp,
    focused: Boolean,
    top: String,
    bottom: String,
    icon: Boolean,
    arrows: Boolean = false,
    onTap: () -> Unit,
) {
    val scale by animateFloatAsState(if (focused) 1.08f else 1f, label = "scale")
    Column(
        Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .tap(onTap = onTap)
            .height(height)
            .width(if (icon) height * 1.25f else height * 1.9f)
            .clip(TileShape)
            .background(if (focused) Yellow else Color.White.copy(alpha = 0.12f))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val ink = if (focused) Color.Black else Color.White
        if (icon) {
            Icon(Icons.Filled.Dashboard, contentDescription = null, tint = ink, modifier = Modifier.size(26.dp))
            Spacer(Modifier.height(4.dp))
            Text(top, color = ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
        } else {
            Text(
                if (arrows) "‹  $top  ›" else top,
                color = ink,
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (bottom.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text(bottom, color = ink.copy(alpha = 0.75f), fontSize = 12.sp, maxLines = 1)
            }
            if (focused && arrows) {
                Text("OK: next group", color = ink.copy(alpha = 0.75f), fontSize = 11.sp, maxLines = 1)
            }
        }
    }
}

/** One channel in the strip: its logo, number and name (no pictures, so the strip stays quick). */
@Composable
private fun StripTile(
    channel: Channel,
    width: Dp,
    height: Dp,
    focused: Boolean,
    live: Boolean,
    favorite: Boolean,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
) {
    val scale by animateFloatAsState(if (focused) 1.1f else 1f, label = "scale")
    Box(
        Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .tap(onLongPress = onLongPress, onTap = onTap)
            .size(width, height)
            .clip(TileShape)
            .background(
                when {
                    focused -> Yellow
                    live -> Color.White.copy(alpha = 0.24f)
                    else -> Color.White.copy(alpha = 0.10f)
                },
            )
            .padding(horizontal = 8.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        val ink = if (focused) Color.Black else Color.White
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            if (channel.logo != null) {
                // The channel's small logo (no live or still pictures, so the strip stays quick).
                SubcomposeAsyncImage(
                    model = channel.logo,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.height(height * 0.36f).width(width * 0.6f),
                    error = { },
                    loading = { },
                )
                Spacer(Modifier.height(3.dp))
            }
            Text(
                buildAnnotatedString {
                    if (channel.number > 0) {
                        withStyle(SpanStyle(color = if (focused) Color.Black else Yellow, fontWeight = FontWeight.Bold)) {
                            append("${channel.number}  ")
                        }
                    }
                    append(channel.name)
                },
                color = ink,
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp,
                lineHeight = 14.sp,
                maxLines = if (channel.logo != null) 2 else 3,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
        }
        // Top corners: playing now (speaker) and favourite (star).
        if (live) {
            Icon(
                Icons.Filled.VolumeUp,
                contentDescription = "Playing",
                tint = ink,
                modifier = Modifier.align(Alignment.TopStart).size(14.dp),
            )
        }
        if (favorite) {
            Icon(
                Icons.Filled.Star,
                contentDescription = "Favorite",
                tint = if (focused) Color.Black else Yellow,
                modifier = Modifier.align(Alignment.TopEnd).size(14.dp),
            )
        }
    }
}
