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
    fun noAdsOnBazaarTvWhileTheNewsIsOn() {
        MyChannel.update("main", JSONObject(
            """{"name":"Bazaar TV","tz":"America/Toronto","videos":[
              {"id":"a","title":"Film A","url":"https://x/a.mp4","secs":600},
              {"id":"news-headlines","title":"News","url":"https://x/n.mp4","secs":180}],
              "slots":[{"day":"all","time":"20:00","video":"news-headlines"}],"loop":["a"]}""",
        ))
        try {
            assertTrue(MyChannel.newsOn(MyChannel.URL, at(20, 1)))
            assertTrue(!MyChannel.newsOn(MyChannel.URL, at(20, 5)))
            // A break that would run into the news doesn't start.
            assertTrue(!MyChannel.newsOn(MyChannel.URL, at(19, 58)))
            assertTrue(MyChannel.newsOn(MyChannel.URL, at(19, 59, 30), aheadMs = 60_000L))
            // Other channels are not affected.
            assertTrue(!MyChannel.newsOn(MyChannel.ADS_URL, at(20, 1)))
        } finally {
            MyChannel.update("main", null)
        }
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
        // Everyone is at the same place in the loop, which started from the top at midnight.
        val total = 620_000L
        val pos = Math.floorMod(at(20, 59, 50) - at(0, 0), total)
        assertEquals(if (pos < 600_000) "a" else "ad", now.video.id)
    }

    @Test
    fun loopWaitsDuringASlotAndCarriesOn() {
        val c = config("""[{"day":"all","time":"20:00","video":"a"}]""", """["b","ad"]""")
        // At 20:00 the loop stops for the 10-minute slot; at 20:10:30 it is 30 s further on than at 20:00.
        val before = MyChannel.whatsOn(c, at(19, 59, 59)) as MyChannel.Now.Playing
        val after = MyChannel.whatsOn(c, at(20, 10, 0)) as MyChannel.Now.Playing
        assertEquals(before.video.id, after.video.id)
        assertEquals(before.offsetMs + 1_000L, after.offsetMs)
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
        assertEquals(1, MyChannel.parse(JSONObject("""{"videos":[]}""")).channel.number)
        assertEquals(21, films.channel.number)
        assertEquals("https://tv.bulkbazaar.ca/channel/ytc.html?c=filmein&app=1&brand=spark", MyChannel.webPage(films.channel))
        assertEquals(null, MyChannel.webPage(MyChannel.parse(JSONObject("""{"videos":[]}""")).channel))
        val dramas = MyChannel.parse(JSONObject("""{"name":"Bazaar Dramas","videos":[]}"""), "dramas")
        assertEquals(2, dramas.channel.number)
        assertEquals("Spark Dramas Urdu", dramas.channel.name)
        // Hindi dramas, a channel of their own (2026-10-08), with the free films as backup.
        val hindiDramas = MyChannel.parse(JSONObject("""{"name":"Bazaar Dramas Hindi","videos":[]}"""), "hindidramas")
        assertEquals(24, hindiDramas.channel.number)
        assertEquals("Spark Dramas Hindi", hindiDramas.channel.name)
        assertEquals("https://tv.bulkbazaar.ca/channel/ytc.html?c=hindidramas&app=1&brand=spark", MyChannel.webPage(hindiDramas.channel))
        assertEquals("filmein", MyChannel.STATIONS.first { it.id == "hindidramas" }.backup)
        // 5 (2026-10-08): Urdu poetry; its Hindi half is Kavi Sammelan, 27.
        val shayari = MyChannel.parse(JSONObject("""{"name":"Bazaar Shayari","videos":[]}"""), "shayari")
        assertEquals(5, shayari.channel.number)
        assertEquals("Urdu", shayari.channel.language)
        val kavi = MyChannel.parse(JSONObject("""{"name":"Bazaar Kavi Sammelan","videos":[]}"""), "kavi")
        assertEquals(27, kavi.channel.number)
        assertEquals("Spark Kavi Sammelan", kavi.channel.name)
        assertEquals("Spark Hindi", kavi.channel.group)
        assertEquals("Spark Shayari", shayari.channel.name)
        assertEquals("https://tv.bulkbazaar.ca/channel/ytc.html?c=shayari&app=1&brand=spark", MyChannel.webPage(shayari.channel))
        assertEquals("https://tv.bulkbazaar.ca/channel/ytc.html?c=dramas&app=1&brand=spark", MyChannel.webPage(dramas.channel))
        assertEquals("filmein", MyChannel.STATIONS.first { it.id == "english" }.backup)
        assertEquals("https://tv.bulkbazaar.ca/channel/ytc.html?c=dramas&app=1&brand=spark&v=188", MyChannel.pageFor(dramas.channel, 188))
        assertEquals("${MyChannel.BOLLYWOOD_URL}?app=1&brand=spark&v=188", MyChannel.pageFor(Channel(name = "Bazaar Hits", url = MyChannel.BOLLYWOOD_URL), 188))
        assertEquals(
            "https://tv.bulkbazaar.ca/channel/yt.html?app=1&v=abcdefghijk&name=Geo%20News&ver=188",
            MyChannel.pageFor(Channel(name = "Geo News", url = "https://www.youtube.com/watch?v=abcdefghijk"), 188),
        )
        assertEquals(null, MyChannel.pageFor(Channel(name = "A", url = "https://example.com/a.m3u8"), 188))
        assertEquals(null, MyChannel.pageFor(MyChannel.parse(JSONObject("""{"videos":[]}""")).channel, 188))
    }

    @Test
    fun everyChannelIsInItsLanguagesBlock() {
        val blocks = mapOf(MyChannel.URDU to 1..19, MyChannel.HINDI to 21..39, MyChannel.ENGLISH to 41..59, MyChannel.PUNJABI to 61..79)
        MyChannel.STATIONS.forEach { assertTrue("${it.id} ${it.number}", it.number in blocks.getValue(it.lang)) }
        assertTrue(MyChannel.HITS_NUMBER in blocks.getValue(MyChannel.HINDI))
        val numbers = MyChannel.STATIONS.map { it.number } + MyChannel.HITS_NUMBER
        assertEquals(numbers.size, numbers.toSet().size)
        assertEquals(MyChannel.STATIONS.map { it.number }.sorted(), MyChannel.STATIONS.map { it.number })
        // Only the rows of zeros from before 1.9.45 still dial a channel; a plain number is its block number.
        val dials = MyChannel.STATIONS.map { it.dial }.filter { it.isNotEmpty() }
        assertTrue(dials.all { d -> d.all { it == '0' } })
        assertEquals(dials.size, dials.toSet().size)
        assertEquals(null, MyChannel.byDial("9"))
        assertTrue(MyChannel.STATIONS.map { it.number }.max() < MyChannel.MTA_FIRST)
    }

    @Test
    fun aChannelsLanguageIsItsGroup() {
        val c = MyChannel.parse(JSONObject("""{"videos":[]}"""), "sur").channel
        assertEquals(MyChannel.PUNJABI, c.language)
        assertEquals("Spark Punjabi", c.group)
        assertEquals("Spark Music Punjabi", c.name)
    }

    @Test
    fun ourChannelsAreCalledSpark() {
        assertEquals("Spark TV One", MyChannel.brand("Bazaar TV One"))
        assertEquals("Spark Movies Hindi", MyChannel.brand("Bazaar Movies Hindi"))
        assertEquals("Latest Movies", MyChannel.brand("Latest Movies"))
        assertEquals("Bulk Bazaar Deals", MyChannel.brand("Bulk Bazaar Deals"))
        assertTrue(MyChannel.STATIONS.none { "Bazaar" in it.name })
        assertEquals("Spark Cinema", MyChannel.parse(JSONObject("""{"name":"Bazaar Cinema","videos":[]}"""), "filmein").channel.name)
    }

    @Test
    fun ourLogosCarryAVersionSoTvsFetchTheNewPicture() {
        assertEquals("https://tv.bulkbazaar.ca/channel/logos/spark-tv.png?v=9", MyChannel.freshLogo("https://tv.bulkbazaar.ca/channel/logos/bazaar-tv.png"))
        assertEquals("https://tv.bulkbazaar.ca/channel/logos/spark-latest.png?v=9", MyChannel.freshLogo("https://tv.bulkbazaar.ca/channel/logos/latest-movies.png"))
        assertEquals("https://x/l.png", MyChannel.freshLogo("https://x/l.png"))
        assertEquals("https://tv.bulkbazaar.ca/channel/logos/a.png?v=1", MyChannel.freshLogo("https://tv.bulkbazaar.ca/channel/logos/a.png?v=1"))
    }

    private val trailers = JSONObject(
        """{"videos":[{"id":"AAAAAAAAAAA","title":"T1","secs":120},{"id":"BBBBBBBBBBB","title":"T2","secs":60},{"id":"bad","secs":5}]}""",
    )

    @Test
    fun trailerListTakesItsEntrysPlace() {
        val saved = JSONObject(
            """{"name":"Bazaar TV","tz":"America/Toronto","videos":[
              {"id":"a","title":"Film A","url":"https://x/a.mp4","secs":600},
              {"id":"tr","title":"Upcoming trailers","url":"https://tv.bulkbazaar.ca/channel/trailers.json","secs":0,"kind":"trailers"}],
              "slots":[{"day":"all","time":"20:00","video":"tr"}],"loop":["a","tr","a"]}""",
        )
        val out = MyChannel.expand(saved) { url -> assertEquals("https://tv.bulkbazaar.ca/channel/trailers.json", url); trailers }
        assertEquals(listOf("a", "tr-AAAAAAAAAAA", "tr-BBBBBBBBBBB", "a"), (0 until 4).map { out.getJSONArray("loop").getString(it) })
        assertEquals(0, out.getJSONArray("slots").length())
        val c = MyChannel.parse(out)
        assertEquals("AAAAAAAAAAA", c.videos.first { it.id == "tr-AAAAAAAAAAA" }.youtube)
        // Not reachable: the entry is simply skipped, as older apps do.
        val offline = MyChannel.expand(saved) { null }
        assertEquals(listOf("a", "a"), (0 until offline.getJSONArray("loop").length()).map { offline.getJSONArray("loop").getString(it) })
    }

    @Test
    fun adsChannelPlaysPromosThenSponsors() {
        val saved = JSONObject(
            """{"name":"Bazaar Ads","tz":"America/Toronto","videos":[
              {"id":"promos","url":"https://tv.bulkbazaar.ca/media/app-promos.json","kind":"ads"},
              {"id":"sponsors","url":"https://tv.bulkbazaar.ca/channel/ads-sponsors.json","kind":"ads"},
              {"id":"advertise","title":"Advertise","url":"https://tv.bulkbazaar.ca/channel/media/ad-advertise-here.mp4","secs":15,"kind":"ad"}],
              "slots":[],"loop":["promos","sponsors","advertise"]}""",
        )
        val promos = JSONObject("""{"promos":[{"src":"cabletv-ad-6.mp4","secs":30},{"src":"bad.mp4","secs":3}]}""")
        val sponsors = JSONObject("""{"ads":[{"src":"https://cdn.example.com/shop.mp4","title":"Shop","secs":75}]}""")
        val out = MyChannel.expand(saved) { if (it.endsWith("app-promos.json")) promos else sponsors }
        val c = MyChannel.parse(out, "ads")
        // Too short an ad is left out; too long a one is cut at a minute (the ad length rule).
        assertEquals(listOf("promos-0", "sponsors-0", "advertise"), c.loop)
        val byId = c.videos.associateBy { it.id }
        assertEquals("https://tv.bulkbazaar.ca/media/cabletv-ad-6.mp4", byId["promos-0"]!!.url)
        assertEquals(60L, byId["sponsors-0"]!!.seconds)
        assertTrue(c.videos.all { it.isBreak })
        assertEquals(48, c.channel.number)
        assertEquals(MyChannel.ADS_URL, c.channel.url)
        assertEquals("Spark Ads", c.channel.name)
        // Round and round from midnight: 30 s promo, 60 s sponsor, 15 s advertise.
        val round = at(0, 0) + 50 * 105_000L
        assertEquals("sponsors-0", (MyChannel.whatsOn(c, round + 40_000) as MyChannel.Now.Playing).video.id)
        assertEquals("advertise", (MyChannel.whatsOn(c, round + 95_000) as MyChannel.Now.Playing).video.id)
    }

    @Test
    fun trailersPlayAsOneBlockOnOurPage() {
        val saved = JSONObject(
            """{"name":"Bazaar TV","tz":"America/Toronto","videos":[
              {"id":"a","title":"Film A","url":"https://x/a.mp4","secs":600},
              {"id":"tr","url":"https://tv.bulkbazaar.ca/channel/trailers.json","secs":0,"kind":"trailers"}],
              "slots":[],"loop":["a","tr"]}""",
        )
        val c = MyChannel.parse(MyChannel.expand(saved) { trailers })
        // The loop (13 minutes) starts at midnight: film A for 10 minutes, then the trailers for 3.
        val round = at(0, 0) + 100 * 780_000L
        assertEquals(null, MyChannel.block(c, round + 300_000))
        val first = MyChannel.block(c, round + 630_000)!!
        val second = MyChannel.block(c, round + 750_000)!!
        assertEquals(listOf("AAAAAAAAAAA", "BBBBBBBBBBB"), first.videos.map { it.youtube })
        assertEquals(round + 600_000, first.startMs)
        assertEquals(round + 780_000, first.endMs)
        // The same block (and page address) all the way through.
        assertEquals(first.startMs, second.startMs)
        assertEquals(first.endMs, second.endMs)
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

    @Test
    fun cardsComeUpOnTheBreaks() {
        val c = MyChannel.parse(
            JSONObject(
                """{"name":"Bazaar TV","tz":"America/Toronto","videos":[
                  {"id":"a","title":"Film A","url":"https://x/a.mp4","secs":600,"kind":"programme"},
                  {"id":"ad","title":"Ad","url":"https://x/ad.mp4","secs":20,"kind":"ad"}],
                  "slots":[{"day":"all","time":"21:00","video":"a","show":"Night Film"}],"loop":["a","ad"]}""",
            ),
        )
        val w = at(20, 0)
        val shown = (0 until 600).map { w + it * 1000L }.filter { MyChannel.cardAt(c, it) != null }
        assertTrue(shown.isNotEmpty())
        val first = shown.first()
        val on = MyChannel.whatsOn(c, first) as MyChannel.Now.Playing
        assertTrue(on.video.isBreak || first == w + 8 * 60_000L)
        // 20:00 starts an even 10 minutes: today's shows first, then what's next.
        assertTrue(MyChannel.cardAt(c, first)!!.today)
        assertEquals(false, MyChannel.cardAt(c, first + MyChannel.TODAY_CARD_MS)!!.today)
        assertEquals(null, MyChannel.cardAt(c, first + MyChannel.TODAY_CARD_MS + MyChannel.NEXT_CARD_MS))
        // One booked show left today: the next programmes fill the card up, in time order.
        val today = MyChannel.todaysShows(c, at(20, 0))
        assertEquals(listOf("Film A", "Night Film"), today.map { it.title })
        assertTrue(today.any { it.title == "Night Film" && it.booked })
        assertEquals(today.sortedBy { it.at }.map { it.at }, today.map { it.at })
        assertTrue(MyChannel.upNext(c, at(20, 0)).isNotEmpty())
    }

    @Test
    fun fillersTakeTurnsAndFitTheTimeLeft() {
        val c = MyChannel.parse(
            JSONObject(
                """{"name":"Bazaar TV","videos":[
                  {"id":"a","title":"Film","url":"https://x/a.mp4","secs":600},
                  {"id":"story","title":"Story","url":"https://x/story.mp4","secs":200},
                  {"id":"promo","title":"Promo","url":"https://x/promo.mp4","secs":30,"kind":"ad"},
                  {"id":"ad","title":"Ad","url":"https://x/ad.mp4","secs":20,"kind":"ad"}],
                  "loop":["a"],"fillers":["story","promo"]}""",
            ),
        )
        // A minute left: the story doesn't fit, the promo does.
        assertEquals("promo", MyChannel.filler(c, 60_000, at(20, 0))?.id)
        // Plenty left: they take turns by the minute, and never the one just played.
        assertEquals("story", MyChannel.filler(c, 600_000, at(20, 0))?.id)
        assertEquals("promo", MyChannel.filler(c, 600_000, at(20, 0), skip = "https://x/story.mp4")?.id)
        // No fillers set: the channel's ads.
        val noFillers = MyChannel.parse(JSONObject(c.let { """{"name":"T","videos":[
            {"id":"a","title":"Film","url":"https://x/a.mp4","secs":600},
            {"id":"ad","title":"Ad","url":"https://x/ad.mp4","secs":20,"kind":"ad"}],"loop":["a"]}""" }))
        assertEquals("ad", MyChannel.filler(noFillers, 60_000, at(20, 0))?.id)
    }
}
