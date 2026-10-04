package com.livetv.app.ui

import android.os.SystemClock
import android.text.format.DateFormat
import android.view.TextureView
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import com.livetv.app.data.NewsScreen
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Star
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import com.livetv.app.Edition
import com.livetv.app.EditionSponsorVideoBox
import com.livetv.app.EditionTicker
import com.livetv.app.Watching
import com.livetv.app.data.Channel
import com.livetv.app.data.Location
import com.livetv.app.data.News
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

private val Panel = Color(0xFF0B1222)
private val Line = Color(0xFF1E2C4A)
private val Muted = Color(0xFF8FA6CF)
private val Soft = Color(0xFFB8C6E0)
private val Up = Color(0xFF4CD964)
private val Down = Color(0xFFFF5A5F)
private val StoriesRed = Color(0xFFC62828)

/**
 * "News" mode, laid out like a 24-hour news channel: the live channel in the top left with the
 * sound, the clock, weather, markets and prayer times down the right, today's top stories, rupee
 * rates and Live TV's scrolling line along the bottom, and a sponsor (picture or muted video) in
 * the bottom right corner. Up and Down change channel, OK opens it full screen, Back goes up to
 * the top bar.
 */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
fun NewsMode(
    channels: List<Channel>,
    all: List<Channel>,
    selectedId: String?,
    sound: Boolean,
    playing: Boolean,
    favorites: Set<String>,
    focus: FocusRequester,
    onSelect: (Channel) -> Unit,
    onOpen: (Channel) -> Unit,
    onBack: () -> Unit,
    onFocused: () -> Unit,
) {
    val context = LocalContext.current
    val selected = all.firstOrNull { it.id == selectedId } ?: channels.firstOrNull()
    LaunchedEffect(selected?.id) { if (selectedId == null && selected != null) onSelect(selected) }
    val stream = remember { com.livetv.app.player.StreamPlayer(context) }
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
    DisposableEffect(selected?.id, playing) {
        if (selected != null && playing) Watching.watch(stream, selected)
        onDispose { Watching.stop(stream) }
    }
    // The live channel comes first: when it drops frames (the TV is short of power), the sponsor
    // video gives way to its picture for a minute.
    var videoOkAt by remember { mutableLongStateOf(0L) }
    var now by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    LaunchedEffect(Unit) {
        var last = -1
        while (true) {
            delay(2_000)
            now = SystemClock.elapsedRealtime()
            val dropped = stream.player.videoDecoderCounters?.droppedBufferCount
            if (dropped == null || !showing) { last = -1; continue }
            if (last >= 0 && dropped - last > 4) videoOkAt = now + 60_000
            last = dropped
        }
    }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    // Weather and prayer times for where this device is (asks once for its location).
    DeviceLocation()

    // Loaded once here: the markets panel and the gold-per-tola line both use them.
    val markets = rememberLoaded(5 * 60_000L) { News.markets().takeIf { it.isNotEmpty() } }
    val rates = rememberLoaded(60 * 60_000L) { News.rates() }
    val gold = markets?.firstOrNull { it.name.startsWith("Gold") }?.price

    // What the viewer chose for each spot (Settings > Customize News screen).
    val choices by NewsScreen.choices.collectAsStateWithLifecycle()
    // The second channel, when one of the spots shows it: Left and Right change it.
    var secondId by remember { mutableStateOf(NewsScreen.secondId) }
    val second = if (!choices.usesSecond) null else
        all.firstOrNull { it.id == secondId && it.id != selected?.id } ?: channels.firstOrNull { it.id != selected?.id }
    fun stepSecond(by: Int) {
        val list = channels.filter { it.id != selected?.id }
        if (list.isEmpty()) return
        val i = list.indexOfFirst { it.id == second?.id }
        val next = if (i < 0) list.first() else list[Math.floorMod(i + by, list.size)]
        secondId = next.id
        NewsScreen.secondId = next.id
    }
    // The second channel pauses while the main one is struggling, like the sponsor video.
    val secondPlaying = playing && now >= videoOkAt

    var playerFocused by remember { mutableStateOf(false) }
    BoxWithConstraints(Modifier.fillMaxSize().background(Color.Black)) {
        // The player takes three quarters of the width (less if the screen is unusually tall),
        // the rest of the width and height go to the panels.
        val playerWidth = minOf(maxWidth * 0.75f, maxHeight * 0.75f * 16f / 9f)
        val playerHeight = playerWidth * 9f / 16f
        val sideWidth = maxWidth - playerWidth
        val bottomHeight = maxHeight - playerHeight
        // Text sizes follow the screen, so a 4K TV and a tablet look the same.
        val unit = (maxHeight.value / 540f).coerceIn(0.7f, 1.6f)
        fun s(v: Float): TextUnit = (v * unit).sp
        fun d(v: Float): Dp = (v * unit).dp

        Row(Modifier.fillMaxSize()) {
            Column(Modifier.width(playerWidth).fillMaxHeight()) {
                // The live channel.
                Box(
                    Modifier
                        .width(playerWidth)
                        .height(playerHeight)
                        .background(Color.Black)
                        .focusRequester(focus)
                        .onFocusChanged {
                            playerFocused = it.isFocused
                            if (it.isFocused) onFocused()
                        }
                        .onPreviewKeyEvent { e ->
                            fun step(by: Int) {
                                val i = channels.indexOfFirst { it.id == selected?.id }
                                val next = when {
                                    channels.isEmpty() -> null
                                    i < 0 -> channels.first()
                                    else -> channels[Math.floorMod(i + by, channels.size)]
                                }
                                next?.let(onSelect)
                            }
                            when {
                                e.key == Key.Back -> { if (e.type == KeyEventType.KeyUp) onBack(); true }
                                e.type != KeyEventType.KeyDown -> false
                                e.key == Key.DirectionUp || e.key == Key.ChannelUp -> { step(-1); true }
                                e.key == Key.DirectionDown || e.key == Key.ChannelDown -> { step(1); true }
                                e.key == Key.DirectionLeft -> { if (choices.usesSecond) stepSecond(-1); true }
                                e.key == Key.DirectionRight -> { if (choices.usesSecond) stepSecond(1); true }
                                else -> false
                            }
                        }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) { selected?.let(onOpen) },
                    contentAlignment = Alignment.Center,
                ) {
                    AndroidView(
                        factory = { ctx -> TextureView(ctx).also { stream.player.setVideoTextureView(it) } },
                        onRelease = { stream.player.clearVideoTextureView(it) },
                        modifier = Modifier.fillMaxSize().graphicsLayer { alpha = if (showing) 1f else 0f },
                    )
                    if (!showing) {
                        Text(error ?: selected?.name.orEmpty(), color = Color.White, fontSize = s(16f), modifier = Modifier.padding(24.dp))
                    }
                    if (playerFocused) Box(Modifier.fillMaxSize().border(1.dp, FocusColor.copy(alpha = 0.7f)))
                    selected?.let { ch ->
                        Row(
                            Modifier
                                .align(Alignment.BottomStart)
                                .padding(d(12f))
                                .background(Color.Black.copy(alpha = 0.6f), ChipShape)
                                .padding(horizontal = d(8f), vertical = d(4f)),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "LIVE",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = s(10f),
                                modifier = Modifier.background(Color(0xFFE53935), ChipShape).padding(horizontal = d(5f), vertical = d(1f)),
                            )
                            Spacer(Modifier.width(d(8f)))
                            if (ch.number > 0) {
                                Text("${ch.number}", color = FocusColor, fontWeight = FontWeight.Bold, fontSize = s(14f))
                                Spacer(Modifier.width(d(6f)))
                            }
                            Text(ch.name, color = Color.White, fontSize = s(14f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (ch.id in favorites) {
                                Spacer(Modifier.width(d(6f)))
                                Icon(Icons.Filled.Star, contentDescription = null, tint = FocusColor, modifier = Modifier.size(d(14f)))
                            }
                        }
                    }
                    if (sound) {
                        Icon(
                            Icons.AutoMirrored.Filled.VolumeUp,
                            contentDescription = "Sound",
                            tint = Color.White,
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(d(10f))
                                .background(Color.Black.copy(alpha = 0.6f), ChipShape)
                                .padding(d(4f))
                                .size(d(18f)),
                        )
                    }
                }
                // Along the bottom: the two chosen lines (top stories and currency rates at first),
                // the stock prices crawling along, and the advertising line.
                Column(Modifier.fillMaxWidth().height(bottomHeight).background(Panel)) {
                    val rows = listOf(NewsScreen.Slot.Under, NewsScreen.Slot.Info).map { choices[it] }.filter { it != NewsScreen.Panel.Empty }
                    rows.forEachIndexed { i, panel ->
                        val m = Modifier.fillMaxWidth().weight(if (i == 0 && rows.size > 1) 1.35f else 1f)
                        when (panel) {
                            NewsScreen.Panel.Stories -> Headlines(m, ::s, ::d)
                            NewsScreen.Panel.Currencies -> InfoRow(m, rates, gold, ::s, ::d)
                            NewsScreen.Panel.Prayers -> PrayerRow(m, ::s, ::d)
                            NewsScreen.Panel.Markets -> Crawl(m, markets, null, null, ::s, ::d)
                            else -> Box(m)
                        }
                        Divider()
                    }
                    if (choices.bottom == NewsScreen.Bottom.Both) {
                        Crawl(Modifier.fillMaxWidth().weight(0.8f).background(Color(0xFF0E1830)), markets, rates, gold, ::s, ::d)
                        Divider()
                    }
                    Box(Modifier.fillMaxWidth().weight(0.9f).background(Color(0xFF05070D)).padding(horizontal = d(12f))) {
                        EditionTicker(Modifier.fillMaxSize(), big = true, always = true)
                    }
                }
            }
            // Down the right: the three chosen panels (clock and weather, markets and prayer
            // times at first); the sponsor in the corner. Lists (markets, rates, stories) take
            // the space the others leave and show as many rows as fit.
            Column(Modifier.width(sideWidth).fillMaxHeight().background(Panel)) {
                Column(Modifier.fillMaxWidth().height(playerHeight).padding(horizontal = d(12f))) {
                    val fills = setOf(NewsScreen.Panel.Markets, NewsScreen.Panel.Currencies, NewsScreen.Panel.Stories)
                    val panels = listOf(NewsScreen.Slot.RightTop, NewsScreen.Slot.RightMiddle, NewsScreen.Slot.RightBottom)
                        .map { choices[it] }.filter { it != NewsScreen.Panel.Empty }
                    val anyFill = panels.any { it in fills }
                    panels.forEachIndexed { i, panel ->
                        if (i > 0) {
                            // Nothing to stretch: the last panel still sits at the bottom.
                            if (!anyFill && i == panels.lastIndex) Spacer(Modifier.weight(1f))
                            Divider()
                        }
                        Box(if (panel in fills) Modifier.fillMaxWidth().weight(1f) else Modifier.fillMaxWidth()) {
                            when (panel) {
                                NewsScreen.Panel.Clock -> ClockWeather(::s, ::d)
                                NewsScreen.Panel.Markets -> Markets(Modifier.fillMaxSize(), markets, ::s, ::d)
                                NewsScreen.Panel.Prayers -> Prayers(::s, ::d)
                                NewsScreen.Panel.Currencies -> CurrencyList(Modifier.fillMaxSize(), rates, gold, ::s, ::d)
                                NewsScreen.Panel.Stories -> StoryList(Modifier.fillMaxSize(), ::s, ::d)
                                NewsScreen.Panel.Second -> SecondChannel(second, secondPlaying, ::s, ::d)
                                NewsScreen.Panel.Empty -> Unit
                            }
                        }
                    }
                }
                Box(Modifier.fillMaxWidth().height(bottomHeight).padding(d(4f)), contentAlignment = Alignment.Center) {
                    EditionSponsorVideoBox(Modifier.fillMaxSize(), allowVideo = now >= videoOkAt)
                }
            }
        }
    }
}

@Composable
private fun Divider() = Box(Modifier.fillMaxWidth().height(1.dp).background(Line))

/** Loads [load] now and every [everyMs] (sooner while it hasn't loaded yet). */
@Composable
private fun <T> rememberLoaded(everyMs: Long, load: () -> T?): T? {
    var value by remember { mutableStateOf<T?>(null) }
    // Loads again straight away when the place changes (a city picked in Settings, or the device's location found).
    val place by Location.version.collectAsStateWithLifecycle()
    LaunchedEffect(place) {
        while (true) {
            withContext(Dispatchers.IO) { runCatching { load() }.getOrNull() }?.let { value = it }
            delay(if (value == null) 5 * 60_000L else everyMs)
        }
    }
    return value
}

@Composable
private fun ClockWeather(s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val context = LocalContext.current
    var now by remember { mutableStateOf(Date()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = Date()
            delay(60_000 - System.currentTimeMillis() % 60_000)
        }
    }
    val is24 = remember { DateFormat.is24HourFormat(context) }
    val time = remember(now) { SimpleDateFormat(if (is24) "H:mm" else "h:mm", Locale.getDefault()).format(now) }
    val amPm = remember(now) { if (is24) "" else SimpleDateFormat("a", Locale.getDefault()).format(now) }
    val date = remember(now) { SimpleDateFormat("EEEE, MMMM d", Locale.getDefault()).format(now) }
    val forecast = if (Edition.HAS_WEATHER) rememberLoaded(30 * 60_000L) { News.forecast() } else null
    val city = if (Edition.HAS_WEATHER) rememberLoaded(24 * 60 * 60_000L) { News.place()?.city?.takeIf { it.isNotBlank() } } else null
    Column(Modifier.fillMaxWidth().padding(top = d(8f), bottom = d(4f))) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text(time, color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(34f), lineHeight = s(36f))
            if (amPm.isNotEmpty()) Text(" $amPm", color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(13f), modifier = Modifier.padding(bottom = d(5f)))
            Spacer(Modifier.weight(1f))
            forecast?.let {
                Text("${it.icon} ${it.temperature}°", color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(26f), lineHeight = s(30f))
            }
        }
        Row(Modifier.fillMaxWidth()) {
            Text(date, color = Soft, fontSize = s(11f), maxLines = 1, modifier = Modifier.weight(1f))
            forecast?.let { Text("feels ${it.feelsLike}°", color = Soft, fontSize = s(11f)) }
        }
        city?.let { Text("📍 $it", color = FocusColor, fontSize = s(11f), maxLines = 1) }
        forecast?.days?.take(4)?.takeIf { it.isNotEmpty() }?.let { days ->
            Row(Modifier.fillMaxWidth().padding(top = d(6f)), horizontalArrangement = Arrangement.SpaceBetween) {
                days.forEach { day ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(day.name, color = Soft, fontWeight = FontWeight.Bold, fontSize = s(10f))
                        Text(day.icon, fontSize = s(16f))
                        Text("${day.high}°", color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(13f))
                        Text("💧${day.rain}%", color = Color(0xFF7FB3FF), fontSize = s(9f))
                    }
                }
            }
        }
    }
}

@Composable
private fun Markets(modifier: Modifier, markets: List<News.Market>?, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    BoxWithConstraints(modifier) {
        val rowHeight = d(18f)
        val fits = ((maxHeight - d(30f)) / rowHeight).toInt()
        if (markets == null || fits < 1) return@BoxWithConstraints
        Column(Modifier.fillMaxWidth().padding(vertical = d(6f))) {
            Text("MARKETS", color = Muted, fontWeight = FontWeight.Bold, fontSize = s(10f), letterSpacing = s(1.5f), modifier = Modifier.height(d(16f)))
            markets.take(fits).forEach { m ->
                Row(Modifier.fillMaxWidth().height(rowHeight), verticalAlignment = Alignment.CenterVertically) {
                    Text(m.name, color = Color.White, fontSize = s(12f), modifier = Modifier.weight(1f), maxLines = 1)
                    Text(
                        if (m.name.startsWith("Gold")) "$" + "%,.0f".format(m.price) else "%,.0f".format(m.price),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = s(12f),
                        maxLines = 1,
                    )
                    Text(
                        (if (m.change >= 0) "▲ " else "▼ ") + "%.1f%%".format(abs(m.change)),
                        color = if (m.change >= 0) Up else Down,
                        fontSize = s(11f),
                        modifier = Modifier.width(d(56f)).padding(start = d(6f)),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun Prayers(s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val context = LocalContext.current
    // Reloaded every few hours, so it moves on to the next day's times overnight.
    val today = rememberLoaded(3 * 60 * 60_000L) { News.today() }
    val city = rememberLoaded(24 * 60 * 60_000L) { News.place()?.city?.takeIf { it.isNotBlank() } }
    var minute by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            val c = java.util.Calendar.getInstance()
            minute = c.get(java.util.Calendar.HOUR_OF_DAY) * 60 + c.get(java.util.Calendar.MINUTE)
            delay(60_000 - System.currentTimeMillis() % 60_000)
        }
    }
    val is24 = remember { DateFormat.is24HourFormat(context) }
    fun minutes(t: String) = t.split(':').let { (it[0].toIntOrNull() ?: 0) * 60 + (it.getOrNull(1)?.toIntOrNull() ?: 0) }
    fun shown(t: String) = if (is24) t else minutes(t).let { m -> "${(m / 60 + 11) % 12 + 1}:${"%02d".format(m % 60)}" }
    val prayers = today?.prayers.orEmpty()
    val next = prayers.indexOfFirst { minutes(it.time) > minute }
    Column(Modifier.fillMaxWidth().padding(top = d(6f), bottom = d(8f))) {
        Text(
            "PRAYER TIMES" + (city?.let { " · ${it.uppercase()}" } ?: ""),
            color = Muted,
            fontWeight = FontWeight.Bold,
            fontSize = s(10f),
            letterSpacing = s(1.5f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (prayers.isEmpty()) {
            Text("Loading…", color = Soft, fontSize = s(11f), modifier = Modifier.padding(top = d(3f)))
        } else {
            Row(Modifier.fillMaxWidth().padding(top = d(3f)), horizontalArrangement = Arrangement.SpaceBetween) {
                prayers.forEachIndexed { i, p ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if (p.name == "Dhuhr") "Zuhr" else p.name, color = if (i == next) FocusColor else Muted, fontSize = s(9f), maxLines = 1)
                        Text(shown(p.time), color = if (i == next) FocusColor else Color.White, fontWeight = FontWeight.Bold, fontSize = s(12f), maxLines = 1)
                    }
                }
            }
        }
        today?.hijri?.let { h ->
            Text("☪ ${h.label}", color = Soft, fontSize = s(10f), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = d(4f)))
            islamicNote(h, prayers.firstOrNull { it.name == "Fajr" }?.time?.let(::shown), prayers.firstOrNull { it.name == "Maghrib" }?.time?.let(::shown))?.let {
                Text(it, color = FocusColor, fontSize = s(10f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/**
 * During Ramadan, when the fast starts and ends today; otherwise how far off Ramadan or the next
 * Eid is, when it's within two months. Islamic months are 29 or 30 days, so the count is "about".
 */
private fun islamicNote(h: News.Hijri, fajr: String?, maghrib: String?): String? {
    if (h.month == 9) {
        return "Ramadan day ${h.day}" + (if (fajr != null && maghrib != null) " · Sehri $fajr · Iftar $maghrib" else "")
    }
    if (h.month == 10 && h.day <= 3) return "Eid Mubarak!"
    if (h.month == 12 && h.day in 10..13) return "Eid Mubarak!"
    fun daysTo(month: Int, day: Int): Int {
        var months = month - h.month
        if (months < 0 || (months == 0 && day < h.day)) months += 12
        return (months * 29.53 + (day - h.day)).toInt()
    }
    val events = listOf("Ramadan" to daysTo(9, 1), "Eid al-Fitr" to daysTo(10, 1), "Eid al-Adha" to daysTo(12, 10))
    val (name, days) = events.minBy { it.second }
    if (days > 60) return null
    return if (days <= 1) "$name starts about tomorrow" else "$name in about $days days"
}

/** One top story at a time, the next every 12 seconds. */
@Composable
private fun Headlines(modifier: Modifier, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val stories = rememberLoaded(15 * 60_000L) { News.headlines().takeIf { it.isNotEmpty() } }
    var turn by remember { mutableIntStateOf(0) }
    LaunchedEffect(stories) {
        while (true) {
            delay(12_000)
            turn++
        }
    }
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Column(
            Modifier.fillMaxHeight().width(d(92f)).background(StoriesRed),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("TOP", color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(12f), lineHeight = s(13f))
            Text("STORIES", color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(12f), lineHeight = s(13f))
        }
        val story = stories?.let { it[Math.floorMod(turn, it.size)] }
        Column(Modifier.weight(1f).padding(horizontal = d(12f))) {
            Text(
                story?.title ?: Edition.APP_NAME,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = s(16f),
                lineHeight = s(19f),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            story?.let { Text(it.source, color = Muted, fontSize = s(10f)) }
        }
    }
}

/**
 * The viewer's money against Asian currencies, a few at a time (the next few every 10 seconds),
 * then the price of a tola of gold.
 */
@Composable
private fun InfoRow(modifier: Modifier, rates: News.Rates?, gold: Double?, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val groups = remember(rates, gold) {
        val r = rates ?: return@remember emptyList()
        val shown = News.ASIAN.filter { it.code != r.base && r[it.code] != null }
        val tola = listOf(r.base to "$", "PKR" to "Rs ", "INR" to "₹").mapNotNull { (code, symbol) ->
            News.goldTola(gold, r, code)?.let { Triple(code, symbol, it) }
        }
        shown.chunked(5).map { group -> group.map { m -> "${m.flag} ${m.symbol}${amount(r[m.code]!!)}${if (m.symbol.isBlank()) " ${m.code}" else ""}" } } +
            listOfNotNull(tola.takeIf { it.isNotEmpty() }?.map { (code, symbol, v) -> "$symbol${"%,.0f".format(v)} $code" })
    }
    var turn by remember { mutableIntStateOf(0) }
    LaunchedEffect(groups) {
        turn = 0
        while (true) {
            delay(10_000)
            turn++
        }
    }
    Row(modifier.padding(horizontal = d(12f)), verticalAlignment = Alignment.CenterVertically) {
        if (rates == null || groups.isEmpty()) return@Row
        val i = Math.floorMod(turn, groups.size)
        val isGold = gold != null && i == groups.size - 1 && groups.size > 1
        Text(
            if (isGold) "GOLD 1 TOLA" else "1 ${rates.base} =",
            color = if (isGold) FocusColor else Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = s(13f),
            maxLines = 1,
        )
        Spacer(Modifier.width(d(14f)))
        groups[i].forEachIndexed { n, item ->
            if (n > 0) Text("  ·  ", color = Muted, fontSize = s(13f))
            Text(item, color = if (isGold) Color.White else FocusColor, fontWeight = FontWeight.Bold, fontSize = s(13f), maxLines = 1)
        }
    }
}

/** Big amounts without decimals (Rs 194), small ones with two (2.68 AED). */
private fun amount(v: Double) = if (v >= 100) "%,.0f".format(v) else if (v >= 10) "%.1f".format(v) else "%.2f".format(v)

/** Every market, then the rates and gold, crawling right to left along one line. */
@Composable
private fun Crawl(modifier: Modifier, markets: List<News.Market>?, rates: News.Rates?, gold: Double?, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val text = remember(markets, rates, gold) {
        buildAnnotatedString {
            markets?.forEach { m ->
                withStyle(SpanStyle(color = Soft)) { append(m.name.uppercase() + " ") }
                withStyle(SpanStyle(color = Color.White, fontWeight = FontWeight.Bold)) {
                    append((if (m.name.startsWith("Gold")) "$" else "") + "%,.0f ".format(m.price))
                }
                withStyle(SpanStyle(color = if (m.change >= 0) Up else Down)) {
                    append((if (m.change >= 0) "▲ " else "▼ ") + "%.1f%%".format(abs(m.change)))
                }
                append("      ")
            }
            if (rates != null) {
                withStyle(SpanStyle(color = Soft)) { append("1 ${rates.base} = ") }
                News.ASIAN.filter { it.code != rates.base && rates[it.code] != null }.forEach { m ->
                    withStyle(SpanStyle(color = FocusColor, fontWeight = FontWeight.Bold)) {
                        append("${m.flag} ${m.symbol}${amount(rates[m.code]!!)}${if (m.symbol.isBlank()) " ${m.code}" else ""}")
                    }
                    append("    ")
                }
                val tola = listOf(rates.base to "$", "PKR" to "Rs ", "INR" to "₹").mapNotNull { (code, symbol) ->
                    News.goldTola(gold, rates, code)?.let { "$symbol${"%,.0f".format(it)} $code" }
                }
                if (tola.isNotEmpty()) {
                    append("  ")
                    withStyle(SpanStyle(color = Soft)) { append("GOLD 1 TOLA ") }
                    withStyle(SpanStyle(color = Color.White, fontWeight = FontWeight.Bold)) { append(tola.joinToString("  ·  ")) }
                    append("      ")
                }
            }
        }
    }
    Box(modifier.padding(horizontal = d(12f)), contentAlignment = Alignment.CenterStart) {
        if (text.isEmpty()) return@Box
        Text(
            text,
            fontSize = s(13f),
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.fillMaxWidth().basicMarquee(iterations = Int.MAX_VALUE, initialDelayMillis = 0, velocity = d(55f)),
        )
    }
}

/** Today's prayer times in one line (for the lines under the channel). */
@Composable
private fun PrayerRow(modifier: Modifier, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val context = LocalContext.current
    val today = rememberLoaded(3 * 60 * 60_000L) { News.today() }
    val is24 = remember { DateFormat.is24HourFormat(context) }
    val minute = rememberMinute()
    fun minutes(t: String) = t.split(':').let { (it[0].toIntOrNull() ?: 0) * 60 + (it.getOrNull(1)?.toIntOrNull() ?: 0) }
    val prayers = today?.prayers.orEmpty()
    val next = prayers.indexOfFirst { minutes(it.time) > minute }
    Row(modifier.padding(horizontal = d(12f)), verticalAlignment = Alignment.CenterVertically) {
        Text("PRAYER TIMES", color = Muted, fontWeight = FontWeight.Bold, fontSize = s(11f), letterSpacing = s(1.5f), maxLines = 1)
        Spacer(Modifier.width(d(16f)))
        prayers.forEachIndexed { i, p ->
            val m = minutes(p.time)
            val shown = if (is24) p.time else "${(m / 60 + 11) % 12 + 1}:${"%02d".format(m % 60)}"
            val color = if (i == next) FocusColor else Color.White
            Text(if (p.name == "Dhuhr") "Zuhr " else p.name + " ", color = if (i == next) FocusColor else Soft, fontSize = s(13f), maxLines = 1)
            Text(shown, color = color, fontWeight = FontWeight.Bold, fontSize = s(13f), maxLines = 1)
            Spacer(Modifier.width(d(14f)))
        }
        today?.hijri?.let { Text("☪ ${it.label}", color = Soft, fontSize = s(11f), maxLines = 1, overflow = TextOverflow.Ellipsis) }
    }
}

/** The current minute of the day, ticking over on the minute. */
@Composable
private fun rememberMinute(): Int {
    var minute by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            val c = java.util.Calendar.getInstance()
            minute = c.get(java.util.Calendar.HOUR_OF_DAY) * 60 + c.get(java.util.Calendar.MINUTE)
            delay(60_000 - System.currentTimeMillis() % 60_000)
        }
    }
    return minute
}

/** Rates down the right side: as many as fit, the next ones every 10 seconds, then gold per tola. */
@Composable
private fun CurrencyList(modifier: Modifier, rates: News.Rates?, gold: Double?, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val r = rates ?: return
    val items = remember(r, gold) {
        News.ASIAN.filter { it.code != r.base && r[it.code] != null }.map { m ->
            "${m.flag}  ${m.code}" to "${m.symbol}${amount(r[m.code]!!)}"
        } + listOf(r.base to "$", "PKR" to "Rs ", "INR" to "₹").mapNotNull { (code, symbol) ->
            News.goldTola(gold, r, code)?.let { "🪙  Gold tola $code" to "$symbol${"%,.0f".format(it)}" }
        }
    }
    BoxWithConstraints(modifier.padding(vertical = d(6f))) {
        val rowHeight = d(18f)
        val fits = ((maxHeight - d(18f)) / rowHeight).toInt().coerceAtLeast(1)
        val pages = items.chunked(fits)
        var turn by remember { mutableIntStateOf(0) }
        LaunchedEffect(pages.size) {
            while (true) {
                delay(10_000)
                turn++
            }
        }
        Column(Modifier.fillMaxWidth()) {
            Text("1 ${r.base} =", color = Muted, fontWeight = FontWeight.Bold, fontSize = s(10f), letterSpacing = s(1.5f), modifier = Modifier.height(d(16f)))
            if (pages.isEmpty()) return@Column
            pages[Math.floorMod(turn, pages.size)].forEach { (name, value) ->
                Row(Modifier.fillMaxWidth().height(rowHeight), verticalAlignment = Alignment.CenterVertically) {
                    Text(name, color = Color.White, fontSize = s(12f), modifier = Modifier.weight(1f), maxLines = 1)
                    Text(value, color = FocusColor, fontWeight = FontWeight.Bold, fontSize = s(12f), maxLines = 1)
                }
            }
        }
    }
}

/** Top stories down the right side: as many as fit, the next ones every 15 seconds. */
@Composable
private fun StoryList(modifier: Modifier, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val stories = rememberLoaded(15 * 60_000L) { News.headlines().takeIf { it.isNotEmpty() } } ?: return
    BoxWithConstraints(modifier.padding(vertical = d(6f))) {
        val storyHeight = d(48f)
        val fits = ((maxHeight - d(18f)) / storyHeight).toInt().coerceAtLeast(1)
        val pages = stories.chunked(fits)
        var turn by remember { mutableIntStateOf(0) }
        LaunchedEffect(pages.size) {
            while (true) {
                delay(15_000)
                turn++
            }
        }
        Column(Modifier.fillMaxWidth()) {
            Text("TOP STORIES", color = Muted, fontWeight = FontWeight.Bold, fontSize = s(10f), letterSpacing = s(1.5f), modifier = Modifier.height(d(16f)))
            pages[Math.floorMod(turn, pages.size)].forEach { story ->
                Column(Modifier.fillMaxWidth().height(storyHeight), verticalArrangement = Arrangement.Center) {
                    Text(story.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(12f), lineHeight = s(14f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(story.source, color = Muted, fontSize = s(9f), maxLines = 1)
                }
            }
        }
    }
}

/**
 * A second channel, small and silent (its sound isn't even decoded). Left and Right on the main
 * channel change it.
 */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
private fun SecondChannel(channel: Channel?, playing: Boolean, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val context = LocalContext.current
    val stream = remember {
        com.livetv.app.player.StreamPlayer(context, preview = true).also {
            it.player.volume = 0f
            it.player.trackSelectionParameters = it.player.trackSelectionParameters.buildUpon()
                .setMaxVideoSize(854, 480)
                .setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_AUDIO, true)
                .build()
        }
    }
    var showing by remember { mutableStateOf(false) }
    DisposableEffect(stream) {
        val listener = object : Player.Listener {
            override fun onRenderedFirstFrame() {
                showing = true
            }
        }
        stream.player.addListener(listener)
        onDispose {
            stream.player.removeListener(listener)
            stream.release()
        }
    }
    LaunchedEffect(channel?.id) {
        showing = false
        if (channel != null) stream.play(channel) else stream.stop()
    }
    LaunchedEffect(playing) { stream.player.playWhenReady = playing }
    Box(Modifier.fillMaxWidth().padding(vertical = d(6f)).aspectRatio(16f / 9f).background(Color.Black)) {
        AndroidView(
            factory = { ctx -> TextureView(ctx).also { stream.player.setVideoTextureView(it) } },
            onRelease = { stream.player.clearVideoTextureView(it) },
            modifier = Modifier.fillMaxSize().graphicsLayer { alpha = if (showing) 1f else 0f },
        )
        channel?.let { ch ->
            Text(
                (if (ch.number > 0) "${ch.number}  " else "") + ch.name + "   ◀ ▶",
                color = Color.White,
                fontSize = s(10f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(d(4f))
                    .background(Color.Black.copy(alpha = 0.6f), ChipShape)
                    .padding(horizontal = d(5f), vertical = d(1f)),
            )
        }
    }
}
