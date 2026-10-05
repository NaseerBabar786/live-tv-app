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

class Cp24ScreenTest {
    @Test
    fun firstOptionIsTheUsualOne() {
        val c = Cp24Screen.Choices(mapOf(Cp24Screen.Section.Middle to "Not an option"))
        assertEquals(Cp24Screen.TRAFFIC, c[Cp24Screen.Section.Middle])
        assertEquals(Cp24Screen.STORIES, c[Cp24Screen.Section.Band])
        assertEquals(Cp24Screen.HOURS, c[Cp24Screen.Section.Boxes])
        assertEquals(Cp24Screen.PRICES, c[Cp24Screen.Section.Crawl])
    }
}

class MyScreenTest {
    @Test
    fun spotsSkipNothingAndKnowTheSecondChannel() {
        val c = MyScreen.Choices(emptyMap())
        assertEquals(listOf(MyScreen.CLOCK, MyScreen.WEATHER, MyScreen.PRAYERS, MyScreen.MARKETS), c.spots)
        assertEquals(MyScreen.RIGHT, c[MyScreen.Section.Layout])
        assertEquals(0xFFFFC107L, c.accent)
        assertFalse(c.usesSecond)
        val picked = MyScreen.Choices(mapOf(MyScreen.Section.Spot1 to MyScreen.NOTHING, MyScreen.Section.Spot2 to MyScreen.SECOND))
        assertEquals(listOf(MyScreen.SECOND, MyScreen.PRAYERS, MyScreen.MARKETS), picked.spots)
        assertTrue(picked.usesSecond)
    }
}
