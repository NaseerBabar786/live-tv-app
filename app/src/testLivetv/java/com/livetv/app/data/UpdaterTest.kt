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

    @Test
    fun testBuildsReadAsTestsOfTheComingVersion() {
        assertEquals("1.11.0 test 5", Updater.label("1.11.0.5"))
        assertEquals("1.11.0", Updater.label("1.11.0"))
        assertTrue(Updater.isNewer("1.11.0.5", "1.10.27"))
        assertTrue(Updater.isNewer("1.11.1.1", "1.11.0.9"))
        assertTrue(Updater.isNewer("1.11.0", "1.10.22"))
        assertFalse(Updater.isNewer("1.11.0", "1.11.0.5"))
    }
}
