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
