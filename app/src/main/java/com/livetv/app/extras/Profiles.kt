package com.livetv.app.extras

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.ui.CardShape
import com.livetv.app.ui.ChipShape
import com.livetv.app.ui.focusGlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

/**
 * Family profiles (owner, 2026-10-09; Gold): up to 4 people on one TV, each with their own favourites, last
 * channel and languages. The viewer's own settings are the first profile, so nothing changes until they add a
 * second one (settings-kept rule); "Who's watching?" only shows when there are two or more.
 *
 * Switching saves what's in the app's own settings ("live_tv") under the profile being left and puts the next
 * profile's back, so the rest of the app reads them as before.
 */
object Profiles {
    data class Profile(val id: String, val name: String, val face: String)

    const val MAX = 4

    /** Names to pick from (no typing with a remote). */
    val NAMES = listOf("Me", "Dad", "Mom", "Kids", "Grandma", "Grandpa", "Brother", "Sister", "Guests", "Family")
    private val FACES = listOf("🙂", "👨", "👩", "🧒", "👵", "👴", "👦", "👧", "🧑‍🤝‍🧑", "🏠")
    fun faceOf(name: String) = FACES.getOrElse(NAMES.indexOf(name)) { "🙂" }

    private var prefs: SharedPreferences? = null
    private var appPrefs: SharedPreferences? = null

    private val _all = MutableStateFlow(listOf(Profile("p1", "Me", faceOf("Me"))))
    val all: StateFlow<List<Profile>> = _all.asStateFlow()

    private val _current = MutableStateFlow("p1")
    val current: StateFlow<String> = _current.asStateFlow()

    /** Shown once per start when there are 2 or more profiles. */
    val asking = MutableStateFlow(false)

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences("profiles", Context.MODE_PRIVATE)
        prefs = p
        appPrefs = context.applicationContext.getSharedPreferences("live_tv", Context.MODE_PRIVATE)
        runCatching {
            val a = JSONArray(p.getString(K_LIST, null) ?: return@runCatching)
            val list = (0 until a.length()).map { i -> a.getJSONObject(i).let { Profile(it.getString("id"), it.getString("name"), it.optString("face", "🙂")) } }
            if (list.isNotEmpty()) _all.value = list
        }
        _current.value = p.getString(K_CURRENT, null)?.takeIf { id -> _all.value.any { it.id == id } } ?: _all.value.first().id
        asking.value = _all.value.size > 1
    }

    fun currentProfile(): Profile = _all.value.firstOrNull { it.id == _current.value } ?: _all.value.first()

    /** Adds a profile named [name]; it starts with no favourites and the same languages as the one in use. */
    fun add(name: String): Profile? {
        if (_all.value.size >= MAX) return null
        val id = "p" + ((_all.value.mapNotNull { it.id.removePrefix("p").toIntOrNull() }.maxOrNull() ?: 0) + 1)
        val profile = Profile(id, name, faceOf(name))
        val app = appPrefs
        prefs?.edit()?.apply {
            putStringSet("$id.$K_LANGUAGES", app?.getStringSet(K_LANGUAGES, emptySet()).orEmpty())
            putBoolean("$id.saved", true)
        }?.apply()
        saveList(_all.value + profile)
        return profile
    }

    /** Removes a profile other than the one in use, with its saved favourites. */
    fun remove(id: String) {
        if (id == _current.value || _all.value.size <= 1) return
        prefs?.edit()?.apply {
            listOf(K_FAVORITES, K_LAST, K_LANGUAGES, "saved").forEach { remove("$id.$it") }
        }?.apply()
        saveList(_all.value.filter { it.id != id })
    }

    /** Switches to [id]; true when the app's channels, favourites and languages must be read again. */
    fun switchTo(id: String): Boolean {
        val p = prefs ?: return false
        val app = appPrefs ?: return false
        val from = _current.value
        if (id == from || _all.value.none { it.id == id }) return false
        // Keep what the profile being left has now...
        p.edit()
            .putStringSet("$from.$K_FAVORITES", app.getStringSet(K_FAVORITES, emptySet()).orEmpty())
            .putString("$from.$K_LAST", app.getString(K_LAST, null))
            .putStringSet("$from.$K_LANGUAGES", app.getStringSet(K_LANGUAGES, emptySet()).orEmpty())
            .putBoolean("$from.saved", true)
            .putString(K_CURRENT, id)
            .apply()
        // ...and put the next one's in its place.
        app.edit()
            .putStringSet(K_FAVORITES, p.getStringSet("$id.$K_FAVORITES", emptySet()).orEmpty())
            .putString(K_LAST, p.getString("$id.$K_LAST", null))
            .putStringSet(K_LANGUAGES, p.getStringSet("$id.$K_LANGUAGES", emptySet()).orEmpty())
            .apply()
        _current.value = id
        return true
    }

    private fun saveList(list: List<Profile>) {
        _all.value = list
        val a = JSONArray()
        list.forEach { a.put(JSONObject().put("id", it.id).put("name", it.name).put("face", it.face)) }
        prefs?.edit()?.putString(K_LIST, a.toString())?.apply()
    }

    // The app's own setting names (ChannelRepository).
    private const val K_FAVORITES = "favorites"
    private const val K_LAST = "last_channel"
    private const val K_LANGUAGES = "languages"
    private const val K_LIST = "list"
    private const val K_CURRENT = "current"
}

/** "Who's watching?" at the start, when the TV has 2 or more profiles. */
@Composable
fun WhoIsWatching(onPick: (String) -> Unit) {
    val asking by Profiles.asking.collectAsStateWithLifecycle()
    val all by Profiles.all.collectAsStateWithLifecycle()
    val current by Profiles.current.collectAsStateWithLifecycle()
    if (!asking || all.size < 2) return
    val first = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { delay(150); first.requestFocus() } }
    OnTop(onBack = { Profiles.asking.value = false }) {
    Box(Modifier.fillMaxSize().background(Color(0xF0080C14)), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Who's watching?", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 32.sp)
            Spacer(Modifier.height(28.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                all.forEach { p ->
                    Column(
                        Modifier
                            .then(if (p.id == current) Modifier.focusRequester(first) else Modifier)
                            .focusGlow(CardShape)
                            .clickable { Profiles.asking.value = false; onPick(p.id) }
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box(
                            Modifier.size(110.dp).background(Color.White.copy(alpha = 0.1f), CardShape),
                            contentAlignment = Alignment.Center,
                        ) { Text(p.face, fontSize = 56.sp) }
                        Spacer(Modifier.height(10.dp))
                        Text(p.name, color = Color.White, fontSize = 20.sp)
                    }
                }
            }
        }
    }
    }
}

/** Settings > Family profiles: switch, add (names picked from a list) or remove. */
@Composable
fun ProfilesDialog(onSwitch: (String) -> Unit, onDismiss: () -> Unit) {
    val all by Profiles.all.collectAsStateWithLifecycle()
    val current by Profiles.current.collectAsStateWithLifecycle()
    var adding by remember { mutableStateOf(false) }
    if (adding) {
        AlertDialog(
            onDismissRequest = { adding = false },
            title = { Text("New profile") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Profiles.NAMES.filter { n -> all.none { it.name == n } }.forEach { name ->
                        Row(
                            Modifier.fillMaxWidth().focusGlow(ChipShape).clickable { Profiles.add(name); adding = false }.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(Profiles.faceOf(name), fontSize = 22.sp)
                            Spacer(Modifier.width(12.dp))
                            Text(name)
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { adding = false }, modifier = Modifier.focusGlow()) { Text("Cancel") } },
        )
        return
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("👪 Family profiles") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    "Each person gets their own favourites, last channel and languages. With two or more, NextGen Cable asks " +
                        "\"Who's watching?\" when it starts.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary,
                )
                all.forEach { p ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Row(
                            Modifier.weight(1f).focusGlow(ChipShape).clickable { onSwitch(p.id) }.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(p.face, fontSize = 22.sp)
                            Spacer(Modifier.width(12.dp))
                            Text(p.name + if (p.id == current) "  (watching now)" else "", fontWeight = if (p.id == current) FontWeight.Bold else FontWeight.Normal)
                        }
                        if (p.id != current) {
                            TextButton(onClick = { Profiles.remove(p.id) }, modifier = Modifier.focusGlow()) { Text("Remove") }
                        }
                    }
                }
                if (all.size < Profiles.MAX) {
                    TextButton(onClick = { adding = true }, modifier = Modifier.focusGlow()) { Text("＋ Add a profile") }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Done") } },
    )
}
