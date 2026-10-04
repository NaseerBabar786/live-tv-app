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
import com.livetv.app.data.Cp24Screen
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
import androidx.compose.foundation.layout.wrapContentHeight
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
import androidx.compose.ui.draw.clip
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

private val Panel: Color get() = Themes.current.panel
private val Line: Color get() = Themes.current.line
private val Muted: Color get() = Themes.current.muted
private val Soft: Color get() = Themes.current.soft
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
    /** CP24's look instead of News mode's. */
    cp24: Boolean = false,
    /** The modern Home screen instead of News mode's. */
    home: Boolean = false,
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
    val newsChoices by NewsScreen.choices.collectAsStateWithLifecycle()
    val cp24Choices by Cp24Screen.choices.collectAsStateWithLifecycle()
    val choices = newsChoices
    // Home: Right shows a second channel in the corner of the main one (and moves it along), Left hides it.
    var pip by remember { mutableStateOf(false) }
    val usesSecond = when {
        cp24 -> cp24Choices[Cp24Screen.Section.Middle] == Cp24Screen.SECOND
        home -> pip
        else -> choices.usesSecond
    }
    // The second channel, when one of the spots shows it: Left and Right change it.
    var secondId by remember { mutableStateOf(NewsScreen.secondId) }
    val second = if (!usesSecond) null else
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

        // The live channel (Up and Down change it, OK opens it full screen).
        @Composable
        fun Live(modifier: Modifier) {
            Box(
                Modifier
                    .then(modifier)
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
                            home && e.key == Key.DirectionLeft -> { pip = false; true }
                            home && e.key == Key.DirectionRight -> { if (pip) stepSecond(1) else pip = true; true }
                            e.key == Key.DirectionLeft -> { if (usesSecond) stepSecond(-1); true }
                            e.key == Key.DirectionRight -> { if (usesSecond) stepSecond(1); true }
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
        }

        if (home) HomeLayout(
            live = { Live(it) },
            second = second,
            secondPlaying = secondPlaying,
            markets = markets,
            rates = rates,
            gold = gold,
            allowVideo = now >= videoOkAt,
            s = ::s,
            d = ::d,
        ) else if (cp24) Cp24Layout(
            live = { Live(it) },
            selected = selected,
            choices = cp24Choices,
            markets = markets,
            rates = rates,
            gold = gold,
            second = second,
            secondPlaying = secondPlaying,
            allowVideo = now >= videoOkAt,
            s = ::s,
            d = ::d,
        ) else
        Row(Modifier.fillMaxSize()) {
            Column(Modifier.width(playerWidth).fillMaxHeight()) {
                Live(Modifier.width(playerWidth).height(playerHeight))
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

private val Cp24Red = Color(0xFFD71920)
private val Cp24Navy = Color(0xFF0A1A3A)
private val Cp24Sky = Color(0xFF2F6DB5)
private val Cp24SkyDark = Color(0xFF173F7A)
private val Cp24Green = Color(0xFF1E8E3E)

/**
 * CP24 mode: a big live channel with the top story under it, a red clock-and-weather column on
 * the right with a big box (the sponsor at first) and a small line that takes turns, and two
 * scrolling lines along the bottom with the channel number in red. Every section shows what the
 * viewer picked in Settings (see [Cp24Screen]); the sponsor and the advertising line always stay.
 */
@Composable
private fun Cp24Layout(
    live: @Composable (Modifier) -> Unit,
    selected: Channel?,
    choices: Cp24Screen.Choices,
    markets: List<News.Market>?,
    rates: News.Rates?,
    gold: Double?,
    second: Channel?,
    secondPlaying: Boolean,
    allowVideo: Boolean,
    s: (Float) -> TextUnit,
    d: (Float) -> Dp,
) {
    val context = LocalContext.current
    val forecast = if (Edition.HAS_WEATHER) rememberLoaded(30 * 60_000L) { News.forecast() } else null
    val city = rememberLoaded(24 * 60 * 60_000L) { News.place()?.city?.takeIf { it.isNotBlank() } }
    val today = rememberLoaded(3 * 60 * 60_000L) { News.today() }
    val minute = rememberMinute()
    val is24 = remember { DateFormat.is24HourFormat(context) }
    val sponsorInBand = choices[Cp24Screen.Section.Middle] != Cp24Screen.SPONSOR
    val crawl = choices[Cp24Screen.Section.Crawl]
    BoxWithConstraints(Modifier.fillMaxSize().background(Color.Black)) {
        val lineHeight = d(30f)
        val linesHeight = lineHeight * (if (crawl == Cp24Screen.NOTHING) 1 else 2)
        val playerWidth = minOf(maxWidth * 0.64f, (maxHeight - linesHeight - d(90f)) * 16f / 9f)
        val playerHeight = playerWidth * 9f / 16f
        val bandHeight = maxHeight - linesHeight - playerHeight
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().weight(1f)) {
                Column(Modifier.width(playerWidth).fillMaxHeight()) {
                    live(Modifier.width(playerWidth).height(playerHeight))
                    // Under the channel: the chosen line, and the sponsor beside it when the big box shows something else.
                    Row(Modifier.fillMaxWidth().height(bandHeight).background(Cp24Navy)) {
                        val m = Modifier.weight(1f).fillMaxHeight()
                        when (choices[Cp24Screen.Section.Band]) {
                            Cp24Screen.STORIES -> Cp24Story(m, s, d)
                            Cp24Screen.PRAYERS -> PrayerRow(m, s, d)
                            Cp24Screen.CURRENCIES -> InfoRow(m, rates, gold, s, d)
                            Cp24Screen.MARKETS -> Crawl(m, markets, null, null, s, d)
                            else -> Box(m)
                        }
                        if (sponsorInBand) {
                            EditionSponsorVideoBox(Modifier.width(bandHeight * 16f / 9f).fillMaxHeight(), allowVideo = allowVideo)
                        }
                    }
                }
                Column(Modifier.fillMaxSize().background(Cp24SkyDark)) {
                    Cp24DateBar(forecast, s, d)
                    Cp24Clock(is24, s, d)
                    Cp24Boxes(choices[Cp24Screen.Section.Boxes], forecast, today, minute, is24, s, d)
                    // Like CP24's pressure line: how it feels, humidity and wind.
                    Text(
                        listOfNotNull(
                            forecast?.let { "Feels ${it.feelsLike}°" },
                            forecast?.humidity?.let { "Humidity $it%" },
                            forecast?.wind?.let { "Wind $it " + if (forecast.unit == "F") "mph" else "km/h" },
                        ).joinToString("   ·   "),
                        color = Color.White,
                        fontSize = s(10f),
                        maxLines = 1,
                        modifier = Modifier.fillMaxWidth().background(Cp24SkyDark).padding(horizontal = d(8f), vertical = d(3f)),
                    )
                    Text(
                        ((city?.let { "$it " } ?: "") + "right now").uppercase(),
                        color = Cp24Navy,
                        fontWeight = FontWeight.Bold,
                        fontSize = s(13f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.fillMaxWidth().background(Color.White).padding(horizontal = d(8f), vertical = d(3f)),
                    )
                    // The big box (CP24's traffic box).
                    Box(Modifier.fillMaxWidth().weight(1f).background(Panel)) {
                        when (choices[Cp24Screen.Section.Middle]) {
                            Cp24Screen.SPONSOR -> EditionSponsorVideoBox(Modifier.fillMaxSize(), allowVideo = allowVideo)
                            Cp24Screen.PRAYERS -> Cp24PrayerBox(Modifier.fillMaxSize(), today, minute, is24, s, d)
                            Cp24Screen.MARKETS -> Markets(Modifier.fillMaxSize().padding(horizontal = d(10f)), markets, s, d)
                            Cp24Screen.CURRENCIES -> CurrencyList(Modifier.fillMaxSize().padding(horizontal = d(10f)), rates, gold, s, d)
                            Cp24Screen.STORIES -> StoryList(Modifier.fillMaxSize().padding(horizontal = d(10f)), s, d)
                            Cp24Screen.SECOND -> Box(Modifier.fillMaxSize().padding(horizontal = d(8f)), contentAlignment = Alignment.Center) {
                                SecondChannel(second, secondPlaying, s, d)
                            }
                        }
                    }
                    Cp24Line(Modifier.fillMaxWidth().height(d(28f)), choices[Cp24Screen.Section.Line], markets, rates, gold, today, minute, is24, s, d)
                }
            }
            if (crawl != Cp24Screen.NOTHING) {
                Box(Modifier.fillMaxWidth().height(lineHeight).background(Color(0xFF0E1830))) {
                    if (crawl == Cp24Screen.STORIES) StoryCrawl(Modifier.fillMaxSize(), s, d)
                    else Crawl(Modifier.fillMaxSize(), markets, rates, gold, s, d)
                }
            }
            Row(Modifier.fillMaxWidth().height(lineHeight)) {
                Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFF05070D)).padding(horizontal = d(12f))) {
                    EditionTicker(Modifier.fillMaxSize(), big = true, always = true)
                }
                Box(Modifier.width(d(56f)).fillMaxHeight().background(Cp24Red), contentAlignment = Alignment.Center) {
                    Text(
                        selected?.number?.takeIf { it > 0 }?.toString() ?: "",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = s(18f),
                    )
                }
            }
        }
    }
}

/** The red bar at the top right: the day and date, and the weather now. */
@Composable
private fun Cp24DateBar(forecast: News.Forecast?, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    var now by remember { mutableStateOf(Date()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = Date()
            delay(60_000 - System.currentTimeMillis() % 60_000)
        }
    }
    val date = remember(now) { SimpleDateFormat("EEE MMM d", Locale.getDefault()).format(now).uppercase() }
    Row(
        Modifier.fillMaxWidth().background(Cp24Red).padding(horizontal = d(10f), vertical = d(3f)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(date, color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(17f), modifier = Modifier.weight(1f), maxLines = 1)
        forecast?.let {
            Text("${it.icon} ${it.temperature}°", color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(18f), maxLines = 1)
        }
    }
}

/** The big clock, with seconds. */
@Composable
private fun Cp24Clock(is24: Boolean, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    var now by remember { mutableStateOf(Date()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = Date()
            delay(1_000 - System.currentTimeMillis() % 1_000)
        }
    }
    val time = remember(now) { SimpleDateFormat(if (is24) "H:mm:ss" else "h:mm:ss", Locale.getDefault()).format(now) }
    val amPm = remember(now) { if (is24) "" else SimpleDateFormat("a", Locale.getDefault()).format(now) }
    Row(
        Modifier.fillMaxWidth().background(Cp24Navy).padding(horizontal = d(10f), vertical = d(2f)),
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(time, color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(30f), lineHeight = s(34f))
        if (amPm.isNotEmpty()) Text(" $amPm", color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(12f), modifier = Modifier.padding(bottom = d(5f)))
    }
}

/** The five boxes under the clock: the next parts of the day, the next days, or the prayer times. */
@Composable
private fun Cp24Boxes(
    kind: String,
    forecast: News.Forecast?,
    today: News.Today?,
    minute: Int,
    is24: Boolean,
    s: (Float) -> TextUnit,
    d: (Float) -> Dp,
) {
    // (title, middle, bottom, highlighted)
    val boxes: List<List<Any>> = when (kind) {
        Cp24Screen.DAYS -> forecast?.days?.take(4)?.map { listOf(it.name, it.icon, "${it.high}°", false) }
        Cp24Screen.PRAYERS -> today?.prayers?.let { prayers ->
            val next = prayers.indexOfFirst { prayerMinutes(it.time) > minute }
            prayers.mapIndexed { i, p -> listOf(prayerName(p.name).uppercase(), "🕌", shownTime(p.time, is24), i == next) }
        }
        else -> forecast?.periods?.map { listOf(it.name, it.icon, "${it.temperature}°", false) }
    }.orEmpty()
    Row(
        Modifier
            .fillMaxWidth()
            .height(d(90f))
            .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Cp24Sky, Cp24SkyDark))),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        boxes.forEach { (title, middle, bottom, highlighted) ->
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                val color = if (highlighted == true) FocusColor else Color.White
                Text(title as String, color = color, fontWeight = FontWeight.Bold, fontSize = s(11f), maxLines = 1)
                Text(middle as String, fontSize = s(24f), lineHeight = s(30f))
                Text(bottom as String, color = color, fontWeight = FontWeight.Bold, fontSize = s(if (kind == Cp24Screen.PRAYERS) 13f else 20f), maxLines = 1)
            }
        }
    }
}

/** The big box showing the next prayer, CP24 traffic-box style, with all five times under it. */
@Composable
private fun Cp24PrayerBox(modifier: Modifier, today: News.Today?, minute: Int, is24: Boolean, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val prayers = today?.prayers.orEmpty()
    Column(modifier.padding(d(8f)), verticalArrangement = Arrangement.SpaceEvenly, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("NEXT PRAYER", color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(14f))
        val next = nextPrayer(prayers, minute)
        if (next == null) {
            Text("Loading…", color = Soft, fontSize = s(12f))
            return@Column
        }
        Row(horizontalArrangement = Arrangement.spacedBy(d(8f))) {
            Column(
                Modifier.background(Cp24Green, ChipShape).border(d(2f), Color.White, ChipShape).padding(horizontal = d(14f), vertical = d(4f)),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(prayerName(next.first.name).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(13f))
                Text(shownTime(next.first.time, is24), color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(26f))
            }
            Column(
                Modifier.background(Color.Black, ChipShape).border(d(2f), Color.White, ChipShape).padding(horizontal = d(14f), vertical = d(4f)),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("IN", color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(13f))
                Text(untilText(next.second), color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(22f))
            }
        }
        Text(
            prayers.joinToString("   ") { "${prayerName(it.name)} ${shownTime(it.time, is24)}" },
            color = Soft,
            fontSize = s(10f),
            maxLines = 1,
        )
        today?.hijri?.let { Text("☪ ${it.label}", color = Soft, fontSize = s(10f), maxLines = 1) }
    }
}

/** One top story at a time under the channel, CP24 style: a red square and big white words. */
@Composable
private fun Cp24Story(modifier: Modifier, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val stories = rememberLoaded(15 * 60_000L) { News.headlines().takeIf { it.isNotEmpty() } }
    var turn by remember { mutableIntStateOf(0) }
    LaunchedEffect(stories) {
        while (true) {
            delay(12_000)
            turn++
        }
    }
    val story = stories?.let { it[Math.floorMod(turn, it.size)] }
    Row(modifier.padding(horizontal = d(14f), vertical = d(8f)), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(d(14f)).background(Cp24Red))
        Spacer(Modifier.width(d(10f)))
        Column {
            Text(
                story?.title ?: Edition.APP_NAME,
                color = Color.White,
                fontSize = s(19f),
                lineHeight = s(23f),
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            story?.let { Text(it.source, color = Muted, fontSize = s(10f)) }
        }
    }
}

/** Every top story crawling right to left along one line. */
@Composable
private fun StoryCrawl(modifier: Modifier, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val stories = rememberLoaded(15 * 60_000L) { News.headlines().takeIf { it.isNotEmpty() } } ?: return
    val text = remember(stories) {
        buildAnnotatedString {
            stories.forEach { h ->
                withStyle(SpanStyle(color = Cp24Red, fontWeight = FontWeight.Bold)) { append("■ ") }
                withStyle(SpanStyle(color = Color.White)) { append(h.title) }
                withStyle(SpanStyle(color = Muted)) { append("  (${h.source})      ") }
            }
        }
    }
    Box(modifier.padding(horizontal = d(12f)), contentAlignment = Alignment.CenterStart) {
        Text(
            text,
            fontSize = s(13f),
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.fillMaxWidth().basicMarquee(iterations = Int.MAX_VALUE, initialDelayMillis = 0, velocity = d(55f)),
        )
    }
}

/** The small line under the big box (CP24's "DAX" line): one item at a time, the next every 8 seconds. */
@Composable
private fun Cp24Line(
    modifier: Modifier,
    kind: String,
    markets: List<News.Market>?,
    rates: News.Rates?,
    gold: Double?,
    today: News.Today?,
    minute: Int,
    is24: Boolean,
    s: (Float) -> TextUnit,
    d: (Float) -> Dp,
) {
    // (label, value, change)
    val marketItems = markets.orEmpty().map { m ->
        Triple(m.name.uppercase(), (if (m.name.startsWith("Gold")) "$" else "") + "%,.0f".format(m.price), m.change)
    }
    val rateItems = rates?.let { r ->
        News.ASIAN.filter { it.code != r.base && r[it.code] != null }
            .map { m -> Triple("1 ${r.base} ${m.flag}", "${m.symbol}${amount(r[m.code]!!)} ${m.code}", null as Double?) }
    }.orEmpty()
    val prayerItems = nextPrayer(today?.prayers.orEmpty(), minute)?.let { (p, until) ->
        listOf(Triple("NEXT PRAYER", "${prayerName(p.name)} ${shownTime(p.time, is24)} · in ${untilText(until)}", null as Double?))
    }.orEmpty()
    val goldItems = rates?.let { r ->
        listOf(r.base to "$", "PKR" to "Rs ", "INR" to "₹").mapNotNull { (code, symbol) ->
            News.goldTola(gold, r, code)?.let { Triple("GOLD 1 TOLA", "$symbol${"%,.0f".format(it)} $code", null as Double?) }
        }
    }.orEmpty()
    val items = when (kind) {
        Cp24Screen.MARKETS -> marketItems
        Cp24Screen.CURRENCIES -> rateItems
        Cp24Screen.NEXT_PRAYER -> prayerItems
        Cp24Screen.GOLD -> goldItems
        else -> {
            // Takes turns: a market, a rate, the next prayer, gold, and round again.
            val lists = listOf(marketItems, rateItems, prayerItems, goldItems).filter { it.isNotEmpty() }
            val out = mutableListOf<Triple<String, String, Double?>>()
            for (i in 0 until (lists.maxOfOrNull { it.size } ?: 0)) lists.forEach { l -> out += l[i % l.size] }
            out
        }
    }
    var turn by remember { mutableIntStateOf(0) }
    LaunchedEffect(kind) {
        while (true) {
            delay(8_000)
            turn++
        }
    }
    Row(modifier.background(Color.Black), verticalAlignment = Alignment.CenterVertically) {
        val item = items.takeIf { it.isNotEmpty() }?.let { it[Math.floorMod(turn, it.size)] } ?: return@Row
        Text(
            item.first,
            color = Cp24Navy,
            fontWeight = FontWeight.Bold,
            fontSize = s(11f),
            maxLines = 1,
            modifier = Modifier.fillMaxHeight().background(Color(0xFFE6E9F0)).padding(horizontal = d(8f)).wrapContentHeight(),
        )
        Text(
            item.second,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = s(13f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).padding(horizontal = d(8f)),
        )
        item.third?.let { c ->
            Text(
                (if (c >= 0) "▲ " else "▼ ") + "%.1f%%".format(abs(c)),
                color = if (c >= 0) Up else Down,
                fontWeight = FontWeight.Bold,
                fontSize = s(13f),
                modifier = Modifier.padding(end = d(8f)),
            )
        }
    }
}

private fun prayerMinutes(t: String) = t.split(':').let { (it[0].toIntOrNull() ?: 0) * 60 + (it.getOrNull(1)?.toIntOrNull() ?: 0) }

private fun prayerName(name: String) = if (name == "Dhuhr") "Zuhr" else name

private fun shownTime(t: String, is24: Boolean) =
    if (is24) t else prayerMinutes(t).let { m -> "${(m / 60 + 11) % 12 + 1}:${"%02d".format(m % 60)}" }

/** The next prayer and how many minutes until it (after Isha, tomorrow's Fajr). */
private fun nextPrayer(prayers: List<News.Prayer>, minute: Int): Pair<News.Prayer, Int>? {
    if (prayers.isEmpty()) return null
    prayers.firstOrNull { prayerMinutes(it.time) > minute }?.let { return it to prayerMinutes(it.time) - minute }
    val fajr = prayers.first()
    return fajr to 24 * 60 - minute + prayerMinutes(fajr.time)
}

private fun untilText(minutes: Int) = when {
    minutes < 60 -> "$minutes min"
    minutes % 60 == 0 -> "${minutes / 60} h"
    else -> "${minutes / 60} h ${minutes % 60} min"
}

private val HomeTop: Color get() = Themes.current.homeTop
private val HomeBottom: Color get() = Themes.current.homeBottom
private val Glass = Color.White.copy(alpha = 0.07f)
private val GlassEdge = Color.White.copy(alpha = 0.10f)

/**
 * Home mode: a modern screen of rounded cards around the live channel. The clock with the Islamic
 * date; the weather now and for the rest of the day; the next prayer with a countdown (sehri and
 * iftar in Ramadan) and a reminder over the channel ten minutes before each prayer; top stories,
 * markets, currency rates and the sponsor along the bottom; the advertising line under them.
 * Right shows a second channel in the corner of the main one (Right again changes it, Left hides it).
 */
@Composable
private fun HomeLayout(
    live: @Composable (Modifier) -> Unit,
    second: Channel?,
    secondPlaying: Boolean,
    markets: List<News.Market>?,
    rates: News.Rates?,
    gold: Double?,
    allowVideo: Boolean,
    s: (Float) -> TextUnit,
    d: (Float) -> Dp,
) {
    val context = LocalContext.current
    val forecast = if (Edition.HAS_WEATHER) rememberLoaded(30 * 60_000L) { News.forecast() } else null
    val city = rememberLoaded(24 * 60 * 60_000L) { News.place()?.city?.takeIf { it.isNotBlank() } }
    val today = rememberLoaded(3 * 60 * 60_000L) { News.today() }
    val minute = rememberMinute()
    val is24 = remember { DateFormat.is24HourFormat(context) }
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(d(14f))
    fun Modifier.card() = this.clip(shape).background(Glass).border(1.dp, GlassEdge, shape)
    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(HomeTop, HomeBottom))),
    ) {
        val gap = d(10f)
        val tickerHeight = d(24f)
        val playerWidth = minOf((maxWidth - gap * 3) * 0.66f, (maxHeight - gap * 4 - tickerHeight - d(110f)) * 16f / 9f)
        val playerHeight = playerWidth * 9f / 16f
        Column(Modifier.fillMaxSize().padding(gap), verticalArrangement = Arrangement.spacedBy(gap)) {
            Row(Modifier.fillMaxWidth().height(playerHeight), horizontalArrangement = Arrangement.spacedBy(gap)) {
                Box(Modifier.width(playerWidth).fillMaxHeight().clip(shape)) {
                    live(Modifier.fillMaxSize())
                    // A gentle reminder ten minutes (or less) before each prayer.
                    nextPrayer(today?.prayers.orEmpty(), minute)?.let { (p, until) ->
                        if (until in 1..10) {
                            Text(
                                "🕌  ${prayerName(p.name)} in $until min",
                                color = Color.Black,
                                fontWeight = FontWeight.Bold,
                                fontSize = s(14f),
                                modifier = Modifier
                                    .align(Alignment.TopCenter)
                                    .padding(top = d(12f))
                                    .background(FocusColor, androidx.compose.foundation.shape.RoundedCornerShape(50))
                                    .padding(horizontal = d(16f), vertical = d(6f)),
                            )
                        }
                    }
                    // The second channel, in the bottom right corner.
                    if (second != null) {
                        Box(
                            Modifier
                                .align(Alignment.BottomEnd)
                                .padding(d(10f))
                                .width(playerWidth * 0.3f)
                                .clip(androidx.compose.foundation.shape.RoundedCornerShape(d(8f)))
                                .border(2.dp, Color.White.copy(alpha = 0.8f), androidx.compose.foundation.shape.RoundedCornerShape(d(8f))),
                        ) {
                            SecondChannel(second, secondPlaying, s) { 0.dp }
                        }
                    }
                }
                Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(gap)) {
                    HomeClock(Modifier.fillMaxWidth().card(), today, is24, s, d)
                    HomeWeather(Modifier.fillMaxWidth().card(), forecast, city, s, d)
                    HomePrayer(Modifier.fillMaxWidth().weight(1f).card(), today, minute, is24, s, d)
                }
            }
            Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(gap)) {
                HomeStories(Modifier.weight(2f).fillMaxHeight().card(), s, d)
                Box(Modifier.weight(1f).fillMaxHeight().card().padding(horizontal = d(10f))) {
                    Markets(Modifier.fillMaxSize(), markets, s, d)
                }
                Box(Modifier.weight(1f).fillMaxHeight().card().padding(horizontal = d(10f))) {
                    CurrencyList(Modifier.fillMaxSize(), rates, gold, s, d)
                }
                BoxWithConstraints(Modifier.fillMaxHeight()) {
                    Box(Modifier.width(maxHeight * 16f / 9f).fillMaxHeight().clip(shape)) {
                        EditionSponsorVideoBox(Modifier.fillMaxSize(), allowVideo = allowVideo)
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(tickerHeight).clip(shape).background(Color.Black.copy(alpha = 0.4f)).padding(horizontal = d(12f))) {
                EditionTicker(Modifier.fillMaxSize(), big = false, always = true)
            }
        }
    }
}

@Composable
private fun HomeClock(modifier: Modifier, today: News.Today?, is24: Boolean, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    var now by remember { mutableStateOf(Date()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = Date()
            delay(1_000 - System.currentTimeMillis() % 1_000)
        }
    }
    val time = remember(now) { SimpleDateFormat(if (is24) "H:mm" else "h:mm", Locale.getDefault()).format(now) }
    val seconds = remember(now) { SimpleDateFormat(":ss", Locale.getDefault()).format(now) }
    val amPm = remember(now) { if (is24) "" else SimpleDateFormat("a", Locale.getDefault()).format(now) }
    val date = remember(now) { SimpleDateFormat("EEEE, MMMM d", Locale.getDefault()).format(now) }
    Column(modifier.padding(horizontal = d(14f), vertical = d(8f))) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(time, color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(40f), lineHeight = s(42f))
            Text(seconds, color = Soft, fontWeight = FontWeight.Bold, fontSize = s(18f), modifier = Modifier.padding(bottom = d(5f)))
            if (amPm.isNotEmpty()) Text(" $amPm", color = Soft, fontWeight = FontWeight.Bold, fontSize = s(14f), modifier = Modifier.padding(bottom = d(6f)))
        }
        Text(date, color = Color.White, fontSize = s(12f), maxLines = 1)
        today?.hijri?.let { Text("☪ ${it.label}", color = FocusColor, fontSize = s(11f), maxLines = 1, overflow = TextOverflow.Ellipsis) }
    }
}

@Composable
private fun HomeWeather(modifier: Modifier, forecast: News.Forecast?, city: String?, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    Column(modifier.padding(horizontal = d(14f), vertical = d(8f))) {
        if (forecast == null) {
            Text(city?.let { "📍 $it" } ?: "Weather", color = Soft, fontSize = s(12f))
            return@Column
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(forecast.icon, fontSize = s(28f))
            Spacer(Modifier.width(d(8f)))
            Text("${forecast.temperature}°", color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(30f))
            Spacer(Modifier.width(d(10f)))
            Column(Modifier.weight(1f)) {
                city?.let { Text("📍 $it", color = Color.White, fontSize = s(12f), maxLines = 1, overflow = TextOverflow.Ellipsis) }
                Text(
                    listOfNotNull("feels ${forecast.feelsLike}°", forecast.humidity?.let { "💧$it%" }).joinToString("  ·  "),
                    color = Soft,
                    fontSize = s(10f),
                    maxLines = 1,
                )
            }
        }
        val parts = forecast.periods.take(4).map { Triple(it.name, it.icon, it.temperature) }
            .ifEmpty { forecast.days.take(4).map { Triple(it.name, it.icon, it.high) } }
        Row(Modifier.fillMaxWidth().padding(top = d(4f)), horizontalArrangement = Arrangement.SpaceBetween) {
            parts.forEach { (name, icon, t) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(name.lowercase().replaceFirstChar { it.uppercase() } + " ", color = Soft, fontSize = s(10f))
                    Text(icon, fontSize = s(12f))
                    Text(" $t°", color = Color.White, fontWeight = FontWeight.Bold, fontSize = s(11f))
                }
            }
        }
    }
}

@Composable
private fun HomePrayer(modifier: Modifier, today: News.Today?, minute: Int, is24: Boolean, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val prayers = today?.prayers.orEmpty()
    Column(modifier.padding(horizontal = d(14f), vertical = d(8f)), verticalArrangement = Arrangement.SpaceBetween) {
        val next = nextPrayer(prayers, minute)
        if (next == null) {
            Text("PRAYER TIMES", color = Muted, fontWeight = FontWeight.Bold, fontSize = s(10f), letterSpacing = s(1.5f))
            Text("Loading…", color = Soft, fontSize = s(11f))
            return@Column
        }
        val (p, until) = next
        val ramadan = today?.hijri?.month == 9
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("NEXT PRAYER", color = Muted, fontWeight = FontWeight.Bold, fontSize = s(10f), letterSpacing = s(1.5f))
                Text(
                    "${prayerName(p.name)}  ${shownTime(p.time, is24)}",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = s(20f),
                    maxLines = 1,
                )
            }
            Text("in ${untilText(until)}", color = FocusColor, fontWeight = FontWeight.Bold, fontSize = s(14f), maxLines = 1)
        }
        // How far along it is from the last prayer to the next one.
        val previous = prayers.lastOrNull { prayerMinutes(it.time) <= minute } ?: prayers.last()
        val span = Math.floorMod(prayerMinutes(p.time) - prayerMinutes(previous.time), 24 * 60).coerceAtLeast(1)
        val done = (1f - until.toFloat() / span).coerceIn(0f, 1f)
        Box(Modifier.fillMaxWidth().height(d(5f)).clip(androidx.compose.foundation.shape.RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.12f))) {
            Box(Modifier.fillMaxWidth(done).fillMaxHeight().background(FocusColor))
        }
        if (ramadan) {
            val fajr = prayers.firstOrNull { it.name == "Fajr" }
            val maghrib = prayers.firstOrNull { it.name == "Maghrib" }
            val text = when {
                maghrib != null && prayerMinutes(maghrib.time) > minute ->
                    "🌙 Iftar in ${untilText(prayerMinutes(maghrib.time) - minute)}"
                fajr != null -> "🌙 Sehri ends at ${shownTime(fajr.time, is24)}"
                else -> null
            }
            text?.let { Text(it, color = FocusColor, fontSize = s(11f), maxLines = 1) }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            prayers.forEach { q ->
                val isNext = q == p
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(prayerName(q.name), color = if (isNext) FocusColor else Muted, fontSize = s(9f), maxLines = 1)
                    Text(shownTime(q.time, is24), color = if (isNext) FocusColor else Color.White, fontWeight = FontWeight.Bold, fontSize = s(11f), maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun HomeStories(modifier: Modifier, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val stories = rememberLoaded(15 * 60_000L) { News.headlines().takeIf { it.isNotEmpty() } }
    var turn by remember { mutableIntStateOf(0) }
    LaunchedEffect(stories) {
        while (true) {
            delay(12_000)
            turn++
        }
    }
    val story = stories?.let { it[Math.floorMod(turn, it.size)] }
    Column(modifier.padding(horizontal = d(14f), vertical = d(10f)), verticalArrangement = Arrangement.SpaceBetween) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(d(8f)).clip(androidx.compose.foundation.shape.RoundedCornerShape(50)).background(Cp24Red))
            Spacer(Modifier.width(d(6f)))
            Text("TOP STORIES" + (story?.let { " · ${it.source.uppercase()}" } ?: ""), color = Muted, fontWeight = FontWeight.Bold, fontSize = s(10f), letterSpacing = s(1.5f), maxLines = 1)
        }
        Text(
            story?.title ?: Edition.APP_NAME,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = s(16f),
            lineHeight = s(20f),
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
        // Little dots: which of the stories this is.
        stories?.let { list ->
            Row(horizontalArrangement = Arrangement.spacedBy(d(4f))) {
                val at = Math.floorMod(turn, list.size)
                for (i in 0 until minOf(list.size, 12)) {
                    Box(
                        Modifier
                            .size(d(5f))
                            .clip(androidx.compose.foundation.shape.RoundedCornerShape(50))
                            .background(if (i == at % 12) FocusColor else Color.White.copy(alpha = 0.2f)),
                    )
                }
            }
        }
    }
}
