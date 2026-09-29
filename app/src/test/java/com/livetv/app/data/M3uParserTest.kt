package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class M3uParserTest {

    @Test
    fun parsesAttributesAndName() {
        val text = """
            #EXTM3U
            #EXTINF:-1 tvg-id="news.1" tvg-logo="http://x/logo.png" group-title="News, World",Channel One
            http://example.com/one.m3u8
        """.trimIndent()

        val channels = M3uParser.parse(text)

        assertEquals(1, channels.size)
        val c = channels[0]
        assertEquals("Channel One", c.name)
        assertEquals("http://example.com/one.m3u8", c.url)
        assertEquals("http://x/logo.png", c.logo)
        assertEquals("News, World", c.group)
        assertEquals("news.1", c.tvgId)
    }

    @Test
    fun readsVlcOptionsAndExtGrp() {
        val text = """
            #EXTM3U
            #EXTINF:-1,Two
            #EXTGRP:Sports
            #EXTVLCOPT:http-user-agent=MyAgent/1.0
            #EXTVLCOPT:http-referrer=https://ref.example/
            https://example.com/two.m3u8
            #EXTINF:-1,Three
            https://example.com/three.m3u8
        """.trimIndent()

        val channels = M3uParser.parse(text)

        assertEquals(2, channels.size)
        assertEquals("Sports", channels[0].group)
        assertEquals("MyAgent/1.0", channels[0].userAgent)
        assertEquals("https://ref.example/", channels[0].referrer)
        // Options must not leak into the next entry.
        assertNull(channels[1].group)
        assertNull(channels[1].userAgent)
    }

    @Test
    fun fallsBackToUrlWhenNameMissing() {
        val channels = M3uParser.parse("#EXTM3U\nhttps://example.com/live/stream.m3u8?token=1\n")
        assertEquals("stream.m3u8", channels.single().name)
    }
}
