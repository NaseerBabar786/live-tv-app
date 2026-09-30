package com.livecam.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateVersionsTest {

    @Test
    fun readsLiveCamTagsOnly() {
        assertEquals("0.1.2", UpdateVersions.versionFromTag("livecam-v0.1.2"))
        assertNull(UpdateVersions.versionFromTag("v1.8.17-build90"))
        assertNull(UpdateVersions.versionFromTag("stream-player-plus-v1.0.1"))
        assertNull(UpdateVersions.versionFromTag("livecam-v"))
    }

    @Test
    fun comparesNumberByNumber() {
        assertTrue(UpdateVersions.isNewer("0.1.3", "0.1.2"))
        assertTrue(UpdateVersions.isNewer("0.10.0", "0.9.9"))
        assertTrue(UpdateVersions.isNewer("1.0", "0.9.9"))
        assertFalse(UpdateVersions.isNewer("0.1.2", "0.1.2"))
        assertFalse(UpdateVersions.isNewer("0.1.2", "0.1.10"))
        assertFalse(UpdateVersions.isNewer("0.1", "0.1.0"))
    }
}
