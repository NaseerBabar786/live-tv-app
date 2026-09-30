package com.livetv.app.data

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.roundToInt

/**
 * Current weather for the viewer's area, shown beside the clock. The area comes from the
 * internet connection (no location permission needed); the weather from Open-Meteo.
 * Neither service needs an account or key.
 */
object Weather {
    data class Now(val temperature: Int, val unit: String, val icon: String) {
        override fun toString() = "$icon $temperature°$unit"
    }

    private const val LOCATION_URL = "https://get.geojs.io/v1/ip/geo.json"

    /** Fahrenheit where people use it; Celsius everywhere else. */
    private val FAHRENHEIT = setOf("US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH")

    /** Looks up the weather now, or null when either service can't be reached. */
    fun load(): Now? = runCatching {
        val place = JSONObject(get(LOCATION_URL))
        val fahrenheit = place.optString("country_code").uppercase() in FAHRENHEIT
        val url = "https://api.open-meteo.com/v1/forecast?latitude=${place.getString("latitude")}" +
            "&longitude=${place.getString("longitude")}&current=temperature_2m,weather_code,is_day" +
            if (fahrenheit) "&temperature_unit=fahrenheit" else ""
        parse(get(url), if (fahrenheit) "F" else "C")
    }.getOrNull()

    fun parse(json: String, unit: String): Now {
        val current = JSONObject(json).getJSONObject("current")
        return Now(
            temperature = current.getDouble("temperature_2m").roundToInt(),
            unit = unit,
            icon = icon(current.getInt("weather_code"), day = current.optInt("is_day", 1) == 1),
        )
    }

    /** WMO weather code to an emoji. */
    fun icon(code: Int, day: Boolean = true): String = when (code) {
        0 -> if (day) "☀️" else "🌙"
        1, 2 -> if (day) "🌤️" else "☁️"
        3 -> "☁️"
        45, 48 -> "🌫️"
        in 51..67 -> "🌧️"
        in 71..77, 85, 86 -> "❄️"
        in 80..82 -> "🌦️"
        in 95..99 -> "⛈️"
        else -> "🌡️"
    }

    private fun get(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 10_000
        conn.setRequestProperty("User-Agent", ChannelRepository.USER_AGENT)
        return try {
            check(conn.responseCode == 200) { "HTTP ${conn.responseCode}" }
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }
}
