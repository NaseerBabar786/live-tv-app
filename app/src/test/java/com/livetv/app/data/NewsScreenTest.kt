package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NewsScreenTest {
    @Test
    fun defaultsAreTheUsualScreen() {
        val c = NewsScreen.Choices(emptyMap(), NewsScreen.Bottom.Both)
        assertEquals(NewsScreen.Panel.Clock, c[NewsScreen.Slot.RightTop])
        assertEquals(NewsScreen.Panel.Prayers, c[NewsScreen.Slot.RightBottom])
        assertEquals(NewsScreen.Panel.Stories, c[NewsScreen.Slot.Under])
        assertFalse(c.usesSecond)
        NewsScreen.Slot.entries.forEach { assertTrue(it.default in it.choices) }
        val withSecond = c.copy(panels = mapOf(NewsScreen.Slot.RightMiddle to NewsScreen.Panel.Second))
        assertTrue(withSecond.usesSecond)
    }
}
