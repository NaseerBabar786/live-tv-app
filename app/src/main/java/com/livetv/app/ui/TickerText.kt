package com.livetv.app.ui

import androidx.compose.foundation.layout.Box
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
 * "advertise with us" words (the WhatsApp number, tv.bulkbazaar.ca/advertise) and the word "Spark" are left out; the rest of
 * the line keeps running, with "NextGen Cable, free for everyone" and our apps at the end. The website's channel pages do the same (docs/channel/ticker.js).
 */
object TickerText {
    const val TEST = "TEST TRANSMISSION  ·  ٹیسٹ ٹرانسمیشن"
    private val AD = Regex("advertis|اشتہار|602\\s*6500|/advertise", RegexOption.IGNORE_CASE)
    private val SPARK_TV = Regex("\\bSpark TV,\\s*", RegexOption.IGNORE_CASE)
    private val SPARK = Regex("\\bSpark\\b\\s*|اسپارک\\s*", RegexOption.IGNORE_CASE)
    private val SPACES = Regex("\\s{2,}")
    private val EXTRA = listOf("Download our app on TV", "Lots more free apps at apps.bulkbazaar.ca")
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
            // No "Spark" word in the tickers either (owner, 2026-10-11): "Spark Hits" reads "Hits".
            val words = part.replace(SPARK_TV, "").replace(SPARK, "").replace(SPACES, " ").trim()
            if (words.isNotEmpty() && words != "TV") out += words
        }
        return out.joinToString("  ·  ").takeIf { it.isNotEmpty() }
    }

    /** [line] as it runs on screen: [clean], then NextGen Cable free for everyone and our apps at the end. */
    fun shown(line: String?): String? {
        val out = clean(line)?.split("  ·  ")?.toMutableList() ?: return null
        // NextGen Cable is free for everyone, and our apps follow at the end (owner, 2026-10-11).
        val cable = out.indexOfFirst { it.contains("NextGen Cable", ignoreCase = true) }
        if (cable < 0) out += "NextGen Cable, free for everyone"
        else if (!out[cable].contains("free for everyone", ignoreCase = true)) out[cable] += ", free for everyone"
        EXTRA.forEach { if (it !in out) out += it }
        return out.joinToString("  ·  ")
    }
}

/** "Test transmission", faint and still, in the middle of a ticker's band, behind its moving words. */
@Composable
fun TestTransmissionBehind(fontSize: TextUnit, modifier: Modifier = Modifier) {
    Box(modifier, contentAlignment = Alignment.Center) {
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
