package com.livetv.app

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** Free = every channel in 1+List; a Gold feature on Free is a minute's try (owner, 2026-10-08). */
class PlansTest {
    @Before
    fun packagesOn() {
        Plans.setFeatures(emptyMap())
        Plans.set(Plans.Tier.Free)
    }

    @After
    fun packagesOff() {
        Plans.endTry()
        Plans.closeTryOver()
        Plans.setFeatures(null)
        Plans.set(Plans.Tier.Gold)
    }

    @Test
    fun freeHasEveryChannelAndNoFeature() {
        assertTrue(Plans.has(Plans.Feature.AllChannels))
        Plans.Feature.entries.filter { it != Plans.Feature.AllChannels }.forEach { assertFalse(it.name, Plans.has(it)) }
    }

    @Test
    fun goldHasEverythingWhateverWasSaved() {
        Plans.setFeatures(mapOf(Plans.Tier.Gold to setOf(Plans.Feature.Browse)))
        Plans.set(Plans.Tier.Gold)
        Plans.Feature.entries.forEach { assertTrue(it.name, Plans.has(it)) }
    }

    @Test
    fun goldFeatureOpensForAMinuteThenSaysGold() {
        assertFalse(Plans.ask("Carousel mode", Plans.Feature.Carousel))
        assertTrue(Plans.canUse(Plans.Feature.Carousel))
        // Something else opened in the same minute joins the same try.
        val until = Plans.trying.value!!.until
        assertFalse(Plans.ask("Games", Plans.Feature.Games))
        assertEquals(until, Plans.trying.value!!.until)
        assertTrue(Plans.canUse(Plans.Feature.Games))
        Plans.endTry()
        assertFalse(Plans.canUse(Plans.Feature.Carousel))
        assertFalse(Plans.canUse(Plans.Feature.Games))
        assertEquals("Carousel mode", Plans.tryOver.value)
    }

    @Test
    fun noGoldMessageWhenGoldArrivedDuringTheTry() {
        Plans.ask("Weather", Plans.Feature.Weather)
        Plans.set(Plans.Tier.Gold)
        Plans.endTry()
        assertNull(Plans.tryOver.value)
    }

    @Test
    fun everythingOpenWhilePackagesAreOff() {
        Plans.setFeatures(null)
        assertFalse(Plans.ask("Themes", Plans.Feature.Themes))
        assertNull(Plans.trying.value)
    }
}
