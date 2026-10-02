package com.livetv.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LinkNameTest {
    @Test
    fun usesTheFileName() {
        assertEquals("LiveTV", linkName("https://tv.bulkbazaar.ca/LiveTV.m3u"))
        assertEquals("My Channels", linkName(" https://example.com/lists/My%20Channels.m3u8 "))
    }

    @Test
    fun usesTheSiteForGenericFileNames() {
        assertEquals("provider.com", linkName("http://www.provider.com/get.php?username=a&password=b"))
        assertEquals("example.org", linkName("https://example.org/playlist.m3u"))
        assertEquals("example.org", linkName("https://example.org/"))
    }

    @Test
    fun nullWhenTheLinkIsUnreadable() {
        assertNull(linkName(""))
        assertNull(linkName("https://"))
        assertNull(linkName("not a link"))
    }
}
