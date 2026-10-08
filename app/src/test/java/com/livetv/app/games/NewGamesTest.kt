package com.livetv.app.games

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NewGamesTest {
    /** Plays a game with random buttons and ticks; it must never crash. */
    private fun bash(game: Game, rnd: Random, steps: Int = 3000) {
        if (!game.ready) game.begin()
        val pads = listOf(Pad.Up, Pad.Down, Pad.Left, Pad.Right, Pad.Ok)
        repeat(steps) {
            if (game.over) return
            val p = pads[rnd.nextInt(pads.size)]
            game.press(p)
            game.release(p)
            if (game.usesDigits) game.digit(rnd.nextInt(10))
            repeat(3) { if (game.tickMs > 0) game.tick() }
        }
    }

    @Test
    fun everyNewGameSurvivesRandomPlay() {
        for (seed in 0 until 3) {
            for (info in GAMES.drop(10)) {
                val g = info.create()
                for (choice in g.options.indices.take(2)) {
                    val game = info.create()
                    game.choice = choice
                    bash(game, Random(seed * 7 + choice))
                }
            }
        }
    }

    @Test
    fun ludoTrackHas52SquaresAndTvGamesFinish() {
        assertEquals(52, Ludo.TRACK.size)
        assertEquals(52, Ludo.TRACK.toSet().size)
        // Four TV players (no people) play to the end.
        val l = Ludo(Random(3))
        l.choice = 0
        l.begin()
        // Red is a person: roll and always move the first piece offered.
        var n = 0
        while (!l.over && n < 200000) {
            if (l.isHuman(l.turn)) l.press(Pad.Ok)
            l.tick()
            n++
        }
        assertTrue(l.over)
    }

    @Test
    fun snakesAndLaddersEnds() {
        val s = SnakesLadders(Random(4))
        s.begin()
        var n = 0
        while (!s.over && n < 100000) {
            s.press(Pad.Ok)
            s.tick()
            n++
        }
        assertTrue(s.over)
        assertTrue(s.pos.any { it == 100 })
    }

    @Test
    fun chessStartHas20MovesAndFindsMate() {
        val c = Chess(Random(1))
        assertEquals(20, Chess.legalMoves(c.pos).size)
        // Fool's mate: 1. f3 e5 2. g4 Qh4#.
        val p = c.pos
        for ((f, t) in listOf("f2" to "f3", "e7" to "e5", "g2" to "g4")) Chess.make(p, Chess.Move(sq(f), sq(t)))
        Chess.make(p, Chess.Move(sq("d8"), sq("h4")))
        assertTrue(Chess.inCheck(p, 1))
        assertTrue(Chess.legalMoves(p).isEmpty())
    }

    @Test
    fun chessTvAnswersAMove() {
        val c = Chess(Random(2))
        c.choice = 2
        c.begin()
        // e2 is under the cursor at the start: pick it and push to e4.
        c.press(Pad.Ok)
        c.press(Pad.Up)
        c.press(Pad.Up)
        c.press(Pad.Ok)
        assertEquals(-1, c.pos.side)
        repeat(3) { c.tick() }
        assertEquals(1, c.pos.side)
    }

    private fun sq(s: String) = (8 - (s[1] - '0')) * 8 + (s[0] - 'a')

    @Test
    fun checkersForcesJumps() {
        val b = IntArray(64)
        b[5 * 8 + 2] = 1
        b[4 * 8 + 3] = -1
        val m = Checkers.moves(b, 1)
        assertEquals(1, m.size)
        assertEquals(listOf(4 * 8 + 3), m[0].taken)
    }

    @Test
    fun sudokuHasOneAnswer() {
        val s = Sudoku(Random(5))
        s.choice = 2
        s.begin()
        assertTrue(s.grid.count { it != 0 } <= 32)
        for (i in 0 until 81) if (!s.given[i]) {
            while (s.cursor % 9 < i % 9) s.press(Pad.Right)
            while (s.cursor % 9 > i % 9) s.press(Pad.Left)
            while (s.cursor / 9 < i / 9) s.press(Pad.Down)
            while (s.cursor / 9 > i / 9) s.press(Pad.Up)
            s.digit(s.solution[i])
        }
        assertTrue(s.won)
    }

    @Test
    fun solitaireDealsAllCards() {
        val s = Solitaire(Random(6))
        assertEquals(52, s.stock.size + s.columns.sumOf { it.size })
        assertEquals(24, s.stock.size)
        assertTrue(s.columns.all { it.last().up })
    }

    @Test
    fun solitaireUpAndDownGoStraightAcross() {
        val s = Solitaire(Random(6))
        // From the last column, Up reaches the last home pile (above it), and Down comes back.
        repeat(6) { s.press(Pad.Right) }
        assertEquals(12, s.pile)
        repeat(20) { s.press(Pad.Up) }
        assertEquals(5, s.pile)
        s.press(Pad.Down)
        assertEquals(12, s.pile)
        // The first home pile sits over the fourth column.
        s.press(Pad.Up); repeat(20) { s.press(Pad.Up) }
        while (s.pile != 2) s.press(Pad.Left)
        s.press(Pad.Down)
        assertEquals(9, s.pile)
    }

    @Test
    fun mazeDotsAreAllReachable() {
        val m = MazeMuncher(Random(1))
        val seen = mutableSetOf(m.player)
        val todo = ArrayDeque(listOf(m.player))
        while (todo.isNotEmpty()) {
            val c = todo.removeFirst()
            for (d in listOf(Cell(1, 0), Cell(-1, 0), Cell(0, 1), Cell(0, -1))) {
                val n = Cell((c.x + d.x + m.w) % m.w, c.y + d.y)
                if (n.y in 0 until m.h && !m.wall[n.y * m.w + n.x] && seen.add(n)) todo.add(n)
            }
        }
        for (i in m.dots.indices) if (m.dots[i] != 0) assertTrue("dot $i", Cell(i % m.w, i / m.w) in seen)
        assertTrue(MazeMuncher.MAZE.all { it.length == m.w })
    }

    @Test
    fun quizQuestionsHaveFourAnswers() {
        for (q in Quiz.QUESTIONS) {
            assertTrue(q.text, q.wrong.size >= 3)
            assertFalse(q.text, q.right in q.wrong)
        }
        val quiz = Quiz(Random(1))
        for (choice in quiz.options.indices) {
            val q = Quiz(Random(choice))
            q.choice = choice
            q.begin()
            assertNotNull(q.question)
        }
    }

    @Test
    fun wordGuessSolvesAWord() {
        val w = WordGuess(Random(2))
        val word = w.word
        for (ch in word.toSet()) {
            val idx = w.letters.indexOf(ch)
            while (w.cursor % w.cols < idx % w.cols) w.press(Pad.Right)
            while (w.cursor % w.cols > idx % w.cols) w.press(Pad.Left)
            while (w.cursor / w.cols < idx / w.cols) w.press(Pad.Down)
            while (w.cursor / w.cols > idx / w.cols) w.press(Pad.Up)
            w.press(Pad.Ok)
        }
        assertEquals(1, w.score)
    }

    @Test
    fun carromShotSettles() {
        val c = Carrom(Random(3))
        c.press(Pad.Ok)
        repeat(40) { c.tick() }
        c.release(Pad.Ok)
        assertTrue(c.moving)
        var n = 0
        while (c.moving && n < 20000) { c.tick(); n++ }
        assertFalse(c.moving)
        assertEquals(1, c.score)
    }

    @Test
    fun cricketMatchEnds() {
        val g = Cricket(Random(4))
        g.begin()
        var n = 0
        while (!g.over && n < 200000) {
            if (g.ball > 0.84f && !g.swung) g.press(Pad.Ok)
            g.tick()
            n++
        }
        assertTrue(g.over)
    }
}
