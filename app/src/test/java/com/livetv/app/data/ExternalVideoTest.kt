package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class YouTubeTest {
    @Test
    fun readsVideoIds() {
        assertEquals("dQw4w9WgXcQ", YouTube.videoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", YouTube.videoId("https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=10"))
        assertEquals("dQw4w9WgXcQ", YouTube.videoId("https://youtu.be/dQw4w9WgXcQ?si=abc"))
        assertEquals("dQw4w9WgXcQ", YouTube.videoId("https://www.youtube.com/embed/dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", YouTube.videoId("https://youtube.com/shorts/dQw4w9WgXcQ"))
    }

    @Test
    fun ignoresOtherLinks() {
        assertNull(YouTube.videoId("https://www.youtube.com/@ARYDigitalasia"))
        assertNull(YouTube.videoId("https://example.com/watch?v=dQw4w9WgXcQ"))
        assertNull(YouTube.videoId("http://x/live/star.m3u8"))
        assertEquals(false, YouTube.isYouTube("http://x/live/star.m3u8"))
    }
}

class PakistaniLiveNamesTest {
    @Test
    fun matchesTheSameChannelUnderAnotherSpelling() {
        assertEquals(ChannelRepository.nameKey("92 News"), ChannelRepository.nameKey("92 News HD"))
        assertEquals(ChannelRepository.nameKey("BOL News"), ChannelRepository.nameKey("BOL NEWS"))
        assertEquals(true, ChannelRepository.nameKey("Aaj TV") in ChannelRepository.liveNames("Aaj News"))
        assertEquals(false, ChannelRepository.nameKey("Hum TV") in ChannelRepository.liveNames("Hum News"))
    }
}

class BilibiliTest {
    @Test
    fun readsBilibiliLinks() {
        assertEquals(true, Bilibili.isVideo("https://www.bilibili.tv/en/video/4791234567890"))
        assertEquals(true, Bilibili.isVideo("https://www.bilibili.tv/en/play/2001234/12345678"))
        assertEquals(false, Bilibili.isVideo("https://www.bilibili.tv/en"))
        assertEquals(false, Bilibili.isVideo("https://example.com/en/video/123"))
    }
}

class DailymotionTest {
    @Test
    fun readsVideoIds() {
        assertEquals("x8abcd1", Dailymotion.videoId("https://www.dailymotion.com/video/x8abcd1"))
        assertEquals("x8abcd1", Dailymotion.videoId("https://dai.ly/x8abcd1"))
        assertEquals("x8abcd1", Dailymotion.videoId("https://www.dailymotion.com/embed/video/x8abcd1?autoplay=1"))
        assertEquals(null, Dailymotion.videoId("https://www.dailymotion.com/arydigital"))
        assertEquals(null, Dailymotion.videoId("https://example.com/video/x8abcd1"))
    }
}

class VimeoTest {
    @Test
    fun readsVideoIds() {
        assertEquals("76979871", Vimeo.videoId("https://vimeo.com/76979871"))
        assertEquals("76979871", Vimeo.videoId("https://player.vimeo.com/video/76979871?h=abc"))
        assertEquals("76979871", Vimeo.videoId("https://vimeo.com/channels/staffpicks/76979871"))
        assertEquals(null, Vimeo.videoId("https://vimeo.com/channels/staffpicks"))
    }
}

class YouTubeNavigationTest {
    // Owner's rule (2026-10-07): no page of ours can take its window to YouTube or hand it to another app.
    @Test
    fun neverLeavesForYouTube() {
        assertEquals(true, YouTube.blocksNavigation("https", "www.youtube.com", mainFrame = true))
        assertEquals(true, YouTube.blocksNavigation("https", "m.youtube.com", mainFrame = true))
        assertEquals(true, YouTube.blocksNavigation("https", "youtu.be", mainFrame = true))
        assertEquals(true, YouTube.blocksNavigation("intent", null, mainFrame = true))
        assertEquals(true, YouTube.blocksNavigation("vnd.youtube", "abc", mainFrame = false))
        // YouTube's player itself (a frame inside our page), our own pages and our signals stay.
        assertEquals(false, YouTube.blocksNavigation("https", "www.youtube.com", mainFrame = false))
        assertEquals(false, YouTube.blocksNavigation("https", "tv.bulkbazaar.ca", mainFrame = true))
        assertEquals(false, YouTube.blocksNavigation("livetv", "fallback", mainFrame = true))
    }
}
