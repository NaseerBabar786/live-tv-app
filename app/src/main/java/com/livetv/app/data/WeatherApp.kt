package com.livetv.app.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToInt

/**
 * The Weather section (1.10.12): a full forecast for each place the viewer adds, like the popular
 * weather apps. Open-Meteo gives the weather and air quality, the US weather service its warnings,
 * Google News the weather stories. None of them needs an account or key; a part that can't be
 * reached is left out.
 */
object WeatherApp {
    data class Current(
        val temperature: Int,
        val feelsLike: Int,
        val code: Int,
        val day: Boolean,
        val humidity: Int,
        val wind: Int,
        /** Where the wind comes from, e.g. "NW". */
        val windFrom: String,
        val gusts: Int,
        val pressure: Int,
        val uv: Int,
        /** Kilometres (miles where it's Fahrenheit). */
        val visibility: Int?,
        val clouds: Int,
        val dewPoint: Int,
    ) {
        val icon get() = Weather.icon(code, day)
        val sky get() = describe(code)
    }

    data class Hour(
        /** Local time of the place, "2026-10-07T19:00". */
        val time: String,
        val temperature: Int,
        val feelsLike: Int,
        val code: Int,
        val day: Boolean,
        /** Chance of rain or snow, 0..100. */
        val rain: Int,
        val wind: Int,
    ) {
        val icon get() = Weather.icon(code, day)
        val hour get() = time.substring(11, 13).toInt()
        val date get() = time.substring(0, 10)
        val label get() = hourLabel(hour)
    }

    data class Day(
        /** "2026-10-07". */
        val date: String,
        val code: Int,
        val high: Int,
        val low: Int,
        val rain: Int,
        /** Millimetres of rain (snow as water); inches where it's Fahrenheit, times 10. */
        val rainAmount: Double,
        val snow: Double,
        val sunrise: String,
        val sunset: String,
        val uv: Int,
        val wind: Int,
    ) {
        val icon get() = Weather.icon(code)
        val sky get() = describe(code)
    }

    /** A part of the day (Morning, Noon, Afternoon, Evening, Night), as the TV weather shows it. */
    data class Part(val name: String, val date: String, val code: Int, val day: Boolean, val temperature: Int, val feelsLike: Int, val rain: Int) {
        val icon get() = Weather.icon(code, day)
        val sky get() = describe(code)
    }

    data class Alert(val title: String, val text: String, val severe: Boolean, val source: String)

    data class Story(val title: String, val source: String, val link: String, val published: Long)

    data class Report(
        val place: Location.Place,
        val fahrenheit: Boolean,
        /** The place's local time now, "2026-10-07T19:15". */
        val now: String,
        val current: Current,
        val hours: List<Hour>,
        val days: List<Day>,
        val airQuality: Int? = null,
        val alerts: List<Alert> = emptyList(),
        val loadedAt: Long = System.currentTimeMillis(),
    ) {
        val unit get() = if (fahrenheit) "F" else "C"
        val speed get() = if (fahrenheit) "mph" else "km/h"
        val distance get() = if (fahrenheit) "mi" else "km"
        val today get() = days.firstOrNull()

        /** The hours from now on (the current hour first). */
        fun hoursFromNow(count: Int = 24): List<Hour> {
            val start = hours.indexOfFirst { it.time.take(13) >= now.take(13) }.coerceAtLeast(0)
            return hours.drop(start).take(count)
        }

        /** Every hour of [date]. */
        fun hoursOf(date: String) = hours.filter { it.date == date }

        /** The parts of the day still to come, starting with the one we're in, across today and tomorrow. */
        fun partsFromNow(count: Int = 5): List<Part> {
            val nowHour = now.take(13)
            return days.take(3).flatMap { partsOf(it.date) }
                .filter { partEnd(it) > nowHour }
                .take(count)
        }

        private fun partEnd(p: Part): String {
            val end = PART_END.getValue(p.name)
            return if (p.name == NIGHT) nextDate(p.date) + "T%02d".format(Locale.US, end) else p.date + "T%02d".format(Locale.US, end)
        }

        /** Morning, Noon, Afternoon, Evening and Night of [date] (the night runs into the next morning). */
        fun partsOf(date: String): List<Part> = PARTS.mapNotNull { (name, range) ->
            val next = nextDate(date)
            val inPart = hours.filter { h ->
                if (name == NIGHT) (h.date == date && h.hour >= range.first) || (h.date == next && h.hour < 6)
                else h.date == date && h.hour in range
            }
            if (inPart.isEmpty()) null else Part(
                name = name,
                date = date,
                code = inPart.maxOf { it.code },
                day = name != NIGHT && name != EVENING,
                temperature = if (name == NIGHT) inPart.minOf { it.temperature } else inPart.map { it.temperature }.average().roundToInt(),
                feelsLike = inPart.map { it.feelsLike }.average().roundToInt(),
                rain = inPart.maxOf { it.rain },
            )
        }

        /** What to wear and take today, from the feel of the air and the chance of rain. */
        fun tip(): String {
            val feel = if (fahrenheit) ((current.feelsLike - 32) * 5 / 9.0) else current.feelsLike.toDouble()
            val wear = when {
                feel <= -15 -> "Very cold: a winter coat, hat, gloves and scarf."
                feel <= 0 -> "Cold: a warm coat, hat and gloves."
                feel <= 10 -> "Chilly: a jacket or a warm sweater."
                feel <= 18 -> "Cool: a light jacket or a long-sleeved top."
                feel <= 27 -> "Pleasant: light clothes are fine."
                else -> "Hot: light clothes, drink lots of water."
            }
            val rainToday = hoursFromNow(12).maxOfOrNull { it.rain } ?: 0
            val extra = when {
                rainToday >= 50 && hoursFromNow(12).any { it.code in 71..77 || it.code in 85..86 } -> " Snow likely: boots on."
                rainToday >= 50 -> " Rain likely: take an umbrella."
                rainToday >= 30 -> " A chance of rain: an umbrella might help."
                (today?.uv ?: 0) >= 7 -> " Strong sun: sunglasses and sunscreen."
                else -> ""
            }
            return wear + extra
        }

        /** Warnings worked out from the forecast itself, for today and tomorrow (everywhere, also with no official ones). */
        fun headsUp(): List<Alert> {
            val out = mutableListOf<Alert>()
            for ((i, d) in days.take(2).withIndex()) {
                val whenText = if (i == 0) "today" else "tomorrow"
                val highC = if (fahrenheit) (d.high - 32) * 5 / 9.0 else d.high.toDouble()
                val lowC = if (fahrenheit) (d.low - 32) * 5 / 9.0 else d.low.toDouble()
                val windKm = if (fahrenheit) d.wind * 1.609 else d.wind.toDouble()
                val rainMm = if (fahrenheit) d.rainAmount * 25.4 else d.rainAmount
                val snowCm = if (fahrenheit) d.snow * 2.54 else d.snow
                if (d.code in 95..99) out += Alert("Thunderstorms $whenText", "Storms are expected $whenText. Stay indoors when you hear thunder.", true, FORECAST)
                if (rainMm >= 25) out += Alert("Heavy rain $whenText", "About ${amount(d.rainAmount)} of rain is expected $whenText.", rainMm >= 50, FORECAST)
                if (snowCm >= 5) out += Alert("Snow $whenText", "About ${snowAmount(d.snow)} of snow is expected $whenText. Roads may be slippery.", snowCm >= 15, FORECAST)
                if (highC >= 32) out += Alert("Heat $whenText", "It will reach ${d.high}°$unit $whenText. Drink water and stay out of the midday sun.", highC >= 38, FORECAST)
                if (lowC <= -20) out += Alert("Extreme cold $whenText", "It will go down to ${d.low}°$unit $whenText. Cover your skin outside.", lowC <= -30, FORECAST)
                if (windKm >= 60) out += Alert("Strong wind $whenText", "Winds up to ${d.wind} $speed $whenText.", windKm >= 90, FORECAST)
                if (i == 0 && d.uv >= 8) out += Alert("Very strong sun today", "The UV index reaches ${d.uv}. Use sunscreen and a hat.", false, FORECAST)
            }
            if ((airQuality ?: 0) > 100) out += Alert("Poor air quality", "The air quality index is $airQuality (${airLabel(airQuality!!)}). People with breathing problems should stay indoors.", (airQuality ?: 0) > 150, FORECAST)
            return out
        }

        private fun amount(v: Double) = if (fahrenheit) "%.1f in".format(Locale.US, v) else "${v.roundToInt()} mm"
        private fun snowAmount(v: Double) = if (fahrenheit) "%.1f in".format(Locale.US, v) else "${v.roundToInt()} cm"
    }

    const val MORNING = "Morning"
    const val NOON = "Noon"
    const val AFTERNOON = "Afternoon"
    const val EVENING = "Evening"
    const val NIGHT = "Night"
    private const val FORECAST = "From the forecast"

    /** The hours of each part of the day. */
    private val PARTS = listOf(
        MORNING to 6..10,
        NOON to 11..13,
        AFTERNOON to 14..17,
        EVENING to 18..21,
        NIGHT to 22..23,
    )
    /** The hour each part is over (the night's is the next day's). */
    private val PART_END = mapOf(MORNING to 11, NOON to 14, AFTERNOON to 18, EVENING to 22, NIGHT to 6)

    // ---------- Places ----------

    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs == null) prefs = context.applicationContext.getSharedPreferences("weather_app", Context.MODE_PRIVATE)
    }

    /** The places the viewer added (their own place, from [Location], always comes first and isn't stored). */
    fun places(): List<Location.Place> = runCatching {
        val a = JSONArray(prefs?.getString(K_PLACES, "[]") ?: "[]")
        (0 until a.length()).map { placeFrom(a.getJSONObject(it)) }
    }.getOrDefault(emptyList())

    fun addPlace(p: Location.Place) {
        val list = places().filterNot { same(it, p) } + p
        savePlaces(list)
    }

    fun removePlace(p: Location.Place) = savePlaces(places().filterNot { same(it, p) })

    private fun savePlaces(list: List<Location.Place>) {
        val a = JSONArray()
        list.forEach { a.put(placeJson(it)) }
        prefs?.edit()?.putString(K_PLACES, a.toString())?.apply()
    }

    fun same(a: Location.Place, b: Location.Place) =
        kotlin.math.abs(a.latitude - b.latitude) < 0.01 && kotlin.math.abs(a.longitude - b.longitude) < 0.01

    /** The viewer's choice of °C or °F; null means the usual one for the place's country. */
    var fahrenheitChoice: Boolean?
        get() = prefs?.takeIf { it.contains(K_UNIT) }?.getBoolean(K_UNIT, false)
        set(v) {
            prefs?.edit()?.apply { if (v == null) remove(K_UNIT) else putBoolean(K_UNIT, v) }?.apply()
            cache.clear()
        }

    /** The place last looked at (0 = the viewer's own place). */
    var selected: Int
        get() = prefs?.getInt(K_SELECTED, 0) ?: 0
        set(v) { prefs?.edit()?.putInt(K_SELECTED, v)?.apply() }

    // ---------- Loading ----------

    private val cache = HashMap<String, Report>()

    private fun key(p: Location.Place) = "%.2f,%.2f".format(Locale.US, p.latitude, p.longitude)

    /** The weather for [place] (kept for 15 minutes); null when Open-Meteo can't be reached. Call off the main thread. */
    fun load(place: Location.Place, fresh: Boolean = false): Report? {
        val k = key(place)
        cache[k]?.takeIf { !fresh && System.currentTimeMillis() - it.loadedAt < 15 * 60_000L }?.let { return it }
        val f = fahrenheitChoice ?: (place.country in Weather.FAHRENHEIT)
        val report = runCatching { parse(get(forecastUrl(place, f)), place, f) }.getOrNull() ?: return null
        val air = runCatching { parseAir(get(airUrl(place))) }.getOrNull()
        val official = if (place.country == "US") runCatching { parseNws(get(nwsUrl(place))) }.getOrDefault(emptyList()) else emptyList()
        return report.copy(airQuality = air, alerts = official).also { cache[k] = it }
    }

    fun forecastUrl(p: Location.Place, fahrenheit: Boolean) =
        "https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}" +
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m," +
            "wind_direction_10m,wind_gusts_10m,pressure_msl,uv_index,visibility,cloud_cover,dew_point_2m" +
            "&hourly=temperature_2m,apparent_temperature,weather_code,precipitation_probability,is_day,wind_speed_10m" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum," +
            "snowfall_sum,sunrise,sunset,uv_index_max,wind_speed_10m_max" +
            "&timezone=auto&forecast_days=10" +
            if (fahrenheit) "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch" else ""

    private fun airUrl(p: Location.Place) =
        "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p.latitude}&longitude=${p.longitude}&current=us_aqi"

    private fun nwsUrl(p: Location.Place) =
        "https://api.weather.gov/alerts/active?point=%.4f,%.4f".format(Locale.US, p.latitude, p.longitude)

    fun parse(json: String, place: Location.Place, fahrenheit: Boolean): Report {
        val o = JSONObject(json)
        val c = o.getJSONObject("current")
        val visibility = c.optDouble("visibility").takeUnless { it.isNaN() }
            ?.let { if (fahrenheit) it / 5280 else it / 1000 }?.roundToInt()
        val current = Current(
            temperature = c.getDouble("temperature_2m").roundToInt(),
            feelsLike = c.optDouble("apparent_temperature", c.getDouble("temperature_2m")).roundToInt(),
            code = c.optInt("weather_code"),
            day = c.optInt("is_day", 1) == 1,
            humidity = c.optInt("relative_humidity_2m"),
            wind = c.optDouble("wind_speed_10m", 0.0).roundToInt(),
            windFrom = compass(c.optDouble("wind_direction_10m", 0.0)),
            gusts = c.optDouble("wind_gusts_10m", 0.0).roundToInt(),
            pressure = c.optDouble("pressure_msl", 0.0).roundToInt(),
            uv = c.optDouble("uv_index", 0.0).roundToInt(),
            visibility = visibility,
            clouds = c.optInt("cloud_cover"),
            dewPoint = c.optDouble("dew_point_2m", 0.0).roundToInt(),
        )
        val h = o.getJSONObject("hourly")
        val times = h.getJSONArray("time")
        val hours = (0 until times.length()).map { i ->
            Hour(
                time = times.getString(i),
                temperature = num(h, "temperature_2m", i).roundToInt(),
                feelsLike = num(h, "apparent_temperature", i).roundToInt(),
                code = num(h, "weather_code", i).toInt(),
                day = num(h, "is_day", i, 1.0) == 1.0,
                rain = num(h, "precipitation_probability", i).roundToInt(),
                wind = num(h, "wind_speed_10m", i).roundToInt(),
            )
        }
        val d = o.getJSONObject("daily")
        val dates = d.getJSONArray("time")
        val days = (0 until dates.length()).map { i ->
            Day(
                date = dates.getString(i),
                code = num(d, "weather_code", i).toInt(),
                high = num(d, "temperature_2m_max", i).roundToInt(),
                low = num(d, "temperature_2m_min", i).roundToInt(),
                rain = num(d, "precipitation_probability_max", i).roundToInt(),
                rainAmount = num(d, "precipitation_sum", i),
                snow = num(d, "snowfall_sum", i),
                sunrise = d.optJSONArray("sunrise")?.optString(i).orEmpty(),
                sunset = d.optJSONArray("sunset")?.optString(i).orEmpty(),
                uv = num(d, "uv_index_max", i).roundToInt(),
                wind = num(d, "wind_speed_10m_max", i).roundToInt(),
            )
        }
        return Report(place, fahrenheit, c.optString("time", hours.firstOrNull()?.time.orEmpty()), current, hours, days)
    }

    private fun num(o: JSONObject, name: String, i: Int, default: Double = 0.0): Double =
        o.optJSONArray(name)?.optDouble(i)?.takeUnless { it.isNaN() } ?: default

    fun parseAir(json: String): Int? =
        JSONObject(json).optJSONObject("current")?.optDouble("us_aqi")?.takeUnless { it.isNaN() }?.roundToInt()

    /** The US National Weather Service's warnings for a point. */
    fun parseNws(json: String): List<Alert> {
        val features = JSONObject(json).optJSONArray("features") ?: return emptyList()
        return (0 until features.length()).mapNotNull { i ->
            val p = features.getJSONObject(i).optJSONObject("properties") ?: return@mapNotNull null
            val title = p.optString("event").ifBlank { return@mapNotNull null }
            Alert(
                title = title,
                text = p.optString("headline").ifBlank { p.optString("description") }.replace(Regex("\\s+"), " ").trim(),
                severe = p.optString("severity") in setOf("Extreme", "Severe"),
                source = "US National Weather Service",
            )
        }.distinctBy { it.title }
    }

    // ---------- Stories ----------

    /** Weather stories about [place] first, then weather news from the rest of the country and the world. */
    fun stories(place: Location.Place): List<Story> {
        val (hl, gl) = when (place.country) {
            "CA" -> "en-CA" to "CA"
            "US" -> "en-US" to "US"
            "GB" -> "en-GB" to "GB"
            "PK" -> "en-PK" to "PK"
            "IN" -> "en-IN" to "IN"
            "AU" -> "en-AU" to "AU"
            else -> "en-US" to "US"
        }
        fun feed(q: String) = runCatching {
            parseNews(get("https://news.google.com/rss/search?q=" + URLEncoder.encode(q, "UTF-8") + "&hl=$hl&gl=$gl&ceid=$gl:en"))
        }.getOrDefault(emptyList())
        val local = if (place.city.isNotBlank()) feed("${place.city} weather when:7d") else emptyList()
        val wide = feed("weather forecast OR storm OR heat wave OR snowstorm when:2d")
        return (local.take(12) + wide).distinctBy { it.title.lowercase() }.take(24)
    }

    fun parseNews(xml: String): List<Story> =
        Regex("<item[\\s>].*?</item>", RegexOption.DOT_MATCHES_ALL).findAll(xml).mapNotNull { m ->
            fun tag(name: String) = Regex("<$name[^>]*>(.*?)</$name>", RegexOption.DOT_MATCHES_ALL).find(m.value)?.groupValues?.get(1)
                ?.replace("<![CDATA[", "")?.replace("]]>", "")?.let(::unescape)?.replace(Regex("\\s+"), " ")?.trim()
            val source = tag("source").orEmpty()
            var title = tag("title") ?: return@mapNotNull null
            if (source.isNotEmpty() && title.endsWith(" - $source")) title = title.removeSuffix(" - $source")
            val link = tag("link") ?: return@mapNotNull null
            val published = tag("pubDate")?.let { d ->
                runCatching { SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.US).parse(d)?.time }.getOrNull()
            } ?: 0L
            Story(title, source, link, published)
        }.toList()

    private fun unescape(s: String): String = s
        .replace(Regex("&#(\\d+);")) { it.groupValues[1].toIntOrNull()?.let { c -> String(Character.toChars(c)) } ?: it.value }
        .replace("&quot;", "\"").replace("&apos;", "'").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">")
        .replace("&nbsp;", " ").replace("&amp;", "&")

    /** "3 h ago", "2 days ago". */
    fun ago(time: Long, now: Long = System.currentTimeMillis()): String {
        if (time <= 0) return ""
        val minutes = (now - time) / 60_000
        return when {
            minutes < 60 -> "${minutes.coerceAtLeast(1)} min ago"
            minutes < 24 * 60 -> "${minutes / 60} h ago"
            minutes < 48 * 60 -> "Yesterday"
            else -> "${minutes / (24 * 60)} days ago"
        }
    }

    /** A free weather map (rain radar) for [place], shown in the app. */
    fun radarUrl(place: Location.Place, fahrenheit: Boolean) =
        "https://embed.windy.com/embed2.html?lat=${place.latitude}&lon=${place.longitude}&detailLat=${place.latitude}" +
            "&detailLon=${place.longitude}&zoom=7&level=surface&overlay=rain&product=ecmwf&menu=&message=true&marker=true" +
            "&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=${if (fahrenheit) "mph" else "km%2Fh"}" +
            "&metricTemp=${if (fahrenheit) "%C2%B0F" else "%C2%B0C"}&radarRange=-1"

    // ---------- Words ----------

    fun describe(code: Int): String = when (code) {
        0 -> "Clear"
        1 -> "Mainly clear"
        2 -> "Partly cloudy"
        3 -> "Cloudy"
        45, 48 -> "Fog"
        51, 53, 55 -> "Drizzle"
        56, 57 -> "Freezing drizzle"
        61 -> "Light rain"
        63 -> "Rain"
        65 -> "Heavy rain"
        66, 67 -> "Freezing rain"
        71 -> "Light snow"
        73 -> "Snow"
        75 -> "Heavy snow"
        77 -> "Snow grains"
        80 -> "Light showers"
        81 -> "Showers"
        82 -> "Heavy showers"
        85, 86 -> "Snow showers"
        95 -> "Thunderstorms"
        96, 99 -> "Thunderstorms with hail"
        else -> "—"
    }

    fun airLabel(aqi: Int): String = when {
        aqi <= 50 -> "Good"
        aqi <= 100 -> "Moderate"
        aqi <= 150 -> "Unhealthy for some"
        aqi <= 200 -> "Unhealthy"
        aqi <= 300 -> "Very unhealthy"
        else -> "Hazardous"
    }

    fun uvLabel(uv: Int): String = when {
        uv <= 2 -> "Low"
        uv <= 5 -> "Moderate"
        uv <= 7 -> "High"
        uv <= 10 -> "Very high"
        else -> "Extreme"
    }

    fun compass(degrees: Double): String {
        val names = listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")
        return names[(((degrees % 360) + 360) % 360 / 45.0).roundToInt() % 8]
    }

    fun hourLabel(hour: Int): String = when {
        hour == 0 -> "12 AM"
        hour < 12 -> "$hour AM"
        hour == 12 -> "12 PM"
        else -> "${hour - 12} PM"
    }

    /** "7:15 AM" from "2026-10-07T07:15". */
    fun clock(time: String): String {
        if (time.length < 16) return ""
        val h = time.substring(11, 13).toIntOrNull() ?: return ""
        val m = time.substring(14, 16)
        val h12 = if (h % 12 == 0) 12 else h % 12
        return "$h12:$m ${if (h < 12) "AM" else "PM"}"
    }

    /** "Today", "Tomorrow" or "Wed" for [date], next to [today]. */
    fun dayName(date: String, today: String): String = when (date) {
        today -> "Today"
        nextDate(today) -> "Tomorrow"
        else -> calendar(date)?.let { SimpleDateFormat("EEE", Locale.US).apply { timeZone = UTC }.format(it.time) } ?: date
    }

    /** "Oct 8". */
    fun shortDate(date: String): String =
        calendar(date)?.let { SimpleDateFormat("MMM d", Locale.US).apply { timeZone = UTC }.format(it.time) } ?: date

    fun nextDate(date: String): String {
        val c = calendar(date) ?: return date
        c.add(Calendar.DAY_OF_MONTH, 1)
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = UTC }.format(c.time)
    }

    private val UTC = TimeZone.getTimeZone("UTC")

    private fun calendar(date: String): Calendar? = runCatching {
        val d = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = UTC }.parse(date.take(10)) ?: return null
        Calendar.getInstance(UTC).apply { time = d }
    }.getOrNull()

    private fun placeJson(p: Location.Place) = JSONObject()
        .put("lat", p.latitude).put("lon", p.longitude).put("city", p.city).put("country", p.country).put("region", p.region)

    private fun placeFrom(o: JSONObject) = Location.Place(
        latitude = o.getDouble("lat"),
        longitude = o.getDouble("lon"),
        city = o.optString("city"),
        country = o.optString("country"),
        region = o.optString("region"),
    )

    private fun get(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        // The US weather service asks every app to name itself.
        conn.setRequestProperty("User-Agent", "CableTV/1.0 (tv.bulkbazaar.ca)")
        conn.setRequestProperty("Accept", "application/geo+json, application/json, application/rss+xml, */*")
        return try {
            check(conn.responseCode == 200) { "HTTP ${conn.responseCode}" }
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private const val K_PLACES = "places"
    private const val K_UNIT = "fahrenheit"
    private const val K_SELECTED = "selected"
}
