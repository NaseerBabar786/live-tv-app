package com.iqraquran.app.data

import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** The weather now at the prayer times' place, for the Azan Clock's weather tile (Open-Meteo, free, no key). */
object AzanWeather {
    data class Now(
        val temperature: Int,
        val feelsLike: Int,
        val high: Int,
        val low: Int,
        val code: Int,
        val day: Boolean,
        val wind: Int,
        val rainChance: Int,
        val fahrenheit: Boolean,
    ) {
        val unit get() = if (fahrenheit) "F" else "C"
        val speed get() = if (fahrenheit) "mph" else "km/h"
        val icon get() = icon(code, day)
        val en get() = words(code).first
        val ur get() = words(code).second
    }

    /** Fahrenheit where people use it (as NextGen Cable's weather); Celsius everywhere else. */
    private val FAHRENHEIT = setOf("US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH")

    /** The weather now at [place], or null when it can't be reached. */
    suspend fun load(place: Place): Now? = withContext(Dispatchers.IO) {
        runCatching {
            val f = place.country.uppercase() in FAHRENHEIT
            val url = "https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}" +
                "&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m" +
                "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto" +
                if (f) "&temperature_unit=fahrenheit&wind_speed_unit=mph" else ""
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 20_000
                setRequestProperty("User-Agent", "IqraQuran-Android/1.0")
            }
            val text = try {
                check(conn.responseCode == 200) { "HTTP ${conn.responseCode}" }
                conn.inputStream.bufferedReader().use { it.readText() }
            } finally {
                conn.disconnect()
            }
            val o = JSONObject(text)
            val c = o.getJSONObject("current")
            val d = o.optJSONObject("daily")
            fun day(key: String): Double? = d?.optJSONArray(key)?.optDouble(0)?.takeIf { !it.isNaN() }
            val t = c.getDouble("temperature_2m")
            Now(
                temperature = t.roundToInt(),
                feelsLike = c.optDouble("apparent_temperature", t).roundToInt(),
                high = (day("temperature_2m_max") ?: t).roundToInt(),
                low = (day("temperature_2m_min") ?: t).roundToInt(),
                code = c.optInt("weather_code"),
                day = c.optInt("is_day", 1) == 1,
                wind = c.optDouble("wind_speed_10m", 0.0).roundToInt(),
                rainChance = (day("precipitation_probability_max") ?: 0.0).roundToInt(),
                fahrenheit = f,
            )
        }.getOrNull()
    }

    /** WMO weather code to an emoji (the same pictures as NextGen Cable's top bar). */
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

    /** WMO weather code to words: (English, Urdu). */
    fun words(code: Int): Pair<String, String> = when (code) {
        0 -> "Clear" to "صاف"
        1 -> "Mostly clear" to "زیادہ تر صاف"
        2 -> "Partly cloudy" to "جزوی ابر آلود"
        3 -> "Cloudy" to "ابر آلود"
        45, 48 -> "Fog" to "دھند"
        in 51..57 -> "Drizzle" to "بوندا باندی"
        in 61..67 -> "Rain" to "بارش"
        in 71..77 -> "Snow" to "برف باری"
        in 80..82 -> "Showers" to "بوچھاڑ"
        85, 86 -> "Snow showers" to "برف کی بوچھاڑ"
        in 95..99 -> "Thunderstorm" to "آندھی اور طوفان"
        else -> "Weather" to "موسم"
    }
}
