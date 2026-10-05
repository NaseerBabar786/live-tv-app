package com.appbazaar.app.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VersionsTest {
    @Test
    fun comparesNumberByNumber() {
        assertTrue(Versions.isNewer("1.10.0", "1.9.9"))
        assertTrue(Versions.isNewer("1.9.12", "1.9.10"))
        assertFalse(Versions.isNewer("1.9.10", "1.9.10"))
        assertFalse(Versions.isNewer("1.0", "1.0.0"))
        assertTrue(Versions.isNewer("0.4.3", "0.4.2-debug"))
    }
}
