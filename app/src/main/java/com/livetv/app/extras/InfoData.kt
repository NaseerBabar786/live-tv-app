package com.livetv.app.extras

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.data.Location
import com.livetv.app.data.News
import com.livetv.app.data.Weather
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.util.Calendar

/** The weather now, refreshed every half hour (5 minutes while it can't be reached); null until it loads. */
@Composable
internal fun rememberWeatherNow(): Weather.Now? {
    var weather by remember { mutableStateOf<Weather.Now?>(null) }
    val place by Location.version.collectAsStateWithLifecycle()
    LaunchedEffect(place) {
        while (true) {
            withContext(Dispatchers.IO) { Weather.load() }?.let { weather = it }
            delay(if (weather == null) 5 * 60_000L else 30 * 60_000L)
        }
    }
    return weather
}

/** Today's prayer times for the viewer's area, refreshed every 3 hours; empty until they load. */
@Composable
internal fun rememberPrayers(): List<News.Prayer> {
    var prayers by remember { mutableStateOf<List<News.Prayer>>(emptyList()) }
    val place by Location.version.collectAsStateWithLifecycle()
    LaunchedEffect(place) {
        while (true) {
            withContext(Dispatchers.IO) { News.today() }?.let { prayers = it.prayers }
            delay(if (prayers.isEmpty()) 5 * 60_000L else 3 * 3600_000L)
        }
    }
    return prayers
}

internal fun prayerMinutes(t: String) = t.split(':').let { (it[0].toIntOrNull() ?: 0) * 60 + (it.getOrNull(1)?.toIntOrNull() ?: 0) }

/** "Asr in 25 min": the next prayer and how long until it (after Isha, tomorrow's Fajr); null without times. */
internal fun nextAzanText(prayers: List<News.Prayer>, nowMs: Long = System.currentTimeMillis()): String? {
    if (prayers.isEmpty()) return null
    val c = Calendar.getInstance().apply { timeInMillis = nowMs }
    val minute = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE)
    val next = prayers.firstOrNull { prayerMinutes(it.time) > minute }
    val (p, until) = if (next != null) next to prayerMinutes(next.time) - minute
    else prayers.first() to 24 * 60 - minute + prayerMinutes(prayers.first().time)
    val name = if (p.name == "Dhuhr") "Zuhr" else p.name
    val left = when {
        until < 60 -> "$until min"
        until % 60 == 0 -> "${until / 60} h"
        else -> "${until / 60} h ${until % 60} min"
    }
    return "$name in $left"
}
