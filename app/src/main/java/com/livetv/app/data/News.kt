package com.livetv.app.data

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

/**
 * What News mode shows beside the live channel: weather, prayer times, rupee rates, headlines and
 * markets. None of the services needs an account or key; each panel hides when its service can't
 * be reached.
 */
object News {
    data class Day(val name: String, val icon: String, val high: Int, val low: Int, val rain: Int)

    data class Forecast(
        val temperature: Int,
        val feelsLike: Int,
        val unit: String,
        val icon: String,
        val days: List<Day>,
        /** The next few parts of the day (morning, afternoon, evening, night), like the TV news. */
        val periods: List<Period> = emptyList(),
        val humidity: Int? = null,
        /** Wind in km/h (mph where it's Fahrenheit). */
        val wind: Int? = null,
    )

    data class Period(val name: String, val icon: String, val temperature: Int)

    /** The hour each part of the day is shown for. */
    private val PERIODS = mapOf(8 to "MORN", 13 to "AFT", 18 to "EVE", 23 to "NITE")

    data class Prayer(val name: String, val time: String)

    /** How much of each currency one unit of [base] buys (e.g. "PKR" to 200.5). */
    data class Rates(val base: String, val values: Map<String, Double>) {
        operator fun get(code: String): Double? = values[code]
    }

    /** One currency in the rates row: its code, symbol and flag. */
    data class Money(val code: String, val symbol: String, val flag: String)

    /** Asian currencies shown against the viewer's money, a few at a time. */
    val ASIAN = listOf(
        Money("PKR", "Rs ", "🇵🇰"),
        Money("INR", "₹", "🇮🇳"),
        Money("BDT", "৳", "🇧🇩"),
        Money("LKR", "Rs ", "🇱🇰"),
        Money("NPR", "Rs ", "🇳🇵"),
        Money("AFN", "؋", "🇦🇫"),
        Money("AED", "", "🇦🇪"),
        Money("SAR", "", "🇸🇦"),
        Money("QAR", "", "🇶🇦"),
        Money("PHP", "₱", "🇵🇭"),
        Money("CNY", "¥", "🇨🇳"),
        Money("MYR", "RM ", "🇲🇾"),
    )

    /** Today's Islamic date as aladhan gives it, e.g. day 12, month 4 "Rabīʿ al-thānī", year 1448. */
    data class Hijri(val day: Int, val month: Int, val monthName: String, val year: Int) {
        val label get() = "$day $monthName $year AH"
    }

    /** Today's prayer times and Islamic date. */
    data class Today(val prayers: List<Prayer>, val hijri: Hijri?)

    /** Grams in a tola and in a troy ounce (gold is priced per troy ounce). */
    private const val TOLA_GRAMS = 11.6638
    private const val OUNCE_GRAMS = 31.1035

    /**
     * The price of one tola of gold in [code], from the gold price in US dollars per ounce and
     * [rates] (which must include USD and [code]); null when either is missing.
     */
    fun goldTola(goldUsdPerOunce: Double?, rates: Rates?, code: String): Double? {
        val usd = rates?.get("USD") ?: return null
        val wanted = if (code == rates.base) 1.0 else rates[code] ?: return null
        if (goldUsdPerOunce == null || usd <= 0) return null
        return goldUsdPerOunce / usd * wanted * TOLA_GRAMS / OUNCE_GRAMS
    }

    data class Headline(val title: String, val source: String)

    data class Market(val name: String, val price: Double, val change: Double)

    /** The viewer's area (see [Location]). */
    fun place(): Location.Place? = Location.current()

    /** Fahrenheit where people use it; Celsius everywhere else. */
    private val FAHRENHEIT = setOf("US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH")

    fun forecast(): Forecast? = runCatching {
        val p = place() ?: return null
        val fahrenheit = p.country in FAHRENHEIT
        val url = "https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}" +
            "&current=temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m" +
            "&hourly=temperature_2m,weather_code,is_day" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
            "&forecast_days=5&timezone=auto" + if (fahrenheit) "&temperature_unit=fahrenheit&wind_speed_unit=mph" else ""
        parseForecast(get(url), if (fahrenheit) "F" else "C")
    }.getOrNull()

    /** The current weather and the next four days (today is left out of the days). */
    fun parseForecast(json: String, unit: String): Forecast {
        val o = JSONObject(json)
        val now = o.getJSONObject("current")
        val daily = o.getJSONObject("daily")
        val dates = daily.getJSONArray("time")
        val parse = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val dayName = SimpleDateFormat("EEE", Locale.getDefault())
        val days = (1 until dates.length()).map { i ->
            Day(
                name = dayName.format(parse.parse(dates.getString(i))!!).uppercase(),
                icon = Weather.icon(daily.getJSONArray("weather_code").optInt(i)),
                high = daily.getJSONArray("temperature_2m_max").optDouble(i).roundToInt(),
                low = daily.getJSONArray("temperature_2m_min").optDouble(i).roundToInt(),
                rain = daily.getJSONArray("precipitation_probability_max").optInt(i),
            )
        }
        // The next five parts of the day after now, from the hourly forecast.
        val periods = mutableListOf<Period>()
        o.optJSONObject("hourly")?.let { hourly ->
            val times = hourly.getJSONArray("time")
            val nowTime = now.optString("time")
            for (i in 0 until times.length()) {
                if (periods.size == 5) break
                val t = times.getString(i) // "2026-10-04T13:00"
                if (t <= nowTime) continue
                val name = PERIODS[t.substringAfter('T').substringBefore(':').toIntOrNull()] ?: continue
                periods += Period(
                    name = name,
                    icon = Weather.icon(hourly.getJSONArray("weather_code").optInt(i), day = hourly.optJSONArray("is_day")?.optInt(i, 1) != 0),
                    temperature = hourly.getJSONArray("temperature_2m").optDouble(i).roundToInt(),
                )
            }
        }
        return Forecast(
            temperature = now.getDouble("temperature_2m").roundToInt(),
            feelsLike = now.optDouble("apparent_temperature", now.getDouble("temperature_2m")).roundToInt(),
            unit = unit,
            icon = Weather.icon(now.getInt("weather_code"), day = now.optInt("is_day", 1) == 1),
            days = days,
            periods = periods,
            humidity = now.optDouble("relative_humidity_2m").takeUnless { it.isNaN() }?.roundToInt(),
            wind = now.optDouble("wind_speed_10m").takeUnless { it.isNaN() }?.roundToInt(),
        )
    }

    /** Today's five prayer times for the viewer's area (ISNA method, used across North America). */
    fun today(): Today? = runCatching {
        val p = place() ?: return null
        val today = SimpleDateFormat("dd-MM-yyyy", Locale.US).format(Date())
        val json = get("https://api.aladhan.com/v1/timings/$today?latitude=${p.latitude}&longitude=${p.longitude}&method=2")
        Today(parsePrayers(json), parseHijri(json))
    }.getOrNull()

    fun parseHijri(json: String): Hijri? = runCatching {
        val h = JSONObject(json).getJSONObject("data").getJSONObject("date").getJSONObject("hijri")
        val month = h.getJSONObject("month")
        Hijri(
            day = h.getString("day").toInt(),
            month = month.getInt("number"),
            monthName = month.optString("en"),
            year = h.getString("year").toInt(),
        )
    }.getOrNull()

    fun parsePrayers(json: String): List<Prayer> {
        val t = JSONObject(json).getJSONObject("data").getJSONObject("timings")
        return listOf("Fajr", "Dhuhr", "Asr", "Maghrib", "Isha").map { name ->
            // "18:55" or "18:55 (EDT)"
            Prayer(name, t.getString(name).substringBefore(' ').trim())
        }
    }

    /** Other currencies for one unit of the viewer's money (Canadian dollars in Canada). */
    fun rates(): Rates? = runCatching {
        val base = when (place()?.country) {
            "US" -> "USD"
            "GB" -> "GBP"
            "AU" -> "AUD"
            "AE" -> "AED"
            else -> "CAD"
        }
        parseRates(get("https://open.er-api.com/v6/latest/$base"), base)
    }.getOrNull()

    fun parseRates(json: String, base: String): Rates {
        val r = JSONObject(json).getJSONObject("rates")
        val values = r.keys().asSequence().mapNotNull { k -> r.optDouble(k).takeUnless { it.isNaN() }?.let { k to it } }.toMap()
        return Rates(base, values)
    }

    /** Top stories from Pakistan, Canada and India, taken in turn so each source shows. */
    private val FEEDS = listOf(
        "Dawn" to "https://www.dawn.com/feeds/home",
        "CBC News" to "https://www.cbc.ca/webfeed/rss/rss-topstories",
        "NDTV" to "https://feeds.feedburner.com/ndtvnews-top-stories",
    )

    fun headlines(): List<Headline> {
        val lists = FEEDS.map { (source, url) ->
            runCatching { parseRss(get(url)).take(8).map { Headline(it, source) } }.getOrDefault(emptyList())
        }
        val out = mutableListOf<Headline>()
        for (i in 0 until (lists.maxOfOrNull { it.size } ?: 0)) lists.forEach { l -> l.getOrNull(i)?.let(out::add) }
        return out
    }

    /** The titles of an RSS feed's items. */
    fun parseRss(xml: String): List<String> =
        Regex("<item[\\s>].*?</item>", RegexOption.DOT_MATCHES_ALL).findAll(xml).mapNotNull { item ->
            Regex("<title[^>]*>(.*?)</title>", RegexOption.DOT_MATCHES_ALL).find(item.value)?.groupValues?.get(1)
                ?.replace("<![CDATA[", "")?.replace("]]>", "")
                ?.let(::unescape)
                ?.replace(Regex("\\s+"), " ")?.trim()
                ?.takeIf { it.isNotEmpty() }
        }.toList()

    private fun unescape(s: String): String = s
        .replace(Regex("&#(\\d+);")) { it.groupValues[1].toIntOrNull()?.let { c -> String(Character.toChars(c)) } ?: it.value }
        .replace(Regex("&#x([0-9a-fA-F]+);")) { it.groupValues[1].toIntOrNull(16)?.let { c -> String(Character.toChars(c)) } ?: it.value }
        .replace("&quot;", "\"").replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">")
        .replace("&nbsp;", " ").replace("&amp;", "&")

    /**
     * Market prices from Yahoo Finance's public chart link (no key, but unofficial: a market that
     * can't be read is left out, and the panel hides when none can).
     */
    private val MARKETS = listOf(
        "TSX" to "^GSPTSE",
        "S&P 500" to "^GSPC",
        "Dow" to "^DJI",
        "KSE-100" to "^KSE",
        "Sensex" to "^BSESN",
        "Gold /oz" to "GC=F",
    )

    fun markets(): List<Market> = MARKETS.mapNotNull { (name, symbol) ->
        runCatching {
            val url = "https://query1.finance.yahoo.com/v8/finance/chart/" +
                java.net.URLEncoder.encode(symbol, "UTF-8") + "?range=1d&interval=1d"
            parseMarket(name, get(url, browser = true))
        }.getOrNull()
    }

    fun parseMarket(name: String, json: String): Market {
        val meta = JSONObject(json).getJSONObject("chart").getJSONArray("result").getJSONObject(0).getJSONObject("meta")
        val price = meta.getDouble("regularMarketPrice")
        val previous = meta.optDouble("chartPreviousClose", meta.optDouble("previousClose", price))
        return Market(name, price, if (previous > 0) (price - previous) / previous * 100 else 0.0)
    }

    private fun get(url: String, browser: Boolean = false): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 10_000
        conn.instanceFollowRedirects = true
        conn.setRequestProperty(
            "User-Agent",
            if (browser) "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
            else ChannelRepository.USER_AGENT,
        )
        return try {
            check(conn.responseCode == 200) { "HTTP ${conn.responseCode}" }
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }
}
