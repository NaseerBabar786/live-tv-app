package com.livetv.app.extras

import com.livetv.app.data.Channel
import com.livetv.app.data.Guide
import com.livetv.app.data.News
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Calendar

class ExtrasTest {
    @Test
    fun cricketPicksTheLiveMatchWithPakistanOrIndia() {
        val json = """
            {"matches":[
              {"stage":"FINISHED","state":"POST","statusText":"Australia won","teams":[{"team":{"abbreviation":"AUS"},"score":"250"}]},
              {"stage":"RUNNING","state":"LIVE","statusText":"England need 40 runs","series":{"name":"County Championship"},
               "teams":[{"team":{"abbreviation":"SUR"},"score":"300"},{"team":{"abbreviation":"ESS"},"score":"261/7","scoreInfo":"60 ov"}]},
              {"stage":"RUNNING","state":"LIVE","statusText":"Pakistan chose to bat","series":{"name":"Asia Cup"},
               "teams":[{"team":{"abbreviation":"PAK"},"score":"145/3","scoreInfo":"18.2/20 ov"},{"team":{"abbreviation":"IND"},"score":null}]}
            ]}
        """.trimIndent()
        val s = Cricket.parse(json)!!
        assertEquals("Asia Cup", s.title)
        assertEquals("PAK 145/3 (18.2/20 ov)  v  IND", s.score)
        assertEquals("Pakistan chose to bat", s.status)
    }

    @Test
    fun cricketHidesWithoutALiveMatch() {
        assertNull(Cricket.parse("""{"matches":[{"stage":"FINISHED","teams":[]}]}"""))
        assertNull(Cricket.parse("""{"other":1}"""))
    }

    @Test
    fun nextAzanCountsDownAndWrapsToFajr() {
        val prayers = listOf(
            News.Prayer("Fajr", "05:30"), News.Prayer("Dhuhr", "13:10"), News.Prayer("Asr", "16:20"),
            News.Prayer("Maghrib", "18:55"), News.Prayer("Isha", "20:15"),
        )
        fun at(h: Int, m: Int) = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, m); set(Calendar.SECOND, 0) }.timeInMillis
        assertEquals("Zuhr in 1 h 10 min", nextAzanText(prayers, at(12, 0)))
        assertEquals("Asr in 25 min", nextAzanText(prayers, at(15, 55)))
        assertEquals("Fajr in 7 h", nextAzanText(prayers, at(22, 30)))
        assertNull(nextAzanText(emptyList(), at(12, 0)))
    }

    @Test
    fun guideTakesListingsInTheWindow() {
        val channel = Channel(name = "Geo News HD", url = "https://example.com/geo.m3u8")
        val epg = mapOf(
            Guide.key(channel.name) to listOf(
                Guide.Programme(1_000, 2_000, "Morning"),
                Guide.Programme(2_000, 5_000, "Khabarnama"),
                Guide.Programme(9_000, 9_500, "Late"),
            ),
        )
        val shown = GuideData.programmes(channel, epg, 1_500_000L, 6_000_000L)
        assertEquals(listOf("Morning", "Khabarnama"), shown.map { it.title })
        assertEquals(2_000_000L, shown[1].start)
        assertEquals(emptyList<GuideData.Prog>(), GuideData.programmes(channel.copy(name = "No Listings"), epg, 0, 10_000_000L))
    }
}
