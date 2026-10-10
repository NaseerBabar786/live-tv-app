package com.livetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import android.graphics.Bitmap
import android.os.Build
import coil3.toBitmap
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import kotlinx.coroutines.delay
import com.livetv.app.BuildConfig
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.livetv.app.data.Channel
import com.livetv.app.data.MyChannel

/**
 * The locked page for the run of YouTube videos [channel] has on now (Bazaar TV's upcoming trailers),
 * or null while our own player plays; checked every second, so the screen switches when the run starts and ends.
 */
@Composable
fun rememberBlockPage(channel: Channel?): String? {
    val configs by MyChannel.configs.collectAsStateWithLifecycle()
    val page by produceState(MyChannel.blockPage(channel, BuildConfig.VERSION_CODE), channel?.url, configs) {
        while (true) {
            value = MyChannel.blockPage(channel, BuildConfig.VERSION_CODE)
            delay(1_000)
        }
    }
    return page
}

/**
 * One of the owner's channels' logo in a corner of the picture and its scrolling line along the
 * bottom, as set on tv.bulkbazaar.ca/studio. Draws nothing for other channels.
 */
@Composable
fun MyChannelOverlay(channel: Channel?, modifier: Modifier = Modifier) {
    val configs by MyChannel.configs.collectAsStateWithLifecycle()
    val c = channel?.takeIf(MyChannel::isMine)?.let { configs[it.url.removePrefix("mychannel://")] } ?: return
    // Inside 1+List and the other channel screens the app's own "advertise with us" line runs along the
    // bottom, so the channel's line stays off there: one line, never two (the owner, 2026-10-08).
    val band = LocalTickerBand.current
    // Its line carries the "advertise with us" words, so it stays off while the news is on (owner, 2026-10-08).
    val newsOn by produceState(false, channel?.url) {
        while (true) {
            value = MyChannel.newsOn(channel?.url)
            delay(1_000)
        }
    }
    val clipLogo by produceState(false, channel?.url) {
        while (true) {
            value = MyChannel.clipHasLogo(channel?.url)
            delay(1_000)
        }
    }
    val ownLine = c.ticker?.takeIf { band == 0.dp && !newsOn }
    BoxWithConstraints(modifier.fillMaxSize()) {
        // Sized from the picture, so it looks the same in full screen and in a smaller player.
        val unit = maxWidth / 100
        val corner = when (c.logoCorner) {
            "tl" -> Alignment.TopStart
            "bl" -> Alignment.BottomStart
            "br" -> Alignment.BottomEnd
            else -> Alignment.TopEnd
        }
        val tickerHeight = unit * 4f
        // Channel 1's own slides and clips carry the Spark logo and their headings sit in the top corners, so
        // its corner logo and time stay off: one logo, nothing on top of writing (owner, 2026-10-10), whatever Studio says.
        if (c.logoCorner != "off" && c.logo != null && channel?.url != MyChannel.URL && !clipLogo) {
            val bottom = c.logoCorner == "bl" || c.logoCorner == "br"
            val left = c.logoCorner == "tl" || c.logoCorner == "bl"
            // 25% smaller than before (owner, 2026-10-07): 9 -> 6.75 of the width; the clock and gap follow. Solid, not see-through (owner, 2026-10-10).
            val logoHeight = unit * 6.75f
            // The time sits with the logo (owner, 2026-10-07): under it in a top corner, above it in a
            // bottom one, lined up with its outer edge, so it moves wherever the logo has to go.
            // Where the logo picture really has ink (top, bottom as parts of its height): the clock goes
            // a small gap off that, never on it (owner, 2026-10-07), whatever empty margin a logo has.
            val logoUrl: String = c.logo
            var ink by remember(logoUrl) { mutableStateOf(logoInk[logoUrl] ?: (0f to 1f)) }
            val gap = logoHeight * 0.3f / 9f
            Column(
                Modifier
                    .align(corner)
                    .padding(horizontal = unit * 2.5f, vertical = unit * 2f)
                    .padding(bottom = if (bottom && ownLine != null) tickerHeight else 0.dp),
                horizontalAlignment = if (left) Alignment.Start else Alignment.End,
            ) {
                if (bottom) Box(Modifier.offset(y = logoHeight * ink.first - gap)) { ChannelClock(logoHeight) }
                AsyncImage(
                    model = logoUrl,
                    contentDescription = c.name,
                    onSuccess = { state ->
                        (logoInk[logoUrl] ?: inkOf(state.result.image)?.also { logoInk[logoUrl] = it })?.let { ink = it }
                    },
                    modifier = Modifier
                        // Our logos are wide (1.9.47; taller in 1.9.49 for the bigger BAZAAR); a square one still fits in the same height.
                        .height(logoHeight)
                        .widthIn(max = unit * 19.5f)
                        .alpha(1f),
                )
                if (!bottom) Box(Modifier.offset(y = -logoHeight * (1f - ink.second) + gap)) { ChannelClock(logoHeight) }
            }
        }
        // Every 10 minutes what's next, every 20 minutes today's shows (owner, 2026-10-07), on the breaks.
        val card by produceState<MyChannel.Card?>(null, c) {
            while (true) {
                value = runCatching { MyChannel.cardAt(c, System.currentTimeMillis()) }.getOrNull()
                delay(1_000)
            }
        }
        val logoLeft = c.logoCorner == "tl" || c.logoCorner == "bl"
        // Channel 1's writing is in Urdu and English together (owner, 2026-10-09), the cards' headings too;
        // the same for Spark TV One, channel 1 of the Google Play app Spark One (owner, 2026-10-10).
        val both = c.id == "main" || c.id == "pone"
        val today = card?.today == true
        val shows = remember(card?.untilMs, today) {
            card?.let { runCatching { if (it.today) MyChannel.todaysShows(c, System.currentTimeMillis()) else MyChannel.upNext(c, System.currentTimeMillis()) }.getOrNull() }.orEmpty()
        }
        // A card keeps its last programmes while it fades out: the list is empty by then (1.9.71 closed the app on it).
        val last = remember(c) { arrayOf(emptyList<MyChannel.Upcoming>()) }
        if (shows.isNotEmpty()) last[0] = shows
        val shown = last[0]
        AnimatedVisibility(
            visible = card != null && today && shows.isNotEmpty(),
            enter = fadeIn() + slideInHorizontally { if (logoLeft) it else -it },
            exit = fadeOut(),
            modifier = Modifier.align(if (logoLeft) Alignment.CenterEnd else Alignment.CenterStart).padding(horizontal = unit * 2.5f),
        ) { TodayCard(c.name, shown, unit, both) }
        AnimatedVisibility(
            visible = card != null && !today && shows.isNotEmpty(),
            enter = fadeIn() + slideInHorizontally { if (c.logoCorner == "bl") it else -it },
            exit = fadeOut() + slideOutHorizontally { if (c.logoCorner == "bl") it else -it },
            modifier = Modifier.align(if (c.logoCorner == "bl") Alignment.BottomEnd else Alignment.BottomStart)
                .padding(horizontal = unit * 2.5f).padding(bottom = (if (ownLine != null) tickerHeight else 0.dp) + unit * 2.5f),
        ) { NextCard(shown, unit, both) }
        ownLine?.let { line ->
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(Themes.current.panel.copy(alpha = 0.9f))
                    .padding(vertical = unit * 0.6f),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(
                    line,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = (unit.value * 1.9f).sp,
                    maxLines = 1,
                    softWrap = false,
                    modifier = Modifier.fillMaxWidth().basicMarquee(
                        iterations = Int.MAX_VALUE,
                        initialDelayMillis = 0,
                        velocity = unit * 7f,
                    ),
                )
            }
        }
    }
}

private val CardBack: Color get() = Themes.current.panel.copy(alpha = 0.92f)
private val Accent: Color get() = Themes.current.secondary

private fun clock(ms: Long): String = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(ms))

private fun whenText(ms: Long, both: Boolean = false): String {
    val mins = ((ms - System.currentTimeMillis()) / 60_000L).coerceAtLeast(0)
    if (mins >= 60) return clock(ms)
    val en = "in ${if (mins < 1) "a moment" else "$mins min"}"
    return if (both) "${clock(ms)} · $en · ${if (mins < 1) "ابھی" else "$mins منٹ میں"}" else "${clock(ms)} · $en"
}

/** "UP NEXT" and the programme after it, low on the picture beside the scrolling line. */
@Composable
private fun NextCard(shows: List<MyChannel.Upcoming>, unit: Dp, both: Boolean = false) {
    val first = shows.firstOrNull() ?: return
    Column(
        Modifier.widthIn(max = unit * 46f).background(CardBack, RoundedCornerShape(unit * 1.2f))
            .padding(horizontal = unit * 2f, vertical = unit * 1.3f),
    ) {
        Text(if (both) "UP NEXT  ·  اگلا پروگرام" else "UP NEXT", color = Accent, fontWeight = FontWeight.Black, fontSize = (unit.value * 1.6f).sp)
        // Titles in Urdu and English are long: two lines, so neither language is cut off.
        Text(first.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = (unit.value * 2.6f).sp,
            maxLines = if (both) 2 else 1, overflow = TextOverflow.Ellipsis)
        Text(whenText(first.at, both), color = Themes.current.soft, fontSize = (unit.value * 1.7f).sp)
        shows.getOrNull(1)?.let {
            Text("${if (both) "Later · بعد میں" else "Later"}: ${clock(it.at)}  ${it.title}", color = Themes.current.muted, fontSize = (unit.value * 1.5f).sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = unit * 0.5f))
        }
    }
}

/** "TODAY ON BAZAAR TV": the rest of today's booked shows, the next one marked. */
@Composable
private fun TodayCard(name: String, shows: List<MyChannel.Upcoming>, unit: Dp, both: Boolean = false) {
    val now = System.currentTimeMillis()
    val nextAt = shows.firstOrNull { it.at > now }?.at
    Column(
        Modifier.width(unit * 40f).background(CardBack, RoundedCornerShape(unit * 1.2f))
            .padding(horizontal = unit * 2f, vertical = unit * 1.6f),
    ) {
        Text("TODAY ON ${name.uppercase()}" + if (both) "  ·  آج کے پروگرام" else "", color = Accent, fontWeight = FontWeight.Black, fontSize = (unit.value * 1.7f).sp,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(bottom = unit * 0.8f))
        for (s in shows) {
            val on = s.at <= now
            val next = s.at == nextAt
            Row(Modifier.padding(vertical = unit * 0.35f)) {
                Text(if (on) (if (both) "NOW · ابھی" else "NOW") else clock(s.at), color = if (next) Accent else if (on) Color(0xFF4ADE80) else Themes.current.soft,
                    fontWeight = FontWeight.Bold, fontSize = (unit.value * 1.6f).sp, modifier = Modifier.width(unit * 9f))
                Column {
                    Text(s.title, color = Color.White,
                        fontWeight = if (next) FontWeight.Bold else FontWeight.Normal, fontSize = (unit.value * 1.6f).sp,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (s.more > 0) Text("+${s.more} more today" + if (both) " · آج مزید ${s.more}" else "", color = Themes.current.muted, fontSize = (unit.value * 1.3f).sp, maxLines = 1)
                }
            }
        }
    }
}

/** The viewer's own time, like "8:07 PM", small on a see-through dark pill; sized from the picture like the logo. */
@Composable
private fun ChannelClock(logoHeight: Dp) {
    val format = remember { SimpleDateFormat("h:mm a", Locale.US) }
    val time by produceState(format.format(Date())) {
        while (true) {
            value = format.format(Date())
            delay(60_000L - System.currentTimeMillis() % 60_000L + 50)
        }
    }
    // Solid like the logo (owner, 2026-10-10: no see-through watermark); a faint shadow keeps it readable on white.
    Text(
        time,
        color = Color.White,
        fontWeight = FontWeight.Bold,
        fontSize = (logoHeight.value * 1.45f / 9f).sp,
        maxLines = 1,
        softWrap = false,
        style = TextStyle(shadow = Shadow(Color.Black.copy(alpha = 0.5f), Offset(1f, 1f), 3f)),
        modifier = Modifier.alpha(1f),
    )
}

/** Each logo's inked rows, by URL, so it is measured once. */
private val logoInk = java.util.concurrent.ConcurrentHashMap<String, Pair<Float, Float>>()

/** The first and last rows with something drawn, as parts of the picture's height; null if it can't be read. */
private fun inkOf(image: coil3.Image): Pair<Float, Float>? = runCatching {
    var bmp = image.toBitmap()
    if (Build.VERSION.SDK_INT >= 26 && bmp.config == Bitmap.Config.HARDWARE) bmp = bmp.copy(Bitmap.Config.ARGB_8888, false)
    val w = bmp.width
    val h = bmp.height
    val px = IntArray(w * h)
    bmp.getPixels(px, 0, w, 0, 0, w, h)
    fun solid(y: Int) = (0 until w).any { (px[y * w + it] ushr 24) > 40 }
    val top = (0 until h).firstOrNull { solid(it) } ?: return null
    val last = (h - 1 downTo 0).first { solid(it) }
    top.toFloat() / h to (last + 1).toFloat() / h
}.getOrNull()
