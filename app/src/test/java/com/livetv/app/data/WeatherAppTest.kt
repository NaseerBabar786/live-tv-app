package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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
}
