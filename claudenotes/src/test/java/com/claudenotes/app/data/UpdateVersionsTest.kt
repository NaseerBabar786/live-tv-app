package com.claudenotes.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateVersionsTest {

    @Test
    fun readsVersionFromReleaseTitle() {
        assertEquals("1.0.2", UpdateVersions.versionFromTitle("Notes for Claude 1.0.2"))
        assertNull(UpdateVersions.versionFromTitle("Live TV Max 1.0.0"))
        assertNull(UpdateVersions.versionFromTitle("Notes for Claude (newest)"))
    }

    @Test
    fun comparesNumberByNumber() {
        assertTrue(UpdateVersions.isNewer("1.10.0", "1.9.9"))
        assertFalse(UpdateVersions.isNewer("1.0.0", "1.0.0"))
        assertFalse(UpdateVersions.isNewer("0.9", "1.0.0"))
    }
}
