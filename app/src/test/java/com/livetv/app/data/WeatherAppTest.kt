package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.json.JSONObject
import org.junit.Test

class WeatherAppTest {
    private val place = Location.Place(43.59, -79.64, "Mississauga", "CA", "Ontario")

    /** Two days of hours (48), 3 days, as Open-Meteo sends them with timezone=auto. */
    private fun json(now: String = "2026-10-07T19:15"): String {
        val dates = listOf("2026-10-07", "2026-10-08", "2026-10-09")
        val times = dates.flatMap { d -> (0..23).map { h -> "\"${d}T%02d:00\"".format(h) } }
        val temps = dates.indices.flatMap { (0..23).map { h -> 10 + h / 2 } }
        val codes = dates.indices.flatMap { (0..23).map { h -> if (h == 15) 95 else 2 } }
        val rain = dates.indices.flatMap { (0..23).map { h -> h * 4 } }
        val isDay = dates.indices.flatMap { (0..23).map { h -> if (h in 7..18) 1 else 0 } }
        return """{
          "current":{"time":"$now","temperature_2m":17.6,"apparent_temperature":16.2,"relative_humidity_2m":71,
            "weather_code":2,"is_day":0,"wind_speed_10m":14.3,"wind_direction_10m":310,"wind_gusts_10m":29.0,
            "pressure_msl":1015.4,"uv_index":0.0,"visibility":24140.0,"cloud_cover":40,"dew_point_2m":12.1},
          "hourly":{"time":[${times.joinToString(",")}],"temperature_2m":[${temps.joinToString(",")}],
            "apparent_temperature":[${temps.joinToString(",")}],"weather_code":[${codes.joinToString(",")}],
            "precipitation_probability":[${rain.joinToString(",")}],"is_day":[${isDay.joinToString(",")}],
            "wind_speed_10m":[${temps.joinToString(",")}]},
          "daily":{"time":["2026-10-07","2026-10-08","2026-10-09"],"weather_code":[95,3,61],
            "temperature_2m_max":[21.4,33.0,15.0],"temperature_2m_min":[9.2,12.0,8.0],
            "precipitation_probability_max":[80,10,60],"precipitation_sum":[30.0,0.0,4.2],"snowfall_sum":[0.0,0.0,0.0],
            "sunrise":["2026-10-07T07:19","2026-10-08T07:20","2026-10-09T07:21"],
            "sunset":["2026-10-07T18:44","2026-10-08T18:42","2026-10-09T18:40"],
            "uv_index_max":[4.1,5.0,2.0],"wind_speed_10m_max":[25.0,70.0,20.0]}
        }"""
    }

    @Test
    fun readsTheForecast() {
        val r = WeatherApp.parse(json(), place, fahrenheit = false)
        assertEquals(18, r.current.temperature)
        assertEquals(16, r.current.feelsLike)
        assertEquals("NW", r.current.windFrom)
        assertEquals(24, r.current.visibility)
        assertEquals(72, r.hours.size)
        assertEquals(3, r.days.size)
        assertEquals("7:19 AM", WeatherApp.clock(r.days[0].sunrise))
        assertEquals("C", r.unit)
    }

    @Test
    fun hoursStartAtTheCurrentHour() {
        val r = WeatherApp.parse(json(), place, fahrenheit = false)
        val hours = r.hoursFromNow(24)
        assertEquals("2026-10-07T19:00", hours.first().time)
        assertEquals(24, hours.size)
        assertEquals("7 PM", hours.first().label)
    }

    @Test
    fun partsOfTheDayStartWithTheOneWereIn() {
        val r = WeatherApp.parse(json(), place, fahrenheit = false)
        val parts = r.partsFromNow(5)
        assertEquals(listOf("Evening", "Night", "Morning", "Noon", "Afternoon"), parts.map { it.name })
        assertEquals("2026-10-07", parts[0].date)
        assertEquals("2026-10-08", parts[2].date)
        // The afternoon has the 3 PM thunderstorm.
        assertEquals(95, parts[4].code)
        assertEquals(5, r.partsOf("2026-10-08").size)
    }

    @Test
    fun warnsFromTheForecast() {
        val r = WeatherApp.parse(json(), place, fahrenheit = false)
        val titles = r.headsUp().map { it.title }
        assertTrue(titles.toString(), "Thunderstorms today" in titles)
        assertTrue(titles.toString(), "Heavy rain today" in titles)
        assertTrue(titles.toString(), "Heat tomorrow" in titles)
        assertTrue(titles.toString(), "Strong wind tomorrow" in titles)
    }

    @Test
    fun readsWeatherStories() {
        val xml = """<rss><channel><item><title>Rain on the way for Mississauga - CBC News</title>
            <link>https://news.google.com/rss/articles/abc</link><pubDate>Tue, 07 Oct 2026 12:00:00 GMT</pubDate>
            <source url="https://www.cbc.ca">CBC News</source></item>
            <item><title>Storm &amp; wind warning</title><link>https://x.example/2</link></item></channel></rss>"""
        val s = WeatherApp.parseNews(xml)
        assertEquals(2, s.size)
        assertEquals("Rain on the way for Mississauga", s[0].title)
        assertEquals("CBC News", s[0].source)
        assertTrue(s[0].published > 0)
        assertEquals("Storm & wind warning", s[1].title)
    }

    @Test
    fun readsUsWarnings() {
        val json = """{"features":[{"properties":{"event":"Tornado Warning","headline":"Tornado Warning until 8 PM","severity":"Extreme"}},
            {"properties":{"event":"Wind Advisory","description":"Gusts to 50 mph","severity":"Moderate"}}]}"""
        val a = WeatherApp.parseNws(json)
        assertEquals(2, a.size)
        assertTrue(a[0].severe)
        assertEquals("Gusts to 50 mph", a[1].text)
    }

    @Test
    fun namesTheDays() {
        assertEquals("Today", WeatherApp.dayName("2026-10-07", "2026-10-07"))
        assertEquals("Tomorrow", WeatherApp.dayName("2026-10-08", "2026-10-07"))
        assertEquals("Fri", WeatherApp.dayName("2026-10-09", "2026-10-07"))
        assertEquals("Oct 9", WeatherApp.shortDate("2026-10-09"))
        assertEquals("2026-11-01", WeatherApp.nextDate("2026-10-31"))
        assertEquals(57, WeatherApp.parseAir("""{"current":{"us_aqi":57}}"""))
    }

    /** Past days, 15-minute rain and pressure, as Open-Meteo sends them with past_days. */
    private fun withPast(rainNow: Boolean): String {
        val base = JSONObject(json())
        val daily = base.getJSONObject("daily")
        fun prepend(name: String, value: Any) {
            val old = daily.getJSONArray(name)
            val a = org.json.JSONArray().put(value)
            for (i in 0 until old.length()) a.put(old.get(i))
            daily.put(name, a)
        }
        prepend("time", "2026-10-06")
        prepend("weather_code", 3)
        prepend("temperature_2m_max", 18.4)
        prepend("temperature_2m_min", 6.2)
        prepend("precipitation_probability_max", 0)
        prepend("precipitation_sum", 0.0)
        prepend("snowfall_sum", 0.0)
        prepend("sunrise", "2026-10-06T07:18")
        prepend("sunset", "2026-10-06T18:46")
        prepend("uv_index_max", 3.0)
        prepend("wind_speed_10m_max", 20.0)
        val times = org.json.JSONArray()
        val rain = org.json.JSONArray()
        listOf("19:00", "19:15", "19:30", "19:45", "20:00", "20:15", "20:30").forEachIndexed { i, t ->
            times.put("2026-10-07T$t")
            rain.put(if (rainNow && i < 3) 0.6 else 0.0)
        }
        base.put("minutely_15", JSONObject().put("time", times).put("precipitation", rain))
        return base.toString()
    }

    @Test
    fun keepsThePastApart() {
        val r = WeatherApp.parse(withPast(rainNow = true), place, fahrenheit = false)
        assertEquals("2026-10-07", r.today?.date)
        assertEquals(18, r.yesterday?.high)
        assertEquals(4, r.calendar.size)
        assertEquals(3, WeatherApp.weekday("2026-10-07"))
        assertEquals(0, WeatherApp.weekday("2026-10-11"))
    }

    @Test
    fun saysWhenTheRainStops() {
        assertEquals("Rain stops within the next hour", WeatherApp.parse(withPast(rainNow = true), place, false).nowcast())
        assertEquals("No rain or snow in the next 2 hours", WeatherApp.parse(withPast(rainNow = false), place, false).nowcast())
        assertEquals(null, WeatherApp.parse(json(), place, false).nowcast())
    }

    @Test
    fun observations() {
        val r = WeatherApp.parse(json(), place, fahrenheit = false)
        // 18 °C with a 12 °C dew point: clouds from about 800 m.
        assertEquals("800" to "m", r.cloudCeiling())
        assertEquals("101.5" to "kPa", r.pressureText())
        assertEquals(310, r.current.windDegrees)
    }

    @Test
    fun readsBingStoriesWithPictures() {
        val xml = """<rss xmlns:News="https://www.bing.com/news/search?q=weather&amp;format=rss"><channel>
            <item><title>Frost warning for Ontario</title>
            <link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;tid=1&amp;url=https%3a%2f%2fwww.cbc.ca%2fnews%2ffrost&amp;c=1</link>
            <pubDate>Wed, 07 Oct 2026 12:00:00 GMT</pubDate><News:Source>CBC</News:Source>
            <News:Image>https://www.bing.com/th?id=OVFT.abc&amp;pid=News</News:Image></item></channel></rss>"""
        val s = WeatherApp.parseBing(xml)
        assertEquals(1, s.size)
        assertEquals("https://www.cbc.ca/news/frost", s[0].link)
        assertEquals("CBC", s[0].source)
        assertEquals("https://www.bing.com/th?id=OVFT.abc&pid=News&w=640&h=360&c=7", s[0].image)
    }

    @Test
    fun readsTheVideoList() {
        val v = WeatherApp.parseVideos("""{"videos":[{"id":"abcdefghijk","title":"Storm","channel":"The Weather Network","published":1791000000},{"id":"bad"}]}""")
        assertEquals(1, v.size)
        assertEquals("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", v[0].thumbnail)
        assertEquals(1791000000000L, v[0].published)
    }

    @Test
    fun hasAShortForecastToFallBackOn() {
        val full = WeatherApp.forecastUrl(place, false)
        val short = WeatherApp.forecastUrl(place, false, full = false)
        assertTrue(full, "past_days=14" in full && "minutely_15" in full)
        assertTrue(short, "forecast_days=10" in short && "past_days" !in short && "minutely_15" !in short)
    }
}
