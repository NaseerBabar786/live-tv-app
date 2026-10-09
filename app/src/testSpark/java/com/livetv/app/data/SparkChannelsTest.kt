package com.livetv.app.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Spark TV (Google Play): only our own channels, and never a YouTube video. */
class SparkChannelsTest {
    @Test
    fun onlyThePlayChannels() {
        assertEquals(MyChannel.PLAY_STATIONS, MyChannel.STATIONS)
        assertEquals(listOf("pnews", "pclassics", "pcomedy", "psports", "ptravel", "pmusic", "pads"), MyChannel.STATIONS.map { it.id })
        assertTrue(MyChannel.STATIONS.none { it.youtube })
        assertEquals((1..7).toList(), MyChannel.STATIONS.map { it.number })
    }

    @Test
    fun noYouTubeVideoEverPlays() {
        val c = MyChannel.parse(
            JSONObject(
                """{"name":"Spark Classics","videos":[
                  {"id":"a","title":"Film","url":"https://archive.org/download/x/x.mp4","secs":600},
                  {"id":"y","title":"Song","url":"https://www.youtube.com/watch?v=AAAAAAAAAAA","secs":200},
                  {"id":"z","title":"Clip","url":"https://youtu.be/BBBBBBBBBBB","secs":100}],
                  "loop":["a","y","z"]}""",
            ),
            "pclassics",
        )
        assertEquals(listOf("a"), c.videos.map { it.id })
        assertTrue(c.videos.all { it.youtube == null })
        assertEquals("Spark Classics", c.channel.name)
        assertNull(MyChannel.webPage(c.channel))
    }

    @Test
    fun noSparkHits() {
        assertFalse(MyChannel.channels().any { it.url == MyChannel.BOLLYWOOD_URL })
        assertNull(MyChannel.byDial("0000"))
    }
}
