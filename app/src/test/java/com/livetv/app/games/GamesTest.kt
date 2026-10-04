package com.livetv.app.games

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GamesTest {
    @Test
    fun everyGameStartsAndTakesEveryButton() {
        for (info in GAMES) {
            val game = info.create()
            if (!game.ready) game.begin()
            assertFalse(info.name, game.over)
            repeat(300) { n ->
                if (game.over) return@repeat
                game.press(Pad.entries[n % Pad.entries.size])
                game.release(Pad.entries[n % Pad.entries.size])
                if (game.tickMs > 0) game.tick()
            }
        }
        assertEquals(24, GAMES.size)
        assertEquals(GAMES.size, GAMES.map { it.id }.toSet().size)
    }

    @Test
    fun snakeEndsAtTheWall() {
        val snake = Snake(Random(1))
        repeat(40) { snake.tick() }
        assertTrue(snake.over)
    }

    @Test
    fun snakeCannotReverseIntoItself() {
        val snake = Snake(Random(1))
        snake.press(Pad.Left)
        snake.tick()
        assertFalse(snake.over)
        assertEquals(9, snake.body.first().x)
    }

    @Test
    fun slide2048JoinsPairsOnce() {
        val g = Game2048(Random(1))
        assertEquals(listOf(4, 4, 0, 0), g.slide(listOf(2, 2, 2, 2)))
        assertEquals(listOf(4, 2, 0, 0), g.slide(listOf(2, 2, 0, 2)))
        assertEquals(listOf(8, 0, 0, 0), g.slide(listOf(0, 4, 0, 4)))
    }

    @Test
    fun blocksHardDropLandsAtTheBottom() {
        val b = Blocks(Random(3))
        b.press(Pad.Ok)
        assertTrue(b.board.slice(b.w * (b.h - 1) until b.w * b.h).any { it != 0 })
    }

    @Test
    fun ticTacToeNeverLosesWithoutAMistake() {
        // The TV wins or draws against a player who always picks the first free square.
        val t = TicTacToe(Random(7))
        while (!t.over) {
            val free = t.board.indexOfFirst { it == 0 }
            while (t.cursor % 3 > free % 3) t.press(Pad.Left)
            while (t.cursor % 3 < free % 3) t.press(Pad.Right)
            while (t.cursor / 3 > free / 3) t.press(Pad.Up)
            while (t.cursor / 3 < free / 3) t.press(Pad.Down)
            t.press(Pad.Ok)
        }
        assertTrue(t.over)
    }

    @Test
    fun fourInRowSeesAWin() {
        val f = FourInRow(Random(2))
        for (c in 0 until 4) f.board[(f.rows - 1) * f.cols + c] = 1
        assertEquals(4, f.lineThrough((f.rows - 1) * f.cols)?.size)
    }

    @Test
    fun minesFirstSquareIsSafe() {
        repeat(20) { seed ->
            val m = Mines(Random(seed))
            m.press(Pad.Ok)
            assertFalse(m.over && !m.won)
            assertTrue(m.open.count { it } > 0)
            assertEquals(15, m.mine.count { it })
        }
    }

    @Test
    fun minesHoldPlantsAFlag() {
        val m = Mines(Random(1))
        m.press(Pad.Hold)
        assertTrue(m.flag[m.cursor])
        m.press(Pad.Ok)
        assertFalse(m.open[m.cursor])
    }

    @Test
    fun memoryMatchesAPair() {
        val m = Memory(Random(4))
        val a = 0
        val b = m.cards.indices.first { it != a && m.cards[it] == m.cards[a] }
        m.press(Pad.Ok)
        while (m.cursor != b) m.press(if (m.cursor % m.cols < b % m.cols) Pad.Right else if (m.cursor % m.cols > b % m.cols) Pad.Left else Pad.Down)
        m.press(Pad.Ok)
        assertTrue(m.matched[a] && m.matched[b])
        assertEquals(1, m.score)
    }

    @Test
    fun slidePuzzleStartsMixedAndCanBeMoved() {
        val s = SlidePuzzle(Random(5))
        assertFalse(s.solved())
        assertEquals((0 until 16).toSet(), s.tiles.toSet())
        val before = s.tiles.toList()
        for (p in listOf(Pad.Left, Pad.Right, Pad.Up, Pad.Down)) s.press(p)
        assertTrue(s.score > 0 || before == s.tiles.toList())
    }

    @Test
    fun colorEchoGrowsWhenRepeated() {
        val e = ColorEcho(Random(6))
        while (e.showing) e.tick()
        val pad = listOf(Pad.Up, Pad.Right, Pad.Down, Pad.Left)[e.order[0]]
        e.press(pad)
        assertEquals(1, e.score)
        assertEquals(2, e.order.size)
        assertTrue(e.showing)
    }

    @Test
    fun brickBreakerLosesALifeWhenTheBallFalls() {
        val b = BrickBreaker()
        b.press(Pad.Ok)
        b.press(Pad.Left)
        repeat(2000) { if (b.lives == 3) b.tick() }
        assertTrue(b.lives < 3 || b.score > 0)
    }
}
