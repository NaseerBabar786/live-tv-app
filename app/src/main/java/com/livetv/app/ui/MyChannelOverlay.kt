package com.livetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.text.style.TextOverflow
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
        if (c.logoCorner != "off" && c.logo != null) {
            val bottom = c.logoCorner == "bl" || c.logoCorner == "br"
            AsyncImage(
                model = c.logo,
                contentDescription = c.name,
                modifier = Modifier
                    .align(corner)
                    .padding(horizontal = unit * 2.5f, vertical = unit * 2f)
                    .padding(bottom = if (bottom && c.ticker != null) tickerHeight else 0.dp)
                    // Our logos are wide (1.9.47; taller in 1.9.49 for the bigger BAZAAR); a square one still fits in the same height.
                    .height(unit * 9f)
                    .widthIn(max = unit * 26f)
                    .alpha(0.55f),
            )
        }
        // Every 10 minutes what's next, every 20 minutes today's shows (owner, 2026-10-07), on the breaks.
        val card by produceState<MyChannel.Card?>(null, c) {
            while (true) {
                value = runCatching { MyChannel.cardAt(c, System.currentTimeMillis()) }.getOrNull()
                delay(1_000)
            }
        }
        val logoLeft = c.logoCorner == "tl" || c.logoCorner == "bl"
        val today = card?.today == true
        val shows = remember(card?.untilMs, today) {
            card?.let { runCatching { if (it.today) MyChannel.todaysShows(c, System.currentTimeMillis()) else MyChannel.upNext(c, System.currentTimeMillis()) }.getOrNull() }.orEmpty()
        }
        AnimatedVisibility(
            visible = card != null && today && shows.isNotEmpty(),
            enter = fadeIn() + slideInHorizontally { if (logoLeft) it else -it },
            exit = fadeOut(),
            modifier = Modifier.align(if (logoLeft) Alignment.CenterEnd else Alignment.CenterStart).padding(horizontal = unit * 2.5f),
        ) { TodayCard(c.name, shows, unit) }
        AnimatedVisibility(
            visible = card != null && !today && shows.isNotEmpty(),
            enter = fadeIn() + slideInHorizontally { if (c.logoCorner == "bl") it else -it },
            exit = fadeOut() + slideOutHorizontally { if (c.logoCorner == "bl") it else -it },
            modifier = Modifier.align(if (c.logoCorner == "bl") Alignment.BottomEnd else Alignment.BottomStart)
                .padding(horizontal = unit * 2.5f).padding(bottom = (if (c.ticker != null) tickerHeight else 0.dp) + unit * 2.5f),
        ) { NextCard(shows, unit) }
        c.ticker?.let { line ->
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(Color(0xE6101827))
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

private val CardBack = Color(0xEB0B1220)
private val Accent = Color(0xFFFACC15)

private fun clock(ms: Long): String = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(ms))

private fun whenText(ms: Long): String {
    val mins = ((ms - System.currentTimeMillis()) / 60_000L).coerceAtLeast(0)
    return if (mins < 60) "${clock(ms)} · in ${if (mins < 1) "a moment" else "$mins min"}" else clock(ms)
}

/** "UP NEXT" and the programme after it, low on the picture beside the scrolling line. */
@Composable
private fun NextCard(shows: List<MyChannel.Upcoming>, unit: Dp) {
    Column(
        Modifier.widthIn(max = unit * 46f).background(CardBack, RoundedCornerShape(unit * 1.2f))
            .padding(horizontal = unit * 2f, vertical = unit * 1.3f),
    ) {
        Text("UP NEXT", color = Accent, fontWeight = FontWeight.Black, fontSize = (unit.value * 1.6f).sp)
        Text(shows[0].title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = (unit.value * 2.6f).sp,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(whenText(shows[0].at), color = Color(0xFFCBD5E1), fontSize = (unit.value * 1.7f).sp)
        shows.getOrNull(1)?.let {
            Text("Later: ${clock(it.at)}  ${it.title}", color = Color(0xFF94A3B8), fontSize = (unit.value * 1.5f).sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = unit * 0.5f))
        }
    }
}

/** "TODAY ON BAZAAR TV": the rest of today's booked shows, the next one marked. */
@Composable
private fun TodayCard(name: String, shows: List<MyChannel.Upcoming>, unit: Dp) {
    val now = System.currentTimeMillis()
    val nextAt = shows.firstOrNull { it.at > now }?.at
    Column(
        Modifier.width(unit * 40f).background(CardBack, RoundedCornerShape(unit * 1.2f))
            .padding(horizontal = unit * 2f, vertical = unit * 1.6f),
    ) {
        Text("TODAY ON ${name.uppercase()}", color = Accent, fontWeight = FontWeight.Black, fontSize = (unit.value * 1.7f).sp,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(bottom = unit * 0.8f))
        for (s in shows) {
            val on = s.at <= now
            val next = s.at == nextAt
            Row(Modifier.padding(vertical = unit * 0.35f)) {
                Text(if (on) "NOW" else clock(s.at), color = if (next) Accent else if (on) Color(0xFF4ADE80) else Color(0xFFCBD5E1),
                    fontWeight = FontWeight.Bold, fontSize = (unit.value * 1.6f).sp, modifier = Modifier.width(unit * 9f))
                Column {
                    Text(s.title, color = Color.White,
                        fontWeight = if (next) FontWeight.Bold else FontWeight.Normal, fontSize = (unit.value * 1.6f).sp,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (s.more > 0) Text("+${s.more} more today", color = Color(0xFF94A3B8), fontSize = (unit.value * 1.3f).sp, maxLines = 1)
                }
            }
        }
    }
}
