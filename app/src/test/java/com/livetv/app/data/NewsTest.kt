package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NewsTest {
    @Test
    fun forecastSkipsToday() {
        val json = """{"current":{"temperature_2m":12.6,"apparent_temperature":11.2,"weather_code":0,"is_day":0},
            "daily":{"time":["2026-10-03","2026-10-04","2026-10-05"],"weather_code":[0,2,61],
            "temperature_2m_max":[18.4,19.1,15.0],"temperature_2m_min":[8.0,9.4,7.2],
            "precipitation_probability_max":[0,18,60]}}"""
        val f = News.parseForecast(json, "C")
        assertEquals(13, f.temperature)
        assertEquals(11, f.feelsLike)
        assertEquals(2, f.days.size)
        assertEquals(19, f.days[0].high)
        assertEquals(60, f.days[1].rain)
    }

    @Test
    fun prayerTimesDropTheZone() {
        val json = """{"data":{"timings":{"Fajr":"05:59","Sunrise":"07:15","Dhuhr":"13:06 (EDT)","Asr":"16:21",
            "Maghrib":"18:55","Isha":"20:13"}}}"""
        val p = News.parsePrayers(json)
        assertEquals(listOf("Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"), p.map { it.name })
        assertEquals("13:06", p[1].time)
    }

    @Test
    fun rupeeRates() {
        val r = News.parseRates("""{"result":"success","rates":{"CAD":1,"PKR":194.27,"INR":67.61}}""", "CAD")
        assertEquals(194.27, r.pkr!!, 0.001)
        assertEquals(67.61, r.inr!!, 0.001)
    }

    @Test
    fun rssTitles() {
        val xml = """<rss><channel><title>Feed name</title>
            <item><title><![CDATA[Talks end in a 'deadlock']]></title></item>
            <item><title>Prices &amp; wages &#8216;up&#8217;</title></item></channel></rss>"""
        assertEquals(listOf("Talks end in a 'deadlock'", "Prices & wages ‘up’"), News.parseRss(xml))
    }

    @Test
    fun marketChange() {
        val json = """{"chart":{"result":[{"meta":{"regularMarketPrice":101.0,"chartPreviousClose":100.0}}]}}"""
        val m = News.parseMarket("TSX", json)
        assertEquals(101.0, m.price, 0.0)
        assertTrue(m.change > 0.99 && m.change < 1.01)
    }
}
