package com.livetv.app.extras

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.data.Channel
import com.livetv.app.data.Guide
import com.livetv.app.data.MyChannel
import com.livetv.app.ui.AccentBlue
import com.livetv.app.ui.ChipShape
import com.livetv.app.ui.FocusColor
import com.livetv.app.ui.focusGlow
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val HALF_HOUR = 30 * 60_000L

/** Half-hours shown across the screen at once (3 hours). */
private const val SLOTS = 6

/**
 * The TV guide (owner, 2026-10-09; Gold): channels down the side, 3 hours across the top, from now to a day
 * ahead (Earlier / Later). Our Spark channels' schedules and every channel with free listings; the others say
 * "Live". OK on what's on now opens the channel; OK on a later show sets a reminder (🔔), OK again takes it off.
 */
@Composable
fun GuideScreen(channels: List<Channel>, onPlay: (Channel) -> Unit, onClose: () -> Unit) {
    BackHandler(onBack = onClose)
    val context = LocalContext.current
    val epg by produceState(emptyMap<String, List<Guide.Programme>>()) { value = Guide.load() }
    val configs by MyChannel.configs.collectAsStateWithLifecycle()
    val reminders by Reminders.all.collectAsStateWithLifecycle()
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000)
            now = System.currentTimeMillis()
        }
    }
    // Hours later than the current half-hour (0 to 21).
    var later by remember { mutableIntStateOf(0) }
    val windowStart = now - Math.floorMod(now, HALF_HOUR) + later * 3600_000L
    val windowEnd = windowStart + SLOTS * HALF_HOUR
    // Channels with listings first (ours lead the list already), then the rest, each in list order.
    val rows = remember(channels, epg, configs, windowStart / HALF_HOUR) {
        channels.map { it to GuideData.programmes(it, epg, windowStart, windowEnd) }
            .sortedBy { (c, p) -> if (MyChannel.isMine(c)) 0 else if (p.isNotEmpty()) 1 else 2 }
    }
    var focused by remember { mutableStateOf<Pair<Channel, GuideData.Prog?>?>(null) }
    val firstCell = remember { FocusRequester() }
    LaunchedEffect(rows.isNotEmpty()) { if (rows.isNotEmpty()) runCatching { delay(150); firstCell.requestFocus() } }
    val timeFormat = remember { SimpleDateFormat("h:mm a", Locale.getDefault()) }

    // Outside a Surface the text would be black on the dark guide (seen on the emulator).
    CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onBackground) {
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(horizontal = 24.dp, vertical = 16.dp)) {
        // Top: what the cursor is on, and the Earlier / Later buttons.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("📺 TV Guide", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                val f = focused
                val p = f?.second
                Text(
                    when {
                        f == null -> "OK on what's on now to watch. OK on a later show for a reminder."
                        p == null -> "${f.first.number}  ${f.first.name}: live. OK to watch."
                        p.start <= now && p.end > now -> "${p.title}  ·  now until ${timeFormat.format(Date(p.end))}  ·  OK to watch"
                        p.start > now -> "${p.title}  ·  ${timeFormat.format(Date(p.start))}  ·  " +
                            if (Reminders.has("${f.first.url}|${p.start}")) "🔔 Reminder set. OK to take it off" else "OK: remind me"
                        else -> p.title
                    },
                    color = MaterialTheme.colorScheme.secondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            TextButton(onClick = { if (later > 0) later-- }, enabled = later > 0, modifier = Modifier.focusGlow()) { Text("◀ Earlier") }
            TextButton(onClick = { if (later < 21) later++ }, modifier = Modifier.focusGlow()) { Text("Later ▶") }
        }
        Spacer(Modifier.height(8.dp))
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val nameW = 210.dp
            val half: Dp = (maxWidth - nameW) / SLOTS
            Column {
                // Times along the top.
                Row(Modifier.height(28.dp)) {
                    Spacer(Modifier.width(nameW))
                    for (i in 0 until SLOTS) {
                        Text(
                            timeFormat.format(Date(windowStart + i * HALF_HOUR)),
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.width(half).padding(start = 6.dp),
                        )
                    }
                }
                LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(rows, key = { it.first.id }) { (channel, progs) ->
                        val isFirst = rows.firstOrNull()?.first?.id == channel.id
                        Row(Modifier.height(52.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                if (channel.number > 0) "${channel.number}  ${MyChannel.brand(channel.name)}" else channel.name,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.width(nameW).padding(end = 8.dp),
                            )
                            if (progs.isEmpty()) {
                                Cell(
                                    title = "Live",
                                    width = half * SLOTS,
                                    live = true,
                                    bell = false,
                                    modifier = if (isFirst) Modifier.focusRequester(firstCell) else Modifier,
                                    onFocus = { focused = channel to null },
                                    onClick = { onPlay(channel) },
                                )
                            } else {
                                var t = windowStart
                                progs.forEachIndexed { i, p ->
                                    val from = maxOf(p.start, windowStart)
                                    val to = minOf(p.end, windowEnd)
                                    if (from > t) Spacer(Modifier.width(half * ((from - t).toFloat() / HALF_HOUR)))
                                    if (to > from) {
                                        val id = "${channel.url}|${p.start}"
                                        Cell(
                                            title = p.title,
                                            width = half * ((to - from).toFloat() / HALF_HOUR),
                                            live = p.start <= now && p.end > now,
                                            bell = reminders.any { it.id == id },
                                            modifier = if (isFirst && i == 0) Modifier.focusRequester(firstCell) else Modifier,
                                            onFocus = { focused = channel to p },
                                            onClick = {
                                                when {
                                                    p.start <= now && p.end > now -> onPlay(channel)
                                                    p.start > now -> {
                                                        val on = Reminders.toggle(
                                                            Reminders.Reminder(channel.url, MyChannel.brand(channel.name), channel.number, p.title, p.start, p.end),
                                                        )
                                                        Toast.makeText(
                                                            context,
                                                            if (on) "🔔 We'll remind you at ${timeFormat.format(Date(p.start - Reminders.AHEAD_MS))}" else "Reminder taken off",
                                                            Toast.LENGTH_SHORT,
                                                        ).show()
                                                    }
                                                }
                                            },
                                        )
                                        t = to
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    }
}

@Composable
private fun Cell(
    title: String,
    width: Dp,
    live: Boolean,
    bell: Boolean,
    modifier: Modifier,
    onFocus: () -> Unit,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .width(width)
            .fillMaxHeight()
            .padding(horizontal = 2.dp)
            .onFocusChanged { if (it.isFocused) onFocus() }
            .focusGlow(ChipShape)
            .background(if (live) AccentBlue.copy(alpha = 0.55f) else MaterialTheme.colorScheme.surface, ChipShape)
            .then(if (bell) Modifier.border(1.dp, FocusColor, ChipShape) else Modifier)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(
            (if (bell) "🔔 " else "") + title,
            fontSize = 13.sp,
            color = if (live) Color.White else MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
