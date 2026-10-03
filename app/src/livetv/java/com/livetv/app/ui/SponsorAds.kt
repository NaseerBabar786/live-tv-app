package com.livetv.app.ui

import android.os.SystemClock
import androidx.compose.foundation.Image
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
private const val CARD_EVERY_MS = 20 * 60_000L
private const val CARD_NOT_BEFORE_MS = 5 * 60_000L

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
    // The "Sponsor" tag sits above the picture, so it never covers the sponsor's logo.
    Column(modifier.fillMaxWidth()) {
        SponsorLabel(Modifier.padding(bottom = 4.dp))
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
            Row(verticalAlignment = Alignment.CenterVertically) {
                SponsorLabel(Modifier.padding(end = 8.dp))
                Text(
                    sponsor.name,
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            val words = listOf(sponsor.line, sponsor.contact).filter { it.isNotBlank() }.joinToString(" · ")
            if (words.isNotEmpty()) {
                Text(words, color = FocusColor, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/**
 * A small sponsor card in the bottom right corner for a few seconds after the channel changes,
 * at most once every 20 minutes. It never takes the focus or covers the middle of the picture.
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
            // "Sponsor" goes in the line under the picture, not over it.
            val words = (listOf("Sponsor") + listOf(sponsor.name, sponsor.contact).filter { it.isNotBlank() }).joinToString(" · ")
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

@Composable
private fun SponsorPicture(sponsor: Sponsor, modifier: Modifier) {
    val picture = sponsor.picture ?: return
    Image(picture, contentDescription = sponsor.name, contentScale = ContentScale.Fit, modifier = modifier)
}

/** Says it's an ad. */
@Composable
private fun SponsorLabel(modifier: Modifier) {
    Text("Sponsor", color = Color.White.copy(alpha = 0.7f), fontSize = 11.sp, modifier = modifier)
}
