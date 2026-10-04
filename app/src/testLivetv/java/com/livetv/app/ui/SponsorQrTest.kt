package com.livetv.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SponsorQrTest {
    @Test
    fun phoneAndWebsiteLinks() {
        assertEquals("tel:+14376026500", SponsorQr.link("(437) 602-6500"))
        assertEquals("tel:+923001234567", SponsorQr.link("+92 300 1234567"))
        assertEquals("https://bulkbazaar.ca", SponsorQr.link("bulkbazaar.ca"))
        assertEquals("https://x.com/a", SponsorQr.link("https://x.com/a"))
        assertNull(SponsorQr.link("Call us today"))
        assertNull(SponsorQr.link(""))
    }
}
