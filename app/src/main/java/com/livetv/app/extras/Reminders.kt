package com.livetv.app.extras

import android.content.Context
import android.content.SharedPreferences
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.ui.CardShape
import com.livetv.app.ui.FocusColor
import com.livetv.app.ui.focusGlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

/**
 * "Remind me" (owner, 2026-10-09): a show picked in the TV guide pops up a minute before it starts, with Watch
 * and Dismiss. Saved on the TV, so reminders stay after a restart; they work while NextGen Cable is open.
 */
object Reminders {
    data class Reminder(
        val url: String,
        val channel: String,
        val number: Int,
        val title: String,
        val start: Long,
        val end: Long,
    ) {
        val id: String get() = "$url|$start"
    }

    /** How long before the start the pop-up comes. */
    const val AHEAD_MS = 60_000L

    private var prefs: SharedPreferences? = null
    private val _all = MutableStateFlow<List<Reminder>>(emptyList())
    val all: StateFlow<List<Reminder>> = _all.asStateFlow()

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences("reminders", Context.MODE_PRIVATE)
        prefs = p
        _all.value = runCatching {
            val a = JSONArray(p.getString(K_LIST, "[]"))
            (0 until a.length()).map { i ->
                val o = a.getJSONObject(i)
                Reminder(o.getString("url"), o.optString("channel"), o.optInt("number"), o.optString("title"), o.getLong("start"), o.optLong("end"))
            }
        }.getOrDefault(emptyList()).filter { it.end > System.currentTimeMillis() || it.start > System.currentTimeMillis() - 3600_000L }
    }

    fun has(id: String) = _all.value.any { it.id == id }

    /** Sets the reminder, or takes it off when it's already set; true when it's now set. */
    fun toggle(r: Reminder): Boolean {
        val on = !has(r.id)
        save(if (on) (_all.value + r).sortedBy { it.start } else _all.value.filter { it.id != r.id })
        return on
    }

    fun remove(id: String) = save(_all.value.filter { it.id != id })

    private fun save(list: List<Reminder>) {
        _all.value = list
        val a = JSONArray()
        list.forEach {
            a.put(JSONObject().put("url", it.url).put("channel", it.channel).put("number", it.number).put("title", it.title)
                .put("start", it.start).put("end", it.end))
        }
        prefs?.edit()?.putString(K_LIST, a.toString())?.apply()
    }

    private const val K_LIST = "list"
}

/**
 * The reminder pop-up, over every screen of NextGen Cable: a minute before a show the viewer picked, "Starting now on
 * Channel 6: …" with Watch (opens the channel) and Dismiss. It goes away by itself 5 minutes after the start.
 */
@Composable
fun ReminderPopup(onWatch: (url: String) -> Unit) {
    val all by Reminders.all.collectAsStateWithLifecycle()
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            // Old reminders (missed while the app was closed) are dropped.
            Reminders.all.value.filter { now > it.start + 5 * 60_000L }.forEach { Reminders.remove(it.id) }
            delay(5_000)
        }
    }
    val due = all.firstOrNull { now >= it.start - Reminders.AHEAD_MS && now <= it.start + 5 * 60_000L } ?: return
    val watch = remember(due.id) { FocusRequester() }
    LaunchedEffect(due.id) { runCatching { delay(100); watch.requestFocus() } }
    BackHandler { Reminders.remove(due.id) }
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.BottomEnd) {
        Column(
            Modifier
                .widthIn(max = 420.dp)
                .background(Color(0xEE101828), CardShape)
                .border(2.dp, FocusColor, CardShape)
                .padding(20.dp),
        ) {
            Text("🔔 Reminder", color = FocusColor, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            val channel = if (due.number > 0) "Channel ${due.number}: ${due.channel}" else due.channel
            Text(
                if (now < due.start) "Starting in a minute on $channel" else "Starting now on $channel",
                color = Color.White.copy(alpha = 0.8f),
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(due.title, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = { Reminders.remove(due.id); onWatch(due.url) },
                    modifier = Modifier.focusRequester(watch).focusGlow(),
                ) { Text("Watch") }
                OutlinedButton(onClick = { Reminders.remove(due.id) }, modifier = Modifier.focusGlow()) {
                    Text("Dismiss", color = Color.White)
                }
            }
        }
    }
}
