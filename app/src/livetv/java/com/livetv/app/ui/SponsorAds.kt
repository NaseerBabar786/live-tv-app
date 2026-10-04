package com.livetv.app.ui

import android.os.SystemClock
import android.view.TextureView
import androidx.annotation.OptIn
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.key
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.LifecycleEventObserver
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import kotlinx.coroutines.flow.first
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.sponsor.Sponsor
import com.livetv.app.sponsor.SponsorViews
import com.livetv.app.sponsor.Sponsors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** How long a sponsor stays in the 1+List strip before the next one. */
private const val STRIP_MS = 60_000L
/** The channel change card: how long it shows, how often at most, and not this soon after start. */
private const val CARD_MS = 5_000L
private const val CARD_EVERY_MS = 2 * 60_000L
private const val CARD_NOT_BEFORE_MS = 5 * 60_000L

/** The "advertise with us" ticker: half a minute after start, then every 30 seconds, scrolling across once. */
private const val TICKER_FIRST_MS = 30_000L
private const val TICKER_EVERY_MS = 30_000L
private const val TICKER_DP_PER_SECOND = 110f
/** When the ticker runs next (elapsed realtime), kept across screens so going in and out of a channel doesn't reset it. */
private var nextTickerAt = 0L

/**
 * One line of text that scrolls from right to left across [modifier]'s space every 30 seconds,
 * inviting businesses to advertise. The owner sets the words on tv.bulkbazaar.ca/sponsors.
 * [big] is the band above the tiles of 1×2 and 2×2; otherwise it's the line beside the channel count.
 * [always] keeps it running without the 30 second wait (News mode's bottom band).
 */
@Composable
fun SponsorTicker(modifier: Modifier = Modifier, big: Boolean = false, always: Boolean = false) {
    val text by Sponsors.ticker.collectAsStateWithLifecycle()
    val words = text ?: return
    var running by remember { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(words) {
        // News mode: the line runs again and again, with a short pause between.
        if (always) while (true) {
            running = true
            snapshotFlow { running }.first { !it }
            delay(2_000)
        }
        if (nextTickerAt == 0L) nextTickerAt = SystemClock.elapsedRealtime() + TICKER_FIRST_MS
        while (true) {
            delay(maxOf(0L, nextTickerAt - SystemClock.elapsedRealtime()))
            if (!lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
                nextTickerAt = SystemClock.elapsedRealtime() + TICKER_FIRST_MS
                continue
            }
            nextTickerAt = SystemClock.elapsedRealtime() + TICKER_EVERY_MS
            running = true
            snapshotFlow { running }.first { !it }
        }
    }
    BoxWithConstraints(modifier.clipToBounds()) {
        if (!running) return@BoxWithConstraints
        val boxWidth = constraints.maxWidth.toFloat()
        val pxPerSecond = with(LocalDensity.current) { TICKER_DP_PER_SECOND.dp.toPx() }
        var textWidth by remember { mutableIntStateOf(0) }
        val offset = remember { Animatable(boxWidth) }
        LaunchedEffect(textWidth) {
            if (textWidth == 0) return@LaunchedEffect
            val ms = ((boxWidth + textWidth) / pxPerSecond * 1000).toInt()
            offset.snapTo(boxWidth)
            offset.animateTo(-textWidth.toFloat(), tween(ms, easing = LinearEasing))
            running = false
        }
        Text(
            words,
            color = FocusColor,
            style = if (big) MaterialTheme.typography.titleLarge else MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier
                .align(Alignment.CenterStart)
                .wrapContentWidth(Alignment.Start, unbounded = true)
                .onSizeChanged { textWidth = it.width }
                .graphicsLayer { translationX = offset.value },
        )
    }
}

/** The sponsor strip under the 1+List channel list: one sponsor's picture, the next every minute. */
@Composable
fun SponsorStrip(modifier: Modifier = Modifier) {
    val all by Sponsors.all.collectAsStateWithLifecycle()
    val list = remember(all) { Sponsors.current() }
    if (list.isEmpty()) return
    var turn by remember { mutableIntStateOf(0) }
    val sponsor = list[Math.floorMod(turn, list.size)]
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(sponsor.id, turn) {
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) SponsorViews.count(sponsor, "strip")
        delay(STRIP_MS)
        turn++
    }
    Column(modifier.fillMaxWidth()) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(CardShape)
                .background(Color.Black),
        ) {
            SponsorPicture(sponsor, Modifier.fillMaxSize())
        }
    }
}

/**
 * The sponsor bar under the two tiles of 1×2: the sponsor's wide banner when they have one, or else
 * their picture on the left with their name, line and phone or website beside it. The next sponsor comes every minute.
 */
@Composable
fun SponsorBar(modifier: Modifier = Modifier) {
    val all by Sponsors.all.collectAsStateWithLifecycle()
    val list = remember(all) { Sponsors.current() }
    if (list.isEmpty()) return
    var turn by remember { mutableIntStateOf(0) }
    val sponsor = list[Math.floorMod(turn, list.size)]
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(sponsor.id, turn) {
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) SponsorViews.count(sponsor, "bar")
        delay(STRIP_MS)
        turn++
    }
    // A sponsor with a wide banner gets it full size; otherwise their picture with their words beside it.
    val banner = sponsor.banner
    if (banner != null) {
        Box(modifier.aspectRatio(8f).clip(ChipShape).background(Color.White)) {
            Image(banner, contentDescription = sponsor.name, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
        }
        return
    }
    Row(
        modifier
            .clip(CardShape)
            .background(Color(0xE6101018))
            .padding(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .fillMaxHeight()
                .aspectRatio(16f / 9f)
                .clip(ChipShape)
                .background(Color.Black),
        ) {
            SponsorPicture(sponsor, Modifier.fillMaxSize())
        }
        Column(Modifier.padding(horizontal = 12.dp).widthIn(max = 520.dp)) {
            Text(
                sponsor.name,
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val words = listOf(sponsor.line, sponsor.contact).filter { it.isNotBlank() }.joinToString(" · ")
            if (words.isNotEmpty()) {
                Text(words, color = FocusColor, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/**
 * A sponsor's picture filling a fixed box edge to edge (under the side tiles of 1+3), the next one
 * every minute. Counted with the 1+List strip.
 */
@Composable
fun SponsorBox(modifier: Modifier = Modifier) {
    val all by Sponsors.all.collectAsStateWithLifecycle()
    val list = remember(all) { Sponsors.current() }
    if (list.isEmpty()) return
    var turn by remember { mutableIntStateOf(0) }
    val sponsor = list[Math.floorMod(turn, list.size)]
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(sponsor.id, turn) {
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) SponsorViews.count(sponsor, "strip")
        delay(STRIP_MS)
        turn++
    }
    Box(modifier.background(Color.Black)) {
        SponsorPicture(sponsor, Modifier.fillMaxSize(), fill = true)
    }
}

/**
 * News mode's sponsor corner: a sponsor's picture filling the corner, the next one every minute, like [SponsorBox].
 * A sponsor with a video link plays it instead, muted and looping, while [allowVideo] is true
 * (News mode turns it off for a while when the live channel starts to stutter). The picture shows
 * until the video's first frame, and stays when the video can't play. A QR code in the corner
 * lets viewers call the sponsor or open their website with their phone's camera.
 */
@Composable
fun SponsorVideoBox(modifier: Modifier = Modifier, allowVideo: Boolean = true) {
    val all by Sponsors.all.collectAsStateWithLifecycle()
    val list = remember(all) { Sponsors.current() }
    if (list.isEmpty()) return
    var turn by remember { mutableIntStateOf(0) }
    val sponsor = list[Math.floorMod(turn, list.size)]
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(sponsor.id, turn) {
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) SponsorViews.count(sponsor, "strip")
        delay(STRIP_MS)
        turn++
    }
    BoxWithConstraints(modifier.background(Color.Black)) {
        SponsorPicture(sponsor, Modifier.fillMaxSize(), fill = true)
        if (allowVideo && sponsor.video.isNotEmpty()) key(sponsor.id, turn) { SponsorVideo(sponsor.video) }
        val code = remember(sponsor.contact) { SponsorQr.bitmap(sponsor.contact) }
        if (code != null) {
            Image(
                code,
                contentDescription = "Scan to contact ${sponsor.name}",
                filterQuality = FilterQuality.None,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(6.dp)
                    .size(maxHeight * 0.3f)
                    .background(Color.White)
                    .padding(3.dp),
            )
        }
    }
}

/** A sponsor's video: muted (its audio isn't even decoded), at most 720p, looping; hidden until it shows a picture. */
@OptIn(UnstableApi::class)
@Composable
private fun SponsorVideo(url: String) {
    val context = LocalContext.current
    var showing by remember { mutableStateOf(false) }
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            volume = 0f
            repeatMode = Player.REPEAT_MODE_ONE
            trackSelectionParameters = trackSelectionParameters.buildUpon()
                .setMaxVideoSize(1280, 720)
                .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true)
                .build()
            addListener(object : Player.Listener {
                override fun onRenderedFirstFrame() { showing = true }
                override fun onPlayerError(error: PlaybackException) { showing = false }
            })
            setMediaItem(MediaItem.fromUri(url))
            playWhenReady = true
            prepare()
        }
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> player.pause()
                Lifecycle.Event.ON_START -> player.play()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            player.release()
        }
    }
    AndroidView(
        factory = { ctx -> TextureView(ctx).also { player.setVideoTextureView(it) } },
        onRelease = { player.clearVideoTextureView(it) },
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer { alpha = if (showing) 1f else 0f },
    )
}

/**
 * A small sponsor card in the bottom right corner for a few seconds after the channel changes,
 * at most once every 2 minutes. It never takes the focus or covers the middle of the picture.
 */
@Composable
fun SponsorCard(channelId: String?) {
    val scope = rememberCoroutineScope()
    val startedAt = remember { SystemClock.elapsedRealtime() }
    var lastCard by remember { mutableStateOf(startedAt - CARD_EVERY_MS + CARD_NOT_BEFORE_MS) }
    var lastChannel by remember { mutableStateOf(channelId) }
    var showing by remember { mutableStateOf<Sponsor?>(null) }
    LaunchedEffect(channelId) {
        if (channelId == null || channelId == lastChannel) return@LaunchedEffect
        lastChannel = channelId
        val now = SystemClock.elapsedRealtime()
        if (now - lastCard < CARD_EVERY_MS) return@LaunchedEffect
        val sponsor = Sponsors.next("card") ?: return@LaunchedEffect
        lastCard = now
        scope.launch {
            // Let the new channel's picture come up first.
            delay(1_500)
            showing = sponsor
            SponsorViews.count(sponsor, "card")
            delay(CARD_MS)
            if (showing === sponsor) showing = null
        }
    }
    val sponsor = showing ?: return
    // Not in the small picture-in-picture window.
    val width = LocalConfiguration.current.screenWidthDp
    if (width < 400) return
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.BottomEnd) {
        Column(
            Modifier
                .width(minOf(280, width * 45 / 100).dp)
                .clip(CardShape)
                .background(Color(0xE6101018)),
        ) {
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black)) {
                SponsorPicture(sponsor, Modifier.fillMaxSize())
            }
            val words = listOf(sponsor.name, sponsor.contact).filter { it.isNotBlank() }.joinToString(" · ")
            run {
                Text(
                    words,
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }
    }
}

/** A sponsor's picture: whole, or stretched to [fill] its box edge to edge. */
@Composable
private fun SponsorPicture(sponsor: Sponsor, modifier: Modifier, fill: Boolean = false) {
    val picture = sponsor.picture ?: return
    Image(picture, contentDescription = sponsor.name, contentScale = if (fill) ContentScale.FillBounds else ContentScale.Fit, modifier = modifier)
}
