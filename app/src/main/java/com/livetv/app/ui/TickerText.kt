package com.livetv.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em

/**
 * Every ticker (owner, 2026-10-11): "Test transmission" shows behind the moving words, and the
 * "advertise with us" words (the WhatsApp number, tv.bulkbazaar.ca/advertise) are left out; the rest of
 * the line keeps running. The website's channel pages do the same (docs/channel/ticker.js).
 */
object TickerText {
    const val TEST = "TEST TRANSMISSION  ·  ٹیسٹ ٹرانسمیشن"
    private val AD = Regex("advertis|اشتہار|602\\s*6500|/advertise", RegexOption.IGNORE_CASE)
    private val BARE_SITE = Regex("(tv\\.)?bulkbazaar\\.ca/?", RegexOption.IGNORE_CASE)

    /** [line] without its advertise parts, or null when nothing else is left. */
    fun clean(line: String?): String? {
        val out = mutableListOf<String>()
        var dropped = false
        for (part in line.orEmpty().split('·').map { it.trim() }) {
            if (part.isEmpty()) continue
            // A bare web address right after the advertise words was part of them.
            if (AD.containsMatchIn(part) || (dropped && BARE_SITE.matches(part))) { dropped = true; continue }
            dropped = false
            out += part
        }
        return out.joinToString("  ·  ").takeIf { it.isNotEmpty() }
    }
}

/** "Test transmission", faint and still, in the middle of a ticker's band, behind its moving words. */
@Composable
fun TestTransmissionBehind(fontSize: TextUnit, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            TickerText.TEST,
            color = Color.White.copy(alpha = 0.22f),
            fontWeight = FontWeight.Black,
            fontSize = fontSize,
            letterSpacing = 0.3.em,
            maxLines = 1,
            softWrap = false,
        )
    }
}
