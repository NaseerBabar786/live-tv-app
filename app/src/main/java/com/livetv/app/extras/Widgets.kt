package com.livetv.app.extras

import android.text.format.DateFormat
import com.livetv.app.ui.Themes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.data.Channel
import com.livetv.app.data.Guide
import com.livetv.app.data.MyChannel
import com.livetv.app.ui.ChipShape
import com.livetv.app.ui.focusGlow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Floating widgets over a channel in full screen (owner, 2026-10-09): the ones the viewer turned on, stacked in
 * the corner they picked. Each one hides itself while it has nothing to show (no live match, no prayer times yet).
 */
@Composable
fun WidgetStack(channel: Channel, modifier: Modifier = Modifier) {
    val on by Extras.widgets.collectAsStateWithLifecycle()
    if (on.isEmpty()) return
    Column(modifier.widthIn(max = 300.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Extras.Widget.entries.filter { it in on }.forEach { w ->
            when (w) {
                Extras.Widget.Clock -> ClockWidget()
                Extras.Widget.Azan -> AzanWidget()
                Extras.Widget.Cricket -> CricketWidget()
                Extras.Widget.UpNext -> UpNextWidget(channel)
            }
        }
    }
}

@Composable
private fun Card(content: @Composable () -> Unit) {
    Column(
        Modifier
            .background(Color.Black.copy(alpha = 0.55f), ChipShape)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) { content() }
}

@Composable
private fun Line(text: String, bold: Boolean = false, size: Int = 14, color: Color = Color.White) {
    Text(
        text,
        color = color,
        fontSize = size.sp,
        lineHeight = (size + 3).sp,
        fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
private fun ClockWidget() {
    val context = LocalContext.current
    val weather = rememberWeatherNow()
    var now by remember { mutableStateOf(Date()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = Date()
            delay(60_000 - System.currentTimeMillis() % 60_000)
        }
    }
    val time = remember(now) { SimpleDateFormat(if (DateFormat.is24HourFormat(context)) "H:mm" else "h:mm a", Locale.getDefault()).format(now) }
    val date = remember(now) {
        val locale = Locale.getDefault()
        SimpleDateFormat(DateFormat.getBestDateTimePattern(locale, "EEEMMMd"), locale).format(now)
    }
    Card {
        Line(time, bold = true, size = 22)
        Line(listOfNotNull(date, weather?.toString()).joinToString("   "), size = 13)
    }
}

@Composable
private fun AzanWidget() {
    val prayers = rememberPrayers()
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(60_000 - now % 60_000)
        }
    }
    val text = nextAzanText(prayers, now) ?: return
    Card { Line("🕌 $text", bold = true, color = Themes.current.secondary) }
}

@Composable
private fun UpNextWidget(channel: Channel) {
    val configs by MyChannel.configs.collectAsStateWithLifecycle()
    val guide by produceState(emptyMap<String, List<Guide.Programme>>()) { value = Guide.load() }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000)
            now = System.currentTimeMillis()
        }
    }
    val next = remember(channel.url, configs, guide, now / 60_000) { GuideData.programmes(channel, guide, now, now + 6 * 3600_000L) }
        .firstOrNull { it.start > now } ?: return
    val at = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(next.start))
    Card {
        Line("Up next · $at", size = 12, color = Color.White.copy(alpha = 0.75f))
        Line(next.title, bold = true)
    }
}

// ---- Cricket ----

/** A live match: the two sides with their scores, and the line under it ("Pakistan need 45 runs"). */
data class CricketScore(val title: String, val score: String, val status: String)

@Composable
private fun CricketWidget() {
    val score by produceState<CricketScore?>(null) {
        while (true) {
            value = withContext(Dispatchers.IO) { Cricket.live() }
            delay(if (value == null) 5 * 60_000L else 60_000L)
        }
    }
    val s = score ?: return
    Card {
        Line("🏏 ${s.title}", size = 12, color = Color.White.copy(alpha = 0.75f))
        Line(s.score, bold = true)
        if (s.status.isNotBlank()) Line(s.status, size = 12, color = Themes.current.secondary)
    }
}

/**
 * Live cricket from ESPNcricinfo's public match list (no key; unofficial, so when it can't be read the widget
 * simply stays hidden). Matches with Pakistan or India come first, then any other international match.
 */
object Cricket {
    private const val URL_CURRENT = "https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true"
    private val FAVOURITES = listOf("PAK", "IND")

    fun live(): CricketScore? = runCatching { parse(get(URL_CURRENT)) }.getOrNull()

    fun parse(json: String): CricketScore? {
        val matches = JSONObject(json).optJSONArray("matches") ?: return null
        val live = (0 until matches.length()).mapNotNull { matches.optJSONObject(it) }
            .filter { it.optString("stage").equals("RUNNING", true) || it.optString("state").equals("LIVE", true) }
        fun abbrs(m: JSONObject): List<String> {
            val teams = m.optJSONArray("teams") ?: return emptyList()
            return (0 until teams.length()).mapNotNull { teams.optJSONObject(it)?.optJSONObject("team")?.optString("abbreviation") }
        }
        val pick = live.firstOrNull { m -> abbrs(m).any { it in FAVOURITES } }
            ?: live.firstOrNull { it.has("internationalClassId") && !it.isNull("internationalClassId") }
            ?: live.firstOrNull()
            ?: return null
        val teams = pick.optJSONArray("teams") ?: return null
        val sides = (0 until teams.length()).mapNotNull { i ->
            val t = teams.optJSONObject(i) ?: return@mapNotNull null
            val name = t.optJSONObject("team")?.let { it.optString("abbreviation").ifBlank { it.optString("name") } }.orEmpty()
            val runs = t.optString("score").takeIf { it.isNotBlank() && it != "null" }
            val overs = t.optString("scoreInfo").takeIf { it.isNotBlank() && it != "null" }
            if (name.isBlank()) null else listOfNotNull(name, runs, overs?.let { "($it)" }).joinToString(" ")
        }
        if (sides.isEmpty()) return null
        val title = pick.optJSONObject("series")?.optString("name")?.takeIf { it.isNotBlank() } ?: pick.optString("title")
        return CricketScore(title.orEmpty(), sides.joinToString("  v  "), pick.optString("statusText").takeIf { it != "null" }.orEmpty())
    }

    private fun get(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 12; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")
        conn.setRequestProperty("Accept", "application/json")
        try {
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }
}

// ---- Picking widgets ----

/** Settings > Widgets, and the Widgets button on the full-screen channel bar: tick widgets, pick the corner. */
@Composable
fun WidgetsDialog(onDismiss: () -> Unit) {
    val on by Extras.widgets.collectAsStateWithLifecycle()
    val corner by Extras.corner.collectAsStateWithLifecycle()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Widgets on full screen") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "Small boxes over the channel while you watch full screen. Tick the ones you want.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary,
                )
                Extras.Widget.entries.forEach { w ->
                    Row(
                        Modifier.fillMaxWidth().focusGlow(ChipShape).clickable { Extras.setWidget(w, w !in on) }.padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(checked = w in on, onCheckedChange = null)
                        Column(Modifier.padding(start = 8.dp)) {
                            Text(w.label)
                            Text(w.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                        }
                    }
                }
                HorizontalDivider()
                Text("Where", fontWeight = FontWeight.Bold)
                Extras.Corner.entries.forEach { c ->
                    Row(
                        Modifier.fillMaxWidth().focusGlow(ChipShape).clickable { Extras.setCorner(c) }.padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = c == corner, onClick = null)
                        Text(c.label, modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Done") } },
    )
}
