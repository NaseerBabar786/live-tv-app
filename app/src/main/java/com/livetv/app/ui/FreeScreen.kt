package com.livetv.app.ui

import android.text.format.DateFormat
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import android.view.TextureView
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.livetv.app.Plans
import com.livetv.app.data.Location
import com.livetv.app.data.News
import com.livetv.app.data.Weather
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/*
 * "Info Corner", the Free viewers' screen (owner picked idea A, 2026-10-08): 1+List on a TV becomes the player
 * at about 40% of the screen, a panel of clock, weather, next prayer and our own promos beside it, and a row of
 * channels under it. No paid sponsors here (owner, 2026-10-08): the promos and the line along the bottom are only
 * about Cable TV, the Spark channels and our apps. Gold viewers keep the normal 1+List; nothing saved changes.
 */

private const val LOGOS = "https://tv.bulkbazaar.ca/channel/logos/"
private val Gold = Color(0xFFE8B43C)
private val Muted = Color(0xFFA0A6B9)
private val PrayerGreen = Color(0xFF8CDCA0)

/** The right-hand panel: clock and date, weather, next prayer and the promo slides. */
@Composable
internal fun FreeInfoPanel(modifier: Modifier) {
    Column(
        modifier
            .clip(CardShape)
            .background(MaterialTheme.colorScheme.surface)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        BigClock()
        FreeWeather()
        NextPrayer()
        Spacer(Modifier.height(2.dp))
        PromoSlides(Modifier.weight(1f).fillMaxWidth())
    }
}

@Composable
private fun BigClock() {
    val context = LocalContext.current
    val time = remember { DateFormat.getTimeFormat(context) }
    val date = remember {
        val locale = Locale.getDefault()
        SimpleDateFormat(DateFormat.getBestDateTimePattern(locale, "EEEEMMMMd"), locale)
    }
    var now by remember { mutableStateOf(Date()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = Date()
            delay(60_000 - System.currentTimeMillis() % 60_000)
        }
    }
    Text(time.format(now), color = Color.White, fontSize = 40.sp, lineHeight = 42.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    Text(date.format(now), color = Muted, fontSize = 15.sp, maxLines = 1)
}

@Composable
private fun FreeWeather() {
    var weather by remember { mutableStateOf<Weather.Now?>(null) }
    val place by Location.version.collectAsStateWithLifecycle()
    LaunchedEffect(place) {
        while (true) {
            withContext(Dispatchers.IO) { runCatching { Weather.load() }.getOrNull() }?.let { weather = it }
            delay(if (weather == null) 5 * 60_000L else 30 * 60_000L)
        }
    }
    weather?.let { Text("$it", color = Color.White, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
}

/** "Next prayer: Isha 8:12 PM" (just the time; the Azan itself is a Gold feature). */
@Composable
private fun NextPrayer() {
    val context = LocalContext.current
    var today by remember { mutableStateOf<News.Today?>(null) }
    val place by Location.version.collectAsStateWithLifecycle()
    LaunchedEffect(place) {
        while (true) {
            withContext(Dispatchers.IO) { runCatching { News.today() }.getOrNull() }?.let { today = it }
            delay(if (today == null) 5 * 60_000L else 3 * 60 * 60_000L)
        }
    }
    var minute by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            val c = Calendar.getInstance()
            minute = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE)
            delay(60_000 - System.currentTimeMillis() % 60_000)
        }
    }
    val prayers = today?.prayers.orEmpty().takeIf { it.isNotEmpty() } ?: return
    fun minutes(t: String) = t.split(':').let { (it[0].toIntOrNull() ?: 0) * 60 + (it.getOrNull(1)?.toIntOrNull() ?: 0) }
    val next = prayers.firstOrNull { minutes(it.time) > minute } ?: prayers.first()
    val is24 = remember { DateFormat.is24HourFormat(context) }
    val shown = if (is24) next.time else minutes(next.time).let { m ->
        "${(m / 60 + 11) % 12 + 1}:${"%02d".format(m % 60)} ${if (m < 12 * 60) "AM" else "PM"}"
    }
    val name = if (next.name == "Dhuhr") "Zuhr" else next.name
    Text("Next prayer:  $name $shown", color = PrayerGreen, fontSize = 15.sp, maxLines = 1)
}

/** Our own promos, one at a time: the next every 10 seconds, after the Spark ad once it has played through. */
@Composable
private fun PromoSlides(modifier: Modifier) {
    var turn by remember { mutableIntStateOf(0) }
    val slide = Math.floorMod(turn, SLIDES)
    LaunchedEffect(turn) {
        delay(if (slide == AD_SLIDE) AD_SLIDE_MS else 10_000)
        turn++
    }
    AnimatedContent(
        targetState = slide,
        transitionSpec = { fadeIn(tween(500)) togetherWith fadeOut(tween(500)) },
        modifier = modifier,
        label = "promo",
    ) { s ->
        when (s) {
            0 -> SparkSlide()
            AD_SLIDE -> SparkAdSlide()
            2 -> SparkShowsSlide()
            3 -> AppsSlide()
            4 -> GoldSlide()
            else -> ShareSlide()
        }
    }
}

private const val SLIDES = 6

/** The Spark TV network montage (owner approved 2026-10-09 for the next version): 30 s, plus a moment to start. */
private const val AD_SLIDE = 1
private const val AD_SLIDE_MS = 33_000L
private const val SPARK_AD = "https://tv.bulkbazaar.ca/media/spark-montage.mp4"
private const val SPARK_AD_POSTER = "https://tv.bulkbazaar.ca/media/spark-montage-poster.jpg"

/**
 * The Spark network ad, playing silently in the promo box (the channel keeps the sound). Its picture shows until
 * the video starts; the player is let go as soon as the slide moves on, so the TV decodes it only for these 30 s.
 */
@Composable
private fun SparkAdSlide() {
    val context = LocalContext.current
    var showing by remember { mutableStateOf(false) }
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            volume = 0f
            trackSelectionParameters = trackSelectionParameters.buildUpon()
                .setMaxVideoSize(1280, 720)
                .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true)
                .build()
            addListener(object : Player.Listener {
                override fun onRenderedFirstFrame() { showing = true }
                override fun onPlayerError(error: PlaybackException) { showing = false }
            })
            setMediaItem(MediaItem.fromUri(SPARK_AD))
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
    Box(
        Modifier
            .fillMaxSize()
            .clip(CardShape)
            .background(Color.Black)
            .border(1.dp, Color(0xFF7846C8), CardShape),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f), contentAlignment = Alignment.Center) {
            AsyncImage(model = SPARK_AD_POSTER, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            AndroidView(
                factory = { ctx -> TextureView(ctx).also { player.setVideoTextureView(it) } },
                onRelease = { player.clearVideoTextureView(it) },
                modifier = Modifier.fillMaxSize().graphicsLayer { alpha = if (showing) 1f else 0f },
            )
        }
        Text(
            "Spark TV",
            color = Color.White,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(6.dp)
                .background(Color.Black.copy(alpha = 0.6f), ChipShape)
                .padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun Slide(top: Color, edge: Color, content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .clip(CardShape)
            .background(Brush.verticalGradient(listOf(top, Color(0xFF12141C))))
            .border(1.dp, edge, CardShape)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) { content() }
}

@Composable
private fun Logo(name: String, height: Dp) {
    AsyncImage(model = "$LOGOS$name.png", contentDescription = null, modifier = Modifier.height(height))
}

@Composable
private fun SparkSlide() = Slide(Color(0xFF2A1E4C), Color(0xFF7846C8)) {
    Logo("spark-tv", 26.dp)
    Text("Our own channels, free for everyone", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    listOf("spark-cinema" to "spark-music", "spark-kids" to "spark-sports", "spark-dramas" to "spark-news").forEach { (a, b) ->
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f)) { Logo(a, 16.dp) }
            Box(Modifier.weight(1f)) { Logo(b, 16.dp) }
        }
    }
    Text("15 channels of our own, free on Cable TV", color = Muted, fontSize = 12.sp, maxLines = 1)
}

@Composable
private fun SparkShowsSlide() = Slide(Color(0xFF3A2414), Color(0xFFDC8C3C)) {
    Text("On the Spark channels", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    Logo("spark-cinema", 18.dp)
    Text("Urdu and Hindi films every day", color = Muted, fontSize = 12.sp, maxLines = 1)
    Logo("spark-dramas", 18.dp)
    Text("Pakistani dramas", color = Muted, fontSize = 12.sp, maxLines = 1)
    Logo("spark-news", 18.dp)
    Text("Headlines every hour", color = Muted, fontSize = 12.sp, maxLines = 1)
}

@Composable
private fun AppsSlide() = Slide(Color(0xFF10302A), Color(0xFF3CA082)) {
    Text("Our free apps", color = PrayerGreen, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    listOf("App Bazaar" to "all our apps in one place", "Iqra Quran" to "Quran, Qaida and Hifz", "Azan Clock" to "prayer times and Azan")
        .forEach { (app, what) ->
            Text(app, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Text(what, color = Muted, fontSize = 12.sp, maxLines = 1)
        }
    Text("apps.bulkbazaar.ca", color = Muted, fontSize = 12.sp)
}

@Composable
private fun GoldSlide() = Slide(Color(0xFF3C2E0A), Gold) {
    Text("★ Get Gold", color = Gold, fontSize = 17.sp, fontWeight = FontWeight.Bold)
    listOf("Every layout and full screen", "Movies & Dramas, Games", "Quran, Weather, Themes").forEach {
        Text(it, color = Color.White, fontSize = 13.sp, maxLines = 1)
    }
    Text("1 month free with code WELCOME", color = Gold, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
}

@Composable
private fun ShareSlide() = Slide(Color(0xFF14243C), AccentBlue) {
    Text("Enjoying Cable TV?", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    Text("Tell your family and friends.", color = Muted, fontSize = 13.sp)
    Text("Free to install on any Google TV:", color = Muted, fontSize = 13.sp)
    Text("tv.bulkbazaar.ca", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold)
}

/** "★ More layouts, Movies, Games: get Gold". OK opens the packages screen. */
@Composable
internal fun FreeGoldButton(modifier: Modifier) {
    var focused by remember { mutableStateOf(false) }
    Box(
        modifier
            .clip(CardShape)
            .background(Color(0xFF3C2E0A))
            .border(if (focused) 3.dp else 1.dp, if (focused) FocusColor else Gold, CardShape)
            .onFocusChanged { focused = it.isFocused }
            .clickable { Plans.showPlans() }
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Column {
            Text("★ More layouts, Movies, Games: get Gold", color = Gold, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("1 month free with code WELCOME", color = Color.White, fontSize = 12.sp, maxLines = 1)
        }
    }
}

/** Our own news along the bottom of the Free screen, round and round (no paid sponsors here). */
@Composable
internal fun FreeTicker(modifier: Modifier, lift: Dp = 0.dp) {
    val words = remember {
        listOf(
            "Spark Cinema: Urdu and Hindi films every day",
            "Spark News: headlines every hour",
            "Our own Spark channels are free for everyone",
            "Iqra Quran and App Bazaar: free on apps.bulkbazaar.ca",
            "Get Gold for every layout, Movies & Dramas and Games: 1 month free with code WELCOME",
            "Share Cable TV: tv.bulkbazaar.ca",
        ).joinToString("     •     ", postfix = "     •     ")
    }
    BoxWithConstraints(modifier.clipToBounds().background(Color.Black.copy(alpha = 0.55f))) {
        val boxWidth = constraints.maxWidth.toFloat()
        val pxPerSecond = with(LocalDensity.current) { 90.dp.toPx() }
        var textWidth by remember { mutableIntStateOf(0) }
        val offset = remember { Animatable(boxWidth) }
        LaunchedEffect(textWidth) {
            if (textWidth == 0) return@LaunchedEffect
            while (true) {
                offset.snapTo(boxWidth)
                val ms = ((boxWidth + textWidth) / pxPerSecond * 1000).toInt()
                offset.animateTo(-textWidth.toFloat(), tween(ms, easing = LinearEasing))
            }
        }
        Text(
            words,
            color = Color.White,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(bottom = lift)
                .wrapContentWidth(Alignment.Start, unbounded = true)
                .onSizeChanged { textWidth = it.width }
                .graphicsLayer { translationX = offset.value },
        )
    }
}

/** A channel in the row under the player: its number and name, blue while it plays. */
@Composable
internal fun FreeChannelCard(number: Int, name: String, current: Boolean, modifier: Modifier) {
    Column(
        modifier
            .width(150.dp)
            .clip(ChipShape)
            .background(if (current) AccentBlue else MaterialTheme.colorScheme.surface)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        if (number > 0) Text("$number", color = if (current) Color.White else Muted, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        Text(name, color = Color.White, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = if (current) FontWeight.Bold else FontWeight.Normal)
    }
}
