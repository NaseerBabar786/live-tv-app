package com.iqraquran.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HifzTest {

    @Test
    fun planRepeatsEachAyahThenTheWhole() {
        val plan = Hifz.plan(112, 1, 2, perAyah = 3, wholeTimes = 2)
        assertEquals(listOf(1, 1, 1, 2, 2, 2, 1, 2, 1, 2), plan.map { it.ayah })
        assertEquals(listOf(1, 2, 3), plan.take(3).map { it.round })
        assertEquals(2, plan.last().round)
    }

    @Test
    fun singleAyahHasNoWholeRepeats() {
        assertEquals(5, Hifz.plan(1, 4, 4, perAyah = 5, wholeTimes = 3).size)
    }

    @Test
    fun groupsByAge() {
        val item = Hifz.Item(112, 1, 4, learnedOn = 100, lastReview = 100)
        assertEquals(Hifz.Group.Sabaq, Hifz.group(item, 100))
        assertEquals(Hifz.Group.Sabqi, Hifz.group(item, 105))
        assertEquals(Hifz.Group.Manzil, Hifz.group(item, 120))
    }

    @Test
    fun manzilComesBackLaterWhenRevisedWell() {
        var item = Hifz.Item(112, 1, 4, learnedOn = 0, lastReview = 100, level = 3)
        assertFalse(Hifz.isDue(item, 105)) // level 3 = every 7 days
        assertTrue(Hifz.isDue(item, 107))
        item = Hifz.reviewed(item, 107, good = true)
        assertEquals(4, item.level)
        assertFalse(Hifz.isDue(item, 107))
        item = Hifz.reviewed(item, 108, good = false)
        assertTrue(item.weak)
        assertTrue(Hifz.isDue(item, 109))
    }

    @Test
    fun juzBoundaries() {
        assertEquals(1, Hifz.juzOf(1, 1))
        assertEquals(1, Hifz.juzOf(2, 141))
        assertEquals(2, Hifz.juzOf(2, 142))
        assertEquals(30, Hifz.juzOf(78, 1))
        assertEquals(30, Hifz.juzOf(114, 6))
        assertEquals(29, Hifz.juzOf(77, 50))
    }

    @Test
    fun juzProgressCountsMemorizedAyahs() {
        // Pretend the Quran is surah 1 (7 ayahs) only, all in juz 1.
        val p = Hifz.juzProgress(listOf(Hifz.Item(1, 1, 7, 0, 0)), listOf(7))
        assertEquals(1f, p[0], 0.001f)
        assertEquals(0f, p[29], 0.001f)
    }

    @Test
    fun audioUrlsArePaddedNumbers() {
        assertEquals(
            "https://everyayah.com/data/Husary_128kbps/002255.mp3",
            Reciter.audioUrl("Husary_128kbps", 2, 255),
        )
    }
}
