package com.livetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
