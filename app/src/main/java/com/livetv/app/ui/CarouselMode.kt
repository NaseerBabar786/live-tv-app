package com.livetv.app.ui

import com.livetv.app.BuildConfig
import com.livetv.app.data.MyChannel
import android.view.TextureView
import android.widget.Toast
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import coil3.compose.SubcomposeAsyncImage
import com.livetv.app.Edition
import com.livetv.app.Watching
import com.livetv.app.data.Channel
import com.livetv.app.data.YouTube
import com.livetv.app.player.StreamPlayer
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.roundToInt

/** One set of channels the carousel goes through: Favorites, a country, or every channel. */
private class CarouselGroup(val key: String, val title: String, val channels: List<Channel>)

/** The group Carousel was on, kept while a channel plays full screen. */
private var sessionGroupKey: String? = null

private val CarouselShape = RoundedCornerShape(26.dp)

/**
 * "Carousel" mode: one big rounded player in the middle of the screen, with the channels before
 * and after it peeking in at the sides. Left and Right slide to the previous or next channel,
 * Up and Down change the group (Favorites, then each country), OK opens the channel full screen
 * and holding OK adds it to Favorites (or takes it off). Only the middle channel plays; the side
 * cards show still pictures, so a Chromecast only decodes one video.
 */
@Composable
internal fun CarouselMode(
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
    /** Back: shows the top bar with the Modes button. */
    onBack: () -> Unit,
    /** The carousel has the remote's cursor again (the top bar hides). */
    onFocused: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val palette = Themes.current

    val groups = remember(channels, favorites) {
        buildList {
            val favs = channels.filter { it.id in favorites }
            if (favs.isNotEmpty()) add(CarouselGroup("favorites", "Favorites", favs))
            channels.mapNotNull { it.group }.distinct().forEach { group ->
                add(CarouselGroup("group:$group", group, channels.filter { it.group == group }))
            }
            if (channels.isNotEmpty()) add(CarouselGroup("all", "All channels", channels))
        }
    }
    var groupKey by remember { mutableStateOf(sessionGroupKey) }
    var index by remember { mutableIntStateOf(0) }
    // Opening, or coming back from full screen: the channel watched last, in its group.
    LaunchedEffect(groups.isNotEmpty()) {
        if (groups.isEmpty()) return@LaunchedEffect
        val group = groups.firstOrNull { g -> g.key == groupKey && g.channels.any { it.id == lastWatchedId } }
            ?: groups.firstOrNull { g -> g.channels.any { it.id == lastWatchedId } }
            ?: groups.firstOrNull { it.key == groupKey }
            ?: groups.first()
        groupKey = group.key
        index = group.channels.indexOfFirst { it.id == lastWatchedId }.coerceAtLeast(0)
    }
    val groupAt = groups.indexOfFirst { it.key == groupKey }.coerceAtLeast(0)
    val group = groups.getOrNull(groupAt)
    val list = group?.channels.orEmpty()
    val at = if (list.isEmpty()) 0 else index.coerceIn(0, list.size - 1)
    fun channelAt(i: Int): Channel? = if (list.isEmpty()) null else list[Math.floorMod(i, list.size)]
    val current = channelAt(at)
    LaunchedEffect(groupKey) { sessionGroupKey = groupKey }

    // The cards slide one place when Left or Right is pressed: -1..1 of a card's width.
    val slide = remember { Animatable(0f) }
    // A new group fades in.
    val fade = remember { Animatable(1f) }
    fun step(by: Int) {
        if (list.size < 2) return
        index = Math.floorMod(at + by, list.size)
        scope.launch {
            slide.snapTo(by.toFloat())
            slide.animateTo(0f, tween(280))
        }
    }
    fun changeGroup(by: Int) {
        if (groups.size < 2) return
        val next = groups[Math.floorMod(groupAt + by, groups.size)]
        groupKey = next.key
        index = next.channels.indexOfFirst { it.id == current?.id }.coerceAtLeast(0)
        scope.launch {
            slide.snapTo(0f)
            fade.snapTo(0.2f)
            fade.animateTo(1f, tween(300))
        }
    }
    // Holding OK, or a long press on the middle card: adds the channel to Favorites (or takes it off).
    fun toggleFavorite(channel: Channel) {
        val adding = channel.id !in favorites
        onToggleFavorite(channel)
        Toast.makeText(
            context,
            if (adding) "${channel.name} added to Favorites" else "${channel.name} removed from Favorites",
            Toast.LENGTH_SHORT,
        ).show()
    }

    // The middle channel plays live, with sound, once the cursor rests on it.
    val stream = remember { StreamPlayer(context, preview = true) }
    val view = remember { ViewHolder() }
    var showing by remember { mutableStateOf(false) }
    var playingId by remember { mutableStateOf<String?>(null) }
    var movedAt by remember { mutableLongStateOf(0L) }
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
    // Our YouTube channels and Bazaar Hits play their own page in the middle card (1.9.60), not their backup films.
    var pageFailed by remember(current?.id) { mutableStateOf(false) }
    val page = current?.takeIf { playing && !pageFailed }?.let { MyChannel.pageFor(it, BuildConfig.VERSION_CODE) }
    LaunchedEffect(current?.id, playing, page) {
        movedAt = System.currentTimeMillis()
        // The channel sliding away keeps its last frame as its picture.
        playingId?.let { if (showing) keepPicture(it, view.picture()) }
        stream.stop()
        showing = false
        playingId = null
        val channel = current ?: return@LaunchedEffect
        if (!playing) return@LaunchedEffect
        delay(500) // only once the cursor stops
        currentOnWatch(channel)
        playingId = channel.id
        if (page == null) stream.play(channel)
    }
    LaunchedEffect(sound) { stream.player.volume = if (sound) 1f else 0f }
    DisposableEffect(playingId, sound, playing) {
        val channel = playingId?.let { id -> channels.firstOrNull { it.id == id } }
        if (channel != null && sound && playing) Watching.watch(stream, channel)
        onDispose { Watching.stop(stream) }
    }

    // The side cards: a second, silent player opens each neighbour in turn, keeps its first frame
    // and closes again (the nearest first; Wi-Fi or Ethernet only).
    val grabber = remember {
        StreamPlayer(context, preview = true).apply {
            player.volume = 0f
            player.trackSelectionParameters = player.trackSelectionParameters.buildUpon().setMaxVideoSizeSd().build()
        }
    }
    val grabView = remember { ViewHolder() }
    var grabId by remember { mutableStateOf<String?>(null) }
    var grabShowing by remember { mutableStateOf(false) }
    DisposableEffect(grabber) {
        val listener = object : Player.Listener {
            override fun onRenderedFirstFrame() {
                grabShowing = true
            }
        }
        grabber.player.addListener(listener)
        onDispose {
            grabber.player.removeListener(listener)
            grabber.release()
        }
    }
    val neighbours by rememberUpdatedState(
        listOf(1, -1, 2, -2, 3, -3).mapNotNull { channelAt(at + it) }.filter { it.id != current?.id }.distinctBy { it.id },
    )
    LaunchedEffect(playing) {
        if (!playing) return@LaunchedEffect
        delay(1_500) // let the middle channel start first
        while (true) {
            if (metered(context)) {
                delay(10_000)
                continue
            }
            val still = System.currentTimeMillis() - movedAt
            if (still < 1_000) {
                delay(1_000 - still)
                continue
            }
            val now = System.currentTimeMillis()
            val channel = neighbours.firstOrNull { now - (browsePictureAt[it.id] ?: 0L) > PICTURE_FRESH_MS }
            if (channel == null || YouTube.isYouTube(channel.url) || MyChannel.pageFor(channel, BuildConfig.VERSION_CODE) != null) {
                if (channel != null) browsePictureAt[channel.id] = now
                delay(1_000)
                continue
            }
            grabShowing = false
            grabId = channel.id
            val startedAt = movedAt
            var interrupted = false
            try {
                grabber.play(channel)
                withTimeoutOrNull(10_000) { snapshotFlow { grabShowing || movedAt != startedAt }.first { it } }
                if (grabShowing && movedAt == startedAt) delay(400)
                if (grabShowing && movedAt == startedAt) keepPicture(channel.id, grabView.picture())
                interrupted = movedAt != startedAt
            } finally {
                grabber.stop()
                grabId = null
                grabShowing = false
            }
            if (!interrupted) browsePictureAt[channel.id] = System.currentTimeMillis()
            delay(400)
        }
    }

    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    var held by remember { mutableStateOf(false) }

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(palette.homeTop, palette.homeBottom)))
            .focusRequester(focus)
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onPreviewKeyEvent { e ->
                when {
                    e.key == Key.Back -> {
                        if (e.type == KeyEventType.KeyUp) onBack()
                        true
                    }
                    // OK opens the channel full screen; held down, it adds it to Favorites (or takes it off).
                    e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter -> {
                        if (e.type == KeyEventType.KeyDown) {
                            if (e.nativeKeyEvent.repeatCount >= 6 && !held) {
                                held = true
                                current?.let { toggleFavorite(it) }
                            }
                        } else if (e.type == KeyEventType.KeyUp) {
                            if (!held) current?.let(onOpen)
                            held = false
                        }
                        true
                    }
                    e.type != KeyEventType.KeyDown -> false
                    e.key == Key.DirectionLeft -> { step(-1); true }
                    e.key == Key.DirectionRight -> { step(1); true }
                    e.key == Key.DirectionUp || e.key == Key.ChannelUp -> { changeGroup(-1); true }
                    e.key == Key.DirectionDown || e.key == Key.ChannelDown -> { changeGroup(1); true }
                    else -> false
                }
            }
            // Swipes, like scrolling: left brings the next channel, right the previous one;
            // up brings the next group, down the previous one.
            .swipe { dir ->
                when (dir) {
                    Swipe.Left -> step(1)
                    Swipe.Right -> step(-1)
                    Swipe.Up -> changeGroup(1)
                    Swipe.Down -> changeGroup(-1)
                }
            }
            .focusable(),
    ) {
        val density = LocalDensity.current
        val cardWidth = maxWidth * 0.68f
        val cardHeight = cardWidth * 9f / 16f
        val gap = maxWidth * 0.025f
        val top = (maxHeight - cardHeight) / 2 + maxHeight * 0.03f
        val left = (maxWidth - cardWidth) / 2
        val stepPx = with(density) { (cardWidth + gap).toPx() }
        val leftPx = with(density) { left.toPx() }
        val topPx = with(density) { top.toPx() }

        if (current == null) {
            Text(
                "Loading channels…",
                color = palette.onSurfaceVariant,
                modifier = Modifier.align(Alignment.Center),
            )
        }
        // The cards: two on each side (only the nearest peek in) and the middle one on top.
        val places = if (list.size < 2) listOf(0) else listOf(-2, 2, -1, 1, 0)
        for (k in places) {
            val channel = channelAt(at + k) ?: continue
            key(k, channel.id) {
                val middle = k == 0
                Box(
                    Modifier
                        .offset { IntOffset((leftPx + stepPx * (k + slide.value)).roundToInt(), topPx.roundToInt()) }
                        .graphicsLayer {
                            // A card dims and shrinks a little as it moves away from the middle.
                            val away = kotlin.math.abs(k + slide.value).coerceAtMost(1f)
                            val scale = 1f - 0.08f * away
                            scaleX = scale
                            scaleY = scale
                            alpha = fade.value * (1f - 0.45f * away)
                        }
                        .size(cardWidth, cardHeight)
                        .then(
                            if (middle) Modifier.border(BorderStroke(3.dp, Color.White.copy(alpha = 0.9f)), CarouselShape)
                            else Modifier,
                        )
                        .padding(if (middle) 3.dp else 0.dp)
                        .clip(CarouselShape)
                        .background(Brush.linearGradient(listOf(palette.surfaceVariant, palette.surface))),
                    contentAlignment = Alignment.Center,
                ) {
                    // The playing card shows a loading circle while it starts, not its logo (owner, 2026-10-07).
                    val starting = middle && playingId == channel.id
                    if (starting) {
                        // drawn over the still picture below
                    } else if (channel.logo != null) {
                        SubcomposeAsyncImage(
                            model = channel.logo,
                            contentDescription = null,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize().padding(horizontal = 80.dp, vertical = 48.dp),
                            error = { Initials(channel.name) },
                            loading = { Initials(channel.name) },
                        )
                    } else {
                        Initials(channel.name)
                    }
                    browsePictures[channel.id]?.let {
                        Image(it, contentDescription = null, contentScale = ContentScale.FillBounds, modifier = Modifier.fillMaxSize())
                    }
                    if (starting && (page != null || !showing)) LoadingSpinner()
                    if (!middle && grabId == channel.id) {
                        AndroidView(
                            factory = { ctx -> TextureView(ctx).also { grabView.view = it; grabber.player.setVideoTextureView(it) } },
                            onRelease = {
                                if (grabView.view === it) grabView.view = null
                                grabber.player.clearVideoTextureView(it)
                            },
                            modifier = Modifier.fillMaxSize().graphicsLayer { alpha = if (grabShowing) 1f else 0f },
                        )
                    }
                    if (middle && playingId == channel.id && page != null) {
                        key(page) {
                            WebPreview(page, Modifier.fillMaxSize(), still = false, onFallback = {
                                if (MyChannel.webPage(channel) != null) pageFailed = true
                            })
                        }
                    } else if (middle && playingId == channel.id) {
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
                    // A tap on the middle card: full screen (held: Favorites); on a side card: slides to it.
                    // Over the picture, so the web pages don't take the tap.
                    Box(
                        Modifier.matchParentSize().then(
                            if (middle) {
                                Modifier.tap(onLongPress = { toggleFavorite(channel) }) { onOpen(channel) }
                            } else {
                                Modifier.tap { step(k) }
                            },
                        ),
                    )
                    if (middle && channel.id in favorites) {
                        Icon(
                            Icons.Filled.Star,
                            contentDescription = "Favorite",
                            tint = palette.secondary,
                            modifier = Modifier.align(Alignment.TopEnd).padding(14.dp).size(28.dp),
                        )
                    }
                }
            }
        }

        // Top left: the channel's number and name, and its group.
        if (current != null) {
            Column(Modifier.align(Alignment.TopStart).padding(start = 40.dp, top = 22.dp).width(left + cardWidth * 0.7f)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    if (current.number > 0) {
                        Text("${current.number}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 26.sp)
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
                }
                val details = listOfNotNull(current.category, current.language).distinct().joinToString(" · ")
                if (details.isNotEmpty()) {
                    Text(details, color = palette.onSurfaceVariant, fontSize = 13.sp, maxLines = 1)
                }
            }
        }
        // Top right: the date, time and weather.
        Column(Modifier.align(Alignment.TopEnd).padding(end = 40.dp, top = 26.dp), horizontalAlignment = Alignment.End) {
            Clock()
            if (Edition.HAS_WEATHER) WeatherNow()
        }
        // Under the cards: the groups (Up and Down) and where this channel is in its group.
        if (group != null) {
            Row(
                Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(bottom = 18.dp),
                horizontalArrangement = Arrangement.spacedBy(18.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (groups.size > 1) {
                    Text(
                        "▲ ${groups[Math.floorMod(groupAt - 1, groups.size)].title}",
                        color = palette.onSurfaceVariant,
                        fontSize = 13.sp,
                        maxLines = 1,
                        modifier = Modifier.tap { changeGroup(-1) },
                    )
                }
                Text(
                    "${group.title}  ${at + 1} / ${list.size}",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(Color.White.copy(alpha = 0.14f))
                        .padding(horizontal = 16.dp, vertical = 5.dp),
                )
                if (groups.size > 1) {
                    Text(
                        "▼ ${groups[Math.floorMod(groupAt + 1, groups.size)].title}",
                        color = palette.onSurfaceVariant,
                        fontSize = 13.sp,
                        maxLines = 1,
                        modifier = Modifier.tap { changeGroup(1) },
                    )
                }
                Text("Hold OK: Favorites", color = palette.onSurfaceVariant.copy(alpha = 0.7f), fontSize = 12.sp, maxLines = 1)
            }
        }
    }
}
