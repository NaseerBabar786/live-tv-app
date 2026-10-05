package com.iqraquran.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateVersionsTest {

    @Test
    fun readsIqraQuranTagsOnly() {
        assertEquals("1.0.2", UpdateVersions.versionFromTag("iqra-quran-v1.0.2"))
        assertNull(UpdateVersions.versionFromTag("v1.8.17-build90"))
        assertNull(UpdateVersions.versionFromTag("livecam-v0.4.3"))
        assertNull(UpdateVersions.versionFromTag("iqra-quran"))
        assertNull(UpdateVersions.versionFromTag("iqra-quran-v"))
    }

    @Test
    fun comparesNumberByNumber() {
        assertTrue(UpdateVersions.isNewer("1.0.10", "1.0.9"))
        assertFalse(UpdateVersions.isNewer("1.0.0", "1.0.0"))
    }
}
