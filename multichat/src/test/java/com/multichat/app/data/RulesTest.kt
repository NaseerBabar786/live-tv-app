package com.multichat.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RulesTest {

    @Test
    fun readsUnreadCountFromTitle() {
        assertEquals(3, Rules.unreadFromTitle("(3) WhatsApp"))
        assertEquals(120, Rules.unreadFromTitle(" (120) WhatsApp"))
        assertEquals(0, Rules.unreadFromTitle("WhatsApp"))
        assertEquals(0, Rules.unreadFromTitle(null))
    }

    @Test
    fun quietHoursCrossMidnight() {
        val from = 22 * 60
        val to = 7 * 60
        assertTrue(Rules.inQuietHours(true, from, to, 23 * 60 + 30))
        assertTrue(Rules.inQuietHours(true, from, to, 3 * 60))
        assertFalse(Rules.inQuietHours(true, from, to, 7 * 60))
        assertFalse(Rules.inQuietHours(true, from, to, 12 * 60))
        assertFalse(Rules.inQuietHours(false, from, to, 23 * 60))
        assertTrue(Rules.inQuietHours(true, 12 * 60, 13 * 60, 12 * 60 + 30))
        assertFalse(Rules.inQuietHours(true, 12 * 60, 13 * 60, 13 * 60))
        assertTrue(Rules.inQuietHours(true, 9 * 60, 9 * 60, 15 * 60))
    }

    @Test
    fun clockAndInitials() {
        assertEquals("22:30", Rules.clock(22 * 60 + 30))
        assertEquals("07:05", Rules.clock(7 * 60 + 5))
        assertEquals("BB", Rules.initials("Bulk Bazaar"))
        assertEquals("P", Rules.initials("personal"))
        assertEquals("?", Rules.initials("  "))
    }

    @Test
    fun pinIsHashedAndChecked() {
        assertTrue(Rules.isValidPin("1234"))
        assertFalse(Rules.isValidPin("12a4"))
        assertFalse(Rules.isValidPin("123"))
        val salt = Rules.newSalt()
        val hash = Rules.hashPin("2580", salt)
        assertNotEquals("2580", hash)
        assertTrue(Rules.pinMatches("2580", salt, hash))
        assertFalse(Rules.pinMatches("2581", salt, hash))
    }

    @Test
    fun readsOnlyMultiChatTags() {
        assertEquals("1.0.1", UpdateVersions.versionFromTag("multichat-v1.0.1"))
        assertNull(UpdateVersions.versionFromTag("livecam-v0.4.3"))
        assertNull(UpdateVersions.versionFromTag("multichat-pc"))
        assertTrue(UpdateVersions.isNewer("1.0.10", "1.0.9"))
    }
}
