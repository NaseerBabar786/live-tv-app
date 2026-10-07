package com.livetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.remember
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
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
            val left = c.logoCorner == "tl" || c.logoCorner == "bl"
            val logoHeight = unit * 9f
            // The time sits with the logo (owner, 2026-10-07): under it in a top corner, above it in a
            // bottom one, lined up with its outer edge, so it moves wherever the logo has to go.
            val clock: @Composable () -> Unit = { ChannelClock(unit) }
            Column(
                Modifier
                    .align(corner)
                    .padding(horizontal = unit * 2.5f, vertical = unit * 2f)
                    .padding(bottom = if (bottom && c.ticker != null) tickerHeight else 0.dp),
                horizontalAlignment = if (left) Alignment.Start else Alignment.End,
            ) {
                if (bottom) {
                    clock()
                    Spacer(Modifier.height(unit * 0.4f))
                }
                AsyncImage(
                    model = c.logo,
                    contentDescription = c.name,
                    modifier = Modifier
                        // Our logos are wide (1.9.47; taller in 1.9.49 for the bigger BAZAAR); a square one still fits in the same height.
                        .height(logoHeight)
                        .widthIn(max = unit * 26f)
                        .alpha(0.55f),
                )
                if (!bottom) {
                    // The lowest fifth of our logo pictures is empty (76 of 393 rows), so the time tucks up into it.
                    Box(Modifier.offset(y = -logoHeight * (76f / 393f) + unit * 0.4f)) { clock() }
                }
            }
        }
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

/** The viewer's own time, like "8:07 PM", small on a see-through dark pill; sized from the picture like the logo. */
@Composable
private fun ChannelClock(unit: Dp) {
    val format = remember { SimpleDateFormat("h:mm a", Locale.US) }
    val time by produceState(format.format(Date())) {
        while (true) {
            value = format.format(Date())
            delay(60_000L - System.currentTimeMillis() % 60_000L + 50)
        }
    }
    Text(
        time,
        color = Color.White.copy(alpha = 0.92f),
        fontWeight = FontWeight.Bold,
        fontSize = (unit.value * 1.45f).sp,
        maxLines = 1,
        softWrap = false,
        style = TextStyle(shadow = Shadow(Color.Black.copy(alpha = 0.65f), Offset(1f, 1f), 3f)),
        modifier = Modifier
            .background(Color(0x6E000000), RoundedCornerShape(unit * 0.35f))
            .padding(horizontal = unit * 0.45f, vertical = unit * 0.15f),
    )
}
