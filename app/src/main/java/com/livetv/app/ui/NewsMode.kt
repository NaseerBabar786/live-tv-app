package com.livetv.app.ui

import android.os.SystemClock
import android.text.format.DateFormat
import android.view.TextureView
import androidx.compose.foundation.background
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
                                e.key == Key.DirectionLeft || e.key == Key.DirectionRight -> true
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
                // Along the bottom: top stories, rupee rates, and the scrolling line.
                Column(Modifier.fillMaxWidth().height(bottomHeight).background(Panel)) {
                    Headlines(Modifier.fillMaxWidth().weight(1.35f), ::s, ::d)
                    Divider()
                    InfoRow(Modifier.fillMaxWidth().weight(1f), ::s, ::d)
                    Divider()
                    Box(Modifier.fillMaxWidth().weight(0.9f).background(Color(0xFF05070D)).padding(horizontal = d(12f))) {
                        EditionTicker(Modifier.fillMaxSize(), big = true, always = true)
                    }
                }
            }
            // Down the right: clock and weather, markets, prayer times; the sponsor in the corner.
            Column(Modifier.width(sideWidth).fillMaxHeight().background(Panel)) {
                Column(Modifier.fillMaxWidth().height(playerHeight).padding(horizontal = d(12f))) {
                    ClockWeather(::s, ::d)
                    Markets(::s, ::d)
                    Prayers(::s, ::d)
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
    Divider()
}

@Composable
private fun Markets(s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val markets = rememberLoaded(5 * 60_000L) { News.markets().takeIf { it.isNotEmpty() } } ?: return
    Column(Modifier.fillMaxWidth().padding(vertical = d(6f))) {
        Text("MARKETS", color = Muted, fontWeight = FontWeight.Bold, fontSize = s(10f), letterSpacing = s(1.5f))
        markets.forEach { m ->
            Row(Modifier.fillMaxWidth().padding(top = d(2f)), verticalAlignment = Alignment.CenterVertically) {
                Text(m.name, color = Color.White, fontSize = s(12f), modifier = Modifier.weight(1f), maxLines = 1)
                Text(
                    if (m.name.startsWith("Gold")) "$" + "%,.0f".format(m.price) else "%,.0f".format(m.price),
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = s(12f),
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
    Divider()
}

@Composable
private fun Prayers(s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val context = LocalContext.current
    // Reloaded every few hours, so it moves on to the next day's times overnight.
    val prayers = rememberLoaded(3 * 60 * 60_000L) { News.prayers() } ?: return
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
    val next = prayers.indexOfFirst { minutes(it.time) > minute }
    Column(Modifier.fillMaxWidth().padding(vertical = d(6f))) {
        Text(
            "PRAYER TIMES" + (city?.let { " · ${it.uppercase()}" } ?: ""),
            color = Muted,
            fontWeight = FontWeight.Bold,
            fontSize = s(10f),
            letterSpacing = s(1.5f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Row(Modifier.fillMaxWidth().padding(top = d(3f)), horizontalArrangement = Arrangement.SpaceBetween) {
            prayers.forEachIndexed { i, p ->
                val m = minutes(p.time)
                val shown = if (is24) p.time else "${(m / 60 + 11) % 12 + 1}:${"%02d".format(m % 60)}"
                val color = if (i == next) FocusColor else Color.White
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(p.name, color = if (i == next) FocusColor else Muted, fontSize = s(9f))
                    Text(shown, color = color, fontWeight = FontWeight.Bold, fontSize = s(12f))
                }
            }
        }
    }
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

/** Rupees for the viewer's money, and how to use the remote here. */
@Composable
private fun InfoRow(modifier: Modifier, s: (Float) -> TextUnit, d: (Float) -> Dp) {
    val rates = rememberLoaded(60 * 60_000L) { News.rates() }
    Row(modifier.padding(horizontal = d(12f)), verticalAlignment = Alignment.CenterVertically) {
        rates?.let { r ->
            Text("1 ${r.base} = ", color = Color.White, fontSize = s(13f))
            r.pkr?.let { Text("Rs %.1f 🇵🇰".format(it), color = FocusColor, fontWeight = FontWeight.Bold, fontSize = s(13f)) }
            if (r.pkr != null && r.inr != null) Text("   ·   ", color = Muted, fontSize = s(13f))
            r.inr?.let { Text("₹%.1f 🇮🇳".format(it), color = FocusColor, fontWeight = FontWeight.Bold, fontSize = s(13f)) }
        }
        Spacer(Modifier.weight(1f))
        Text("▲▼ channel   OK full screen", color = Muted, fontSize = s(10f), maxLines = 1)
    }
}
