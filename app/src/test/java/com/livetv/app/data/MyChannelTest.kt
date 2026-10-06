package com.livetv.app.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class MyChannelTest {
    private val tz = TimeZone.getTimeZone("America/Toronto")

    /** 2026-10-06 (a Tuesday) at [h]:[m] in Toronto. */
    private fun at(h: Int, m: Int, s: Int = 0): Long = Calendar.getInstance(tz).apply {
        clear()
        set(2026, Calendar.OCTOBER, 6, h, m, s)
    }.timeInMillis

    private fun config(slots: String, loop: String = "[]") = MyChannel.parse(
        JSONObject(
            """{"name":"Bazaar TV","tz":"America/Toronto","videos":[
              {"id":"a","title":"Film A","url":"https://x/a.mp4","secs":600},
              {"id":"b","title":"Film B","url":"https://x/b.mp4","secs":1200},
              {"id":"ad","title":"Ad","url":"https://x/ad.mp4","secs":20},
              {"id":"live","title":"Live","url":"https://x/live.m3u8","secs":0}],
              "slots":$slots,"loop":$loop}""",
        ),
    )

    @Test
    fun slotPlaysFromItsStartTime() {
        val c = config("""[{"day":"all","time":"20:00","video":"b"}]""")
        val now = MyChannel.whatsOn(c, at(20, 5)) as MyChannel.Now.Playing
        assertEquals("b", now.video.id)
        assertEquals(5 * 60_000L, now.offsetMs)
        assertEquals(at(20, 20), now.untilMs)
    }

    @Test
    fun nextSlotCutsTheOneBefore() {
        val c = config("""[{"day":"all","time":"20:00","video":"b"},{"day":"tue","time":"20:10","video":"a"}]""")
        assertEquals(at(20, 10), (MyChannel.whatsOn(c, at(20, 5)) as MyChannel.Now.Playing).untilMs)
        assertEquals("a", (MyChannel.whatsOn(c, at(20, 12)) as MyChannel.Now.Playing).video.id)
    }

    @Test
    fun aDatedSlotWinsOverARepeatingOne() {
        val c = config("""[{"day":"all","time":"20:00","video":"b"},{"day":"2026-10-06","time":"20:00","video":"a"}]""")
        assertEquals("a", (MyChannel.whatsOn(c, at(20, 1)) as MyChannel.Now.Playing).video.id)
        // Other weekdays don't match "mon".
        val monday = config("""[{"day":"mon","time":"20:00","video":"b"}]""")
        assertTrue(MyChannel.whatsOn(monday, at(20, 1)) is MyChannel.Now.OffAir)
    }

    @Test
    fun loopFillsTheGapsAndEndsAtTheNextSlot() {
        val c = config("""[{"day":"all","time":"21:00","video":"b"}]""", """["a","ad"]""")
        val now = MyChannel.whatsOn(c, at(20, 59, 50)) as MyChannel.Now.Playing
        assertTrue(now.untilMs <= at(21, 0))
        // Everyone is at the same place in the loop, which started again when yesterday's 9 PM show ended.
        val total = 620_000L
        val pos = Math.floorMod(at(20, 59, 50) - (at(21, 20) - 86_400_000L), total)
        assertEquals(if (pos < 600_000) "a" else "ad", now.video.id)
    }

    @Test
    fun loopStartsFromTheTopAfterASlot() {
        val c = config("""[{"day":"all","time":"20:00","video":"a"}]""", """["b","ad"]""")
        val now = MyChannel.whatsOn(c, at(20, 10, 30)) as MyChannel.Now.Playing
        assertEquals("b", now.video.id)
        assertEquals(30_000L, now.offsetMs)
    }

    @Test
    fun liveStreamPlaysUntilTheNextSlot() {
        val c = config("""[{"day":"all","time":"20:00","video":"live"},{"day":"all","time":"22:00","video":"a"}]""")
        val now = MyChannel.whatsOn(c, at(21, 0)) as MyChannel.Now.Playing
        assertEquals("live", now.video.id)
        assertEquals(at(22, 0), now.untilMs)
    }

    @Test
    fun offAirSaysWhatsNext() {
        val c = config("""[{"day":"all","time":"20:00","video":"a"}]""")
        val now = MyChannel.whatsOn(c, at(19, 0)) as MyChannel.Now.OffAir
        assertEquals("a", now.next?.id)
        assertEquals(at(20, 0), now.nextAt)
    }

    @Test
    fun tickerAndLogo() {
        val c = MyChannel.parse(JSONObject("""{"ticker":"Hello","tickerOn":true,"logoCorner":"bl","logo":"https://x/l.png","videos":[]}"""))
        assertEquals("Hello", c.ticker)
        assertEquals("bl", c.logoCorner)
        val off = MyChannel.parse(JSONObject("""{"ticker":"Hello","tickerOn":false,"videos":[]}"""))
        assertEquals(null, off.ticker)
    }

    @Test
    fun eachStationHasItsOwnAddress() {
        val films = MyChannel.parse(JSONObject("""{"name":"Bazaar Cinema","videos":[]}"""), "filmein")
        assertEquals("mychannel://filmein", films.channel.url)
        assertTrue(MyChannel.isMine(films.channel))
        assertEquals(MyChannel.URL, MyChannel.parse(JSONObject("""{"videos":[]}""")).channel.url)
        assertEquals(listOf("0", "00", "000", "00000", "000000", "0000000", "00000000", "9", "10", "11", "12"), MyChannel.STATIONS.map { it.dial })
        assertEquals(listOf(1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12), MyChannel.STATIONS.map { it.number })
        assertEquals(1, MyChannel.parse(JSONObject("""{"videos":[]}""")).channel.number)
        assertEquals(2, films.channel.number)
        assertEquals("https://tv.bulkbazaar.ca/channel/ytc.html?c=filmein&app=1", MyChannel.webPage(films.channel))
        assertEquals(null, MyChannel.webPage(MyChannel.parse(JSONObject("""{"videos":[]}""")).channel))
        val dramas = MyChannel.parse(JSONObject("""{"name":"Bazaar Dramas","videos":[]}"""), "dramas")
        assertEquals(11, dramas.channel.number)
        assertEquals("https://tv.bulkbazaar.ca/channel/ytc.html?c=dramas&app=1", MyChannel.webPage(dramas.channel))
        assertEquals("filmein", MyChannel.STATIONS.first { it.id == "english" }.backup)
        assertEquals("https://tv.bulkbazaar.ca/channel/ytc.html?c=dramas&app=1&v=188", MyChannel.pageFor(dramas.channel, 188))
        assertEquals("${MyChannel.BOLLYWOOD_URL}?app=1&v=188", MyChannel.pageFor(Channel(name = "Bazaar Hits", url = MyChannel.BOLLYWOOD_URL), 188))
        assertEquals(
            "https://tv.bulkbazaar.ca/channel/yt.html?app=1&v=abcdefghijk&name=Geo%20News&ver=188",
            MyChannel.pageFor(Channel(name = "Geo News", url = "https://www.youtube.com/watch?v=abcdefghijk"), 188),
        )
        assertEquals(null, MyChannel.pageFor(Channel(name = "A", url = "https://example.com/a.m3u8"), 188))
        assertEquals(null, MyChannel.pageFor(MyChannel.parse(JSONObject("""{"videos":[]}""")).channel, 188))
    }

    @Test
    fun ourLogosCarryAVersionSoTvsFetchTheNewPicture() {
        assertEquals("https://tv.bulkbazaar.ca/channel/logos/bazaar-tv.png?v=4", MyChannel.freshLogo("https://tv.bulkbazaar.ca/channel/logos/bazaar-tv.png"))
        assertEquals("https://x/l.png", MyChannel.freshLogo("https://x/l.png"))
        assertEquals("https://tv.bulkbazaar.ca/channel/logos/a.png?v=1", MyChannel.freshLogo("https://tv.bulkbazaar.ca/channel/logos/a.png?v=1"))
    }

    @Test
    fun weeklyShowPlaysTheNextEpisodeEachWeek() {
        // Tuesdays at 20:00 from 2026-09-22: episode 1 on Sep 22, 2 on Sep 29, 3 on Oct 6.
        val c = config("""[{"day":"tue","time":"20:00","video":"a","show":"Tuesday Drama","episodes":["a","b","live"],"since":"2026-09-22"}]""")
        val now = MyChannel.whatsOn(c, at(20, 1)) as MyChannel.Now.Playing
        assertEquals("live", now.video.id)
        assertEquals("Tuesday Drama", now.show)
        assertEquals(2, MyChannel.airingsBefore("tue", "2026-09-22", "2026-10-06"))
        // After the last episode it starts again from episode 1.
        assertEquals(3, MyChannel.airingsBefore("tue", "2026-09-22", "2026-10-13"))
        // Before its first date it plays episode 1.
        assertEquals(0, MyChannel.airingsBefore("tue", "2026-10-13", "2026-10-06"))
        assertEquals(5, MyChannel.airingsBefore("weekdays", "2026-10-05", "2026-10-12"))
        assertEquals(2, MyChannel.airingsBefore("weekend", "2026-10-02", "2026-10-05"))
    }
}
