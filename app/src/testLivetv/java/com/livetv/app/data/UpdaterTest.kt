package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdaterTest {

    @Test
    fun versionFromReleaseTag() {
        assertEquals("1.6.2", Updater.versionFromTag("v1.6.2-build31"))
        assertEquals("2.0", Updater.versionFromTag("v2.0"))
    }

    @Test
    fun comparesVersionsNumerically() {
        assertTrue(Updater.isNewer("1.6.3", "1.6.2"))
        assertTrue(Updater.isNewer("1.10.0", "1.9.9"))
        assertTrue(Updater.isNewer("2.0", "1.9.9"))
        assertFalse(Updater.isNewer("1.6.2", "1.6.2"))
        assertFalse(Updater.isNewer("1.6.1", "1.6.2"))
        assertFalse(Updater.isNewer("1.6", "1.6.0"))
    }
}
