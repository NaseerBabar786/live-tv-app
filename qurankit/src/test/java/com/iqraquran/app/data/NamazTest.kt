package com.iqraquran.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NamazTest {

    @Test
    fun thirtyNamazSurahsStartingWithFatihah() {
        assertEquals(30, Namaz.starterSurahs.size)
        assertEquals(30, Namaz.starterSurahs.toSet().size)
        assertEquals(1, Namaz.starterSurahs.first())
        assertEquals(114, Namaz.starterSurahs.last())
        assertTrue(listOf(103, 108, 112, 113, 114).all { it in Namaz.starterSurahs })
    }

    @Test
    fun everyStepNamesRealRecitations() {
        assertEquals(Namaz.recitations.size, Namaz.recitations.map { it.id }.toSet().size)
        Namaz.steps.flatMap { it.recitations }.forEach { Namaz.recitation(it) }
        // Every recitation to memorize is taught in some step.
        val taught = Namaz.steps.flatMap { it.recitations }.toSet()
        Namaz.memorizable.forEach { assertTrue(it.id, it.id in taught) }
    }

    @Test
    fun partOfAVerseStartsAtTheGivenWord() {
        val r = Namaz.recitation("rabbana_atina")
        assertFalse(r.wholeAyahs)
        val text = Namaz.arabicOf(r) { _, _ -> "وَمِنۡهُمۡ مَّنۡ يَّقُوۡلُ رَبَّنَآ اٰتِنَا" }
        assertEquals("رَبَّنَآ اٰتِنَا", text)
        assertTrue(Namaz.recitation("fatiha").wholeAyahs)
        assertEquals(7, Namaz.recitation("fatiha").ayahs.size)
    }

    @Test
    fun coversNeedsEveryAyah() {
        assertTrue(Namaz.covers(listOf(1..3, 4..5), 5))
        assertFalse(Namaz.covers(listOf(1..3), 5))
        assertFalse(Namaz.covers(emptyList(), 5))
    }

    @Test
    fun progressSurvivesSaving() {
        val p = NamazProgress(surahs = mapOf(1 to 20000L, 112 to 20001L), duas = mapOf("thana" to 20002L), extra = listOf(67, 36))
        val back = NamazProgress.fromJson(p.toJson())
        assertEquals(p, back)
        assertEquals(32, back.plan.size)
        assertEquals(listOf(67, 36), back.plan.drop(30))
        assertEquals(NamazProgress(), NamazProgress.fromJson(null))
        assertEquals(NamazProgress(), NamazProgress.fromJson("s=;d=;p="))
    }
}
