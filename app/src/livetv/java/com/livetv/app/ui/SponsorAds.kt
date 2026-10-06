package com.livetv.app.ui

import android.os.SystemClock
import android.content.Context
import android.view.TextureView
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.rememberUpdatedState
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
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import com.livetv.app.SponsorKey
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
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
import androidx.compose.runtime.mutableLongStateOf
import kotlinx.coroutines.Job
import kotlinx.coroutines.withTimeoutOrNull
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
private const val CARD_SITE_MS = 8_000L
private const val CARD_EVERY_MS = 3 * 60_000L
private const val CARD_NOT_BEFORE_MS = 3 * 60_000L
/** A sponsor's video pop-up: at most this often (other times their picture card shows). */
private const val VIDEO_EVERY_MS = 30 * 60_000L
/** Full screen, YouTube style (1.9.58): up to [POD_SIZE] ads back to back, each picture ad [PICTURE_MS] long,
 *  with a countdown; Back skips an ad once it has been on for [SKIP_AFTER_MS]. Owner's pop-up ad length
 *  rule: ads are 10 to 60 seconds and a break never runs over [BREAK_MS] (an ad that doesn't fit what's
 *  left is left out; a video of unknown length is stopped when the minute is up). */
private const val POD_SIZE = 2
private const val PICTURE_MS = 20_000L
private const val BREAK_MS = 60_000L
private const val SKIP_AFTER_MS = 10_000L

/** The Cable TV promo video from the website's home page (see [SponsorCard]). */
private const val PROMO_ID = "promo"
private const val PROMO_URL = "https://tv.bulkbazaar.ca/media/livetv-promo.mp4"
private const val PROMO_EVERY_MS = 60 * 60_000L
private const val PROMO_NOT_BEFORE_MS = 2 * 60_000L
/** The promo was shown already since the app started. */
private var promoShown = false

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
 * [everyMs] above 0 runs it on its own clock instead, once every [everyMs] (the full-screen channel),
 * on a dark band, skipping a turn while [skip] says something else is on screen.
 * [band] puts the dark band behind it too (the line along the bottom of the channel screens).
 */
@Composable
fun SponsorTicker(
    modifier: Modifier = Modifier,
    big: Boolean = false,
    always: Boolean = false,
    everyMs: Long = 0L,
    skip: () -> Boolean = { false },
    band: Boolean = false,
) {
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
        // Full-screen channel: every [everyMs], counted from when the channel opened.
        if (everyMs > 0) while (true) {
            delay(everyMs)
            if (!lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED) || skip()) continue
            running = true
            snapshotFlow { running }.first { !it }
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
        if (everyMs > 0 || band) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f)))
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
    val opener = rememberSiteOpener()
    LaunchedEffect(sponsor.id, turn) {
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) SponsorViews.count(sponsor, "bar")
        delay(STRIP_MS)
        while (opener.sponsor != null) delay(1_000L)
        turn++
    }
    // A sponsor with a wide banner gets it full size; otherwise their picture with their words beside it.
    // A tap opens their website (the arrows belong to the tiles above it).
    val banner = sponsor.banner
    if (banner != null) {
        Box(modifier.sponsorTap(sponsor, opener).aspectRatio(8f).clip(ChipShape).background(Color.White)) {
            Image(banner, contentDescription = sponsor.name, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
        }
        return
    }
    Row(
        modifier
            .sponsorTap(sponsor, opener)
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
    val opener = rememberSiteOpener()
    LaunchedEffect(sponsor.id, turn) {
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) SponsorViews.count(sponsor, "strip")
        delay(STRIP_MS)
        while (opener.sponsor != null) delay(1_000L)
        turn++
    }
    Box(modifier.sponsorTap(sponsor, opener).background(Color.Black)) {
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
fun SponsorVideoBox(modifier: Modifier = Modifier, allowVideo: Boolean = true, clickable: Boolean = false, onBack: (() -> Unit)? = null) {
    val all by Sponsors.all.collectAsStateWithLifecycle()
    val list = remember(all) { Sponsors.current() }
    if (list.isEmpty()) return
    var turn by remember { mutableIntStateOf(0) }
    val sponsor = list[Math.floorMod(turn, list.size)]
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var focused by remember { mutableStateOf(false) }
    val opener = rememberSiteOpener()
    LaunchedEffect(sponsor.id, turn) {
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) SponsorViews.count(sponsor, "strip")
        delay(STRIP_MS)
        // The same sponsor stays while the remote is on it or their website is open.
        while (focused || opener.sponsor != null) delay(1_000L)
        turn++
    }
    // With a website, the sponsor is one more tile: the arrows reach it and OK opens the site
    // inside the app (Google TV has no browser); Back from the site comes straight back here.
    // Where the arrows can't reach it (News, CP24), a tap still opens it on phones.
    val site = if (clickable) sponsor.site else null
    val click = if (site == null) Modifier.sponsorTap(sponsor, opener) else {
        Modifier
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { e ->
                if (e.key != Key.Back || onBack == null) return@onPreviewKeyEvent false
                if (e.type == KeyEventType.KeyUp) onBack()
                true
            }
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                opener.open(sponsor)
            }
    }
    BoxWithConstraints(modifier.then(click).background(Color.Black)) {
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
        if (site != null && focused) {
            Box(Modifier.fillMaxSize().border(3.dp, FocusColor))
            Text(
                "OK: visit website",
                color = Color.Black,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                maxLines = 1,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 6.dp)
                    .background(FocusColor, androidx.compose.foundation.shape.RoundedCornerShape(50))
                    .padding(horizontal = 10.dp, vertical = 3.dp),
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
 * at most once every 3 minutes. It never takes the focus or covers the middle of the picture.
 * A sponsor whose pop-up is set to video plays their video in a bigger window instead, to the end
 * (on a full screen channel, at most every [VIDEO_EVERY_MS]); with no such sponsor, the Cable TV
 * promo plays like that once per start. OK opens the sponsor's website; back from it, the video goes on.
 */
@Composable
fun SponsorCard(channelId: String?, fullScreen: Boolean) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("sponsors", Context.MODE_PRIVATE) }
    val startedAt = remember { SystemClock.elapsedRealtime() }
    var lastCard by remember { mutableStateOf(startedAt - CARD_EVERY_MS + CARD_NOT_BEFORE_MS) }
    var lastChannel by remember { mutableStateOf(channelId) }
    var showing by remember { mutableStateOf<Sponsor?>(null) }
    var video by remember { mutableStateOf<Sponsor?>(null) }
    // Which ad of the break this is ("Ad 1 of 2"), and when the picture ad came up and for how long.
    var podAt by remember { mutableIntStateOf(0) }
    var podSize by remember { mutableIntStateOf(1) }
    var shownAt by remember { mutableLongStateOf(0L) }
    var shownFor by remember { mutableLongStateOf(CARD_MS) }
    var podJob by remember { mutableStateOf<Job?>(null) }
    // A video ad: the most it may play (what's left of the break's minute), and how much it played.
    var videoMax by remember { mutableLongStateOf(BREAK_MS) }
    var videoPlayed by remember { mutableLongStateOf(0L) }
    val isFullScreen by rememberUpdatedState(fullScreen)
    val opener = rememberSiteOpener()
    // While the card or video shows on a full-screen channel, OK on the remote (or a tap) opens the
    // sponsor's website. Not in 1+List and the other layouts: there OK opens the channel picked
    // (1.9.57; OK on Bazaar Cinema went to the sponsor's website instead).
    val current = showing ?: video
    DisposableEffect(current, fullScreen) {
        if (current?.site != null && fullScreen) SponsorKey.onOk = { if (showing === current) showing = null; opener.open(current) }
        onDispose { SponsorKey.onOk = null }
    }
    // The next ad break: on a full-screen channel up to [POD_SIZE] sponsors one after the other, like
    // YouTube's ads (each their picture card, or their video when it's due); otherwise one short card.
    // [wait] lets a new channel's picture come up first.
    fun popUp(wait: Long) {
        if (podJob?.isActive == true) return
        val first = Sponsors.next("card") ?: return
        val pod = if (isFullScreen) {
            val more = (2..POD_SIZE).mapNotNull { Sponsors.next("card") }
            // Only as many as fit in the break's minute (a video of unknown length counted as 30 s;
            // at most one video per [VIDEO_EVERY_MS]).
            var total = 0L
            var videoDue = System.currentTimeMillis() - prefs.getLong("videoAt", 0L) >= VIDEO_EVERY_MS
            (listOf(first) + more).distinctBy { it.id }.filterIndexed { i, sp ->
                val asVideo = videoDue && sp.popupVideo && sp.video.isNotEmpty() && sp.videoSecs * 1000L <= BREAK_MS - total
                val ms = if (asVideo) (sp.videoSecs.takeIf { it > 0 } ?: 30) * 1000L else PICTURE_MS
                (i == 0 || total + ms <= BREAK_MS).also { if (it) { total += ms; if (asVideo) videoDue = false } }
            }
        } else listOf(first)
        lastCard = SystemClock.elapsedRealtime()
        val full = isFullScreen
        podJob = scope.launch {
            delay(wait)
            // What's left of the break's minute: time spent on ads (not on a sponsor's website).
            var left = BREAK_MS
            var index = 0
            for ((i, sponsor) in pod.withIndex()) {
                // Leaving the full-screen channel ends the break.
                if (full && !isFullScreen) break
                if (i > 0) {
                    // Back from the sponsor's website first, then the next ad.
                    snapshotFlow { opener.sponsor }.first { it == null }
                    delay(600)
                    if (full && !isFullScreen) break
                }
                if (full && left < 10_000L) break
                val wall = System.currentTimeMillis()
                val videoMs = sponsor.videoSecs * 1000L
                val asVideo = sponsor.popupVideo && sponsor.video.isNotEmpty() && isFullScreen &&
                    videoMs <= left && wall - prefs.getLong("videoAt", 0L) >= VIDEO_EVERY_MS
                // A picture ad that doesn't fit what's left of the minute waits for the next break.
                if (!asVideo && full && i > 0 && PICTURE_MS > left) continue
                podAt = index++
                podSize = pod.size
                SponsorViews.count(sponsor, "card")
                if (asVideo) {
                    prefs.edit().putLong("videoAt", wall).apply()
                    showing = null
                    videoMax = left
                    video = sponsor
                    snapshotFlow { video }.first { it !== sponsor }
                    left -= videoPlayed.coerceAtLeast(1_000L)
                    continue
                }
                // A little longer when OK can open their website, so there's time to press it.
                shownFor = if (full) minOf(PICTURE_MS, left) else if (sponsor.site != null) CARD_SITE_MS else CARD_MS
                shownAt = SystemClock.elapsedRealtime()
                showing = sponsor
                withTimeoutOrNull(shownFor) { snapshotFlow { showing }.first { it !== sponsor } }
                if (showing === sponsor) showing = null
                left -= SystemClock.elapsedRealtime() - shownAt
            }
            podAt = 0
            podSize = 1
        }
    }
    LaunchedEffect(channelId) {
        if (channelId == null || channelId == lastChannel || video != null) return@LaunchedEffect
        lastChannel = channelId
        val now = SystemClock.elapsedRealtime()
        val wall = System.currentTimeMillis()
        // The Cable TV promo: once per start and at most once an hour, when no sponsor has a video pop-up.
        if (isFullScreen && !promoShown && now - startedAt >= PROMO_NOT_BEFORE_MS &&
            Sponsors.current().none { it.popupVideo && it.video.isNotEmpty() } &&
            wall - prefs.getLong("promoAt", 0L) >= PROMO_EVERY_MS
        ) {
            promoShown = true
            prefs.edit().putLong("promoAt", wall).apply()
            lastCard = now
            showing = null
            scope.launch {
                delay(1_500)
                if (isFullScreen) video = PromoSponsor
            }
            return@LaunchedEffect
        }
        if (now - lastCard < CARD_EVERY_MS) return@LaunchedEffect
        popUp(1_500)
    }
    // Staying on one channel full screen: the pop-up still comes every [CARD_EVERY_MS] (owner's rule, 1.9.58).
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val screenWidth by rememberUpdatedState(LocalConfiguration.current.screenWidthDp)
    LaunchedEffect(fullScreen) {
        if (!fullScreen) return@LaunchedEffect
        while (true) {
            delay(maxOf(1_000L, lastCard + CARD_EVERY_MS - SystemClock.elapsedRealtime()))
            if (SystemClock.elapsedRealtime() - lastCard < CARD_EVERY_MS) continue
            // Not while another window (our YouTube channels) or another app is in front, not in the small
            // picture-in-picture window, and not over a pop-up.
            if (!lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED) || screenWidth < 400 || showing != null || video != null) {
                delay(10_000)
                continue
            }
            popUp(0)
            // No sponsor at the moment: look again in a minute.
            if (SystemClock.elapsedRealtime() - lastCard >= CARD_EVERY_MS) delay(60_000)
        }
    }
    // Not in the small picture-in-picture window.
    val width = LocalConfiguration.current.screenWidthDp
    // Leaving the full screen channel (or going to the small window) closes the video.
    LaunchedEffect(fullScreen, width) { if (!fullScreen || width < 400) video = null }
    val playing = video
    if (playing != null && fullScreen && width >= 400) {
        key(playing) {
            VideoPopup(playing, width, paused = opener.sponsor != null, label = adLabel(podAt, podSize, playing),
                maxMs = if (playing === PromoSponsor) BREAK_MS else videoMax,
                onDone = { played -> videoPlayed = played; if (video === playing) video = null })
        }
        return
    }
    val sponsor = showing ?: return
    if (width < 400) return
    // Full screen: the countdown, and Back skips the ad once it has been on for [SKIP_AFTER_MS].
    var now by remember(sponsor) { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    LaunchedEffect(sponsor) {
        while (true) {
            now = SystemClock.elapsedRealtime()
            delay(250)
        }
    }
    val shownMs = now - shownAt
    BackHandler(enabled = fullScreen && shownFor > SKIP_AFTER_MS && shownMs >= SKIP_AFTER_MS) {
        if (showing === sponsor) showing = null
    }
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.BottomEnd) {
        Column(
            Modifier
                .width(minOf(210, width * 34 / 100).dp)
                .sponsorTap(sponsor, opener)
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
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
            if (sponsor.site != null && fullScreen) VisitLine()
            if (fullScreen) AdBar(
                label = adLabel(podAt, podSize, sponsor),
                secondsLeft = ((shownFor - shownMs + 999) / 1000).toInt().coerceAtLeast(0),
                skipIn = if (shownFor > SKIP_AFTER_MS) ((SKIP_AFTER_MS - shownMs + 999) / 1000).toInt().coerceAtLeast(0) else -1,
            )
        }
    }
}

/** "Ad 1 of 2" during a break of more than one ad, else "Ad" (nothing for our own Cable TV promo). */
private fun adLabel(at: Int, size: Int, sponsor: Sponsor): String =
    if (sponsor.id == PROMO_ID) "" else if (size > 1) "Ad ${at + 1} of $size" else "Ad"

/**
 * YouTube-style line under a full-screen pop-up: "Ad 1 of 2 · 0:12" on the left, and on the right
 * "Skip in 7" counting down, then "Skip ad ▸ Back" once Back skips it. [skipIn] below 0: no skipping.
 */
@Composable
private fun AdBar(label: String, secondsLeft: Int, skipIn: Int) {
    Row(
        Modifier.fillMaxWidth().background(Color.Black).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val time = "${secondsLeft / 60}:${"%02d".format(secondsLeft % 60)}"
        Text(
            listOf(label, time).filter { it.isNotEmpty() }.joinToString(" · "),
            color = FocusColor,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
        when {
            skipIn > 0 -> Text("Skip in $skipIn", color = Color.White.copy(alpha = 0.8f), fontSize = 10.sp, maxLines = 1)
            skipIn == 0 -> Text(
                "Skip ad ▸ Back",
                color = Color.Black,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                modifier = Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(4.dp)).background(Color.White).padding(horizontal = 6.dp, vertical = 1.dp),
            )
        }
    }
}

/** "Press OK to visit their website" under a pop-up. */
@Composable
private fun VisitLine() {
    Text(
        "Press OK to visit their website",
        color = Color.Black,
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
        maxLines = 1,
        modifier = Modifier.fillMaxWidth().background(FocusColor).padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

/**
 * The Cable TV promo video from the website's home page, played in the pop-up like a sponsor's video.
 * No website: viewers are already in the app, so OK and taps keep working as usual instead of opening the web page.
 */
private val PromoSponsor = Sponsor(
    id = PROMO_ID, name = "Cable TV", line = "", contact = "", start = "", end = "",
    active = true, picture = null, video = PROMO_URL, website = "", popupVideo = true,
)

/**
 * [sponsor]'s video in a window in the bottom right corner, muted, played once to the end; then it
 * closes by itself. Back closes it early. It never takes the focus, so the remote keeps changing channels;
 * OK opens the website (see [SponsorCard]) and the video waits, [paused], until the viewer comes back.
 * Nothing shows until the first frame; if the video can't play (or doesn't start within 20 seconds) it just closes.
 */
@OptIn(UnstableApi::class)
@Composable
private fun VideoPopup(sponsor: Sponsor, screenWidth: Int, paused: Boolean, label: String, maxMs: Long, onDone: (playedMs: Long) -> Unit) {
    val context = LocalContext.current
    val finish by rememberUpdatedState(onDone)
    var showing by remember { mutableStateOf(false) }
    var secondsLeft by remember { mutableIntStateOf(0) }
    var playedMs by remember { mutableLongStateOf(0L) }
    val done = { finish(playedMs) }
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            volume = 0f
            trackSelectionParameters = trackSelectionParameters.buildUpon()
                .setMaxVideoSize(1280, 720)
                .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true)
                .build()
            addListener(object : Player.Listener {
                override fun onRenderedFirstFrame() { showing = true }
                override fun onPlaybackStateChanged(state: Int) { if (state == Player.STATE_ENDED) done() }
                override fun onPlayerError(error: PlaybackException) { done() }
            })
            setMediaItem(MediaItem.fromUri(sponsor.video))
            playWhenReady = true
            prepare()
        }
    }
    LaunchedEffect(paused) { player.playWhenReady = !paused }
    LaunchedEffect(Unit) {
        delay(20_000)
        if (!showing) done()
    }
    LaunchedEffect(showing) {
        while (showing) {
            // Never past what's left of the break's minute (owner's pop-up ad length rule).
            val end = if (player.duration > 0) minOf(player.duration, maxMs) else maxMs
            secondsLeft = ((end - player.currentPosition + 999) / 1000).toInt().coerceAtLeast(0)
            playedMs = player.currentPosition
            if (playedMs >= maxMs) { done(); break }
            delay(250)
        }
    }
    // Back skips it once it has played [SKIP_AFTER_MS], like YouTube's "Skip ad" (1.9.58).
    val skippable = player.duration <= 0 || player.duration > SKIP_AFTER_MS + 1_000
    BackHandler(enabled = showing && !paused && skippable && playedMs >= SKIP_AFTER_MS) { done() }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        // Leaving the app closes it.
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) done() }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            player.release()
        }
    }
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.BottomEnd) {
        Column(
            Modifier
                .width((screenWidth * 30 / 100).dp)
                .graphicsLayer { alpha = if (showing) 1f else 0f }
                .clip(CardShape)
                .background(Color(0xE6101018)),
        ) {
            AndroidView(
                factory = { ctx -> TextureView(ctx).also { player.setVideoTextureView(it) } },
                onRelease = { player.clearVideoTextureView(it) },
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black),
            )
            Text(
                sponsor.name,
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            )
            if (sponsor.site != null) VisitLine()
            AdBar(
                label = label,
                secondsLeft = secondsLeft,
                skipIn = if (skippable) ((SKIP_AFTER_MS - playedMs + 999) / 1000).toInt().coerceAtLeast(0) else -1,
            )
        }
    }
}

/** A sponsor's picture: whole, or stretched to [fill] its box edge to edge. */
@Composable
private fun SponsorPicture(sponsor: Sponsor, modifier: Modifier, fill: Boolean = false) {
    val picture = sponsor.picture ?: return
    Image(picture, contentDescription = sponsor.name, contentScale = if (fill) ContentScale.FillBounds else ContentScale.Fit, modifier = modifier)
}

/** Opens a sponsor's website over everything (see [SponsorSite]) and counts the click. */
class SiteOpener {
    /** The sponsor whose website is open; null when none is. */
    var sponsor by mutableStateOf<Sponsor?>(null)

    fun open(s: Sponsor) {
        if (s.site == null) return
        if (s.id != PROMO_ID) SponsorViews.count(s, "click")
        sponsor = s
    }
}

@Composable
fun rememberSiteOpener(): SiteOpener {
    val opener = remember { SiteOpener() }
    opener.sponsor?.let { s -> SponsorSite(s.site.orEmpty(), s.name, onClose = { opener.sponsor = null }) }
    return opener
}

/** A tap (phones and tablets) opens the sponsor's website; it never takes the remote's focus. */
fun Modifier.sponsorTap(sponsor: Sponsor, opener: SiteOpener): Modifier =
    if (sponsor.site == null) this else pointerInput(sponsor.id) { detectTapGestures(onTap = { opener.open(sponsor) }) }
