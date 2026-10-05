package com.livetv.app.ui

import com.livetv.app.sponsor.siteUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SponsorSiteTest {
    @Test
    fun websiteAddresses() {
        assertEquals("https://bulkbazaar.ca", siteUrl("bulkbazaar.ca"))
        assertEquals("https://www.khanmeat.ca/shop", siteUrl(" www.khanmeat.ca/shop "))
        assertEquals("http://x.com", siteUrl("http://x.com"))
        assertNull(siteUrl("416-555-0100"))
        assertNull(siteUrl("Call us today"))
        assertNull(siteUrl(""))
    }
}
