package com.iqraquran.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QaidaTest {

    @Test
    fun hasTheTwentyNineLetters() {
        assertEquals(29, Qaida.letters.size)
        assertEquals(29, Qaida.letters.map { it.char }.toSet().size)
    }

    @Test
    fun lessonsAreNumberedInOrder() {
        assertEquals((1..12).toList(), Qaida.lessons.map { it.id })
        Qaida.lessons.filter { it.kind != Qaida.Kind.Surahs }.forEach { lesson ->
            // A quiz needs at least four different cards to choose from.
            assertTrue(lesson.en, lesson.items.distinctBy { it.text }.size >= 4)
            assertTrue(lesson.en, lesson.items.all { it.say.isNotBlank() })
        }
    }

    @Test
    fun zabarPutsTheMarkOnEachLetter() {
        val zabar = Qaida.lesson(3).items
        assertEquals("بَ", zabar.first().text)
        assertTrue(zabar.all { it.text.endsWith("َ") })
    }

    @Test
    fun nonJoiningLettersHaveTwoShapes() {
        val alif = Qaida.letters.first()
        assertEquals(2, Qaida.shapes(alif).size)
        assertEquals(4, Qaida.shapes(Qaida.letters[1]).size)
    }

    @Test
    fun starsForMistakes() {
        assertEquals(3, Qaida.stars(0))
        assertEquals(3, Qaida.stars(1))
        assertEquals(2, Qaida.stars(3))
        assertEquals(1, Qaida.stars(9))
    }
}
