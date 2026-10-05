package com.livetv.app.games

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.random.Random

/** Sudoku with a fresh puzzle each time that has exactly one answer. */
class Sudoku(private val rnd: Random = Random.Default) : Game() {
    val solution = IntArray(81)
    val grid = IntArray(81)
    val given = BooleanArray(81)
    var cursor = 40
        private set

    override val options = listOf("Easy", "Medium", "Hard")
    override val optionsTitle = "How hard?"
    override val usesDigits = true
    override val status: String get() = "Squares left: ${grid.count { it == 0 }}"

    override fun onBegin(choice: Int) {
        fill(solution, 0)
        val clues = listOf(40, 32, 27)[choice]
        solution.copyInto(grid)
        // Takes numbers away one at a time, putting each back if the puzzle stops having one answer.
        for (i in (0 until 81).shuffled(rnd)) {
            if (grid.count { it != 0 } <= clues) break
            val keep = grid[i]
            grid[i] = 0
            if (count(grid.copyOf(), 0, 2) != 1) grid[i] = keep
        }
        for (i in 0 until 81) given[i] = grid[i] != 0
        cursor = given.indexOfFirst { !it }.coerceAtLeast(0)
    }

    private fun ok(g: IntArray, i: Int, v: Int): Boolean {
        val r = i / 9
        val c = i % 9
        for (k in 0 until 9) {
            if (g[r * 9 + k] == v || g[k * 9 + c] == v) return false
        }
        val br = r / 3 * 3
        val bc = c / 3 * 3
        for (dr in 0 until 3) for (dc in 0 until 3) if (g[(br + dr) * 9 + bc + dc] == v) return false
        return true
    }

    private fun fill(g: IntArray, i: Int): Boolean {
        if (i == 81) return true
        for (v in (1..9).shuffled(rnd)) {
            if (ok(g, i, v)) {
                g[i] = v
                if (fill(g, i + 1)) return true
                g[i] = 0
            }
        }
        return false
    }

    /** How many answers the puzzle has, stopping at [limit]. */
    private fun count(g: IntArray, from: Int, limit: Int): Int {
        var i = from
        while (i < 81 && g[i] != 0) i++
        if (i == 81) return 1
        var n = 0
        for (v in 1..9) {
            if (ok(g, i, v)) {
                g[i] = v
                n += count(g, i + 1, limit - n)
                g[i] = 0
                if (n >= limit) return n
            }
        }
        return n
    }

    /** A number that clashes with another in its row, column or box. */
    fun clash(i: Int): Boolean {
        val v = grid[i]
        if (v == 0) return false
        grid[i] = 0
        val bad = !ok(grid, i, v)
        grid[i] = v
        return bad
    }

    override fun press(p: Pad) {
        if (over) return
        if (p == Pad.Ok) {
            if (!given[cursor]) set((grid[cursor] + 1) % 10)
        } else {
            cursor = moveCursor(cursor, p, 9, 9)
        }
    }

    override fun digit(d: Int) {
        if (over || given[cursor]) return
        set(d)
    }

    private fun set(v: Int) {
        grid[cursor] = v
        if (grid.contentEquals(solution)) {
            score = 1
            finish("Solved! Well done", won = true)
        }
    }
}

/** A playing card: rank 1 (ace) to 13 (king), suit 0 ♠ 1 ♥ 2 ♦ 3 ♣. */
data class Card(val rank: Int, val suit: Int, var up: Boolean = false) {
    val red get() = suit == 1 || suit == 2
    val label: String get() = listOf("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")[rank - 1] + "♠♥♦♣"[suit]
}

/**
 * Klondike solitaire, one card at a time from the deck. The cursor sits on a pile; on the seven
 * columns Up reaches further up the face-up cards to move several at once.
 */
class Solitaire(rnd: Random = Random.Default) : Game() {
    val stock = mutableListOf<Card>()
    val waste = mutableListOf<Card>()
    val homes = List(4) { mutableListOf<Card>() }
    val columns = List(7) { mutableListOf<Card>() }

    /** Pile under the cursor: 0 deck, 1 turned card, 2 to 5 home piles, 6 to 12 the columns. */
    var pile = 6
        private set
    /** How many cards from the bottom of a column are picked (1 = just the last). */
    var depth = 1
        private set
    var held = -1
        private set
    var heldCount = 0
        private set

    override val status: String get() = "Moves $score · Home ${homes.sumOf { it.size }} of 52"

    init {
        val deck = (0 until 52).map { Card(it % 13 + 1, it / 13) }.shuffled(rnd).toMutableList()
        for (c in 0 until 7) {
            for (k in 0..c) columns[c].add(deck.removeAt(deck.size - 1))
            columns[c].last().up = true
        }
        stock.addAll(deck)
    }

    private fun column(p: Int) = columns[p - 6]

    private fun faceUp(p: Int) = column(p).count { it.up }

    override fun press(p: Pad) {
        if (over) return
        when (p) {
            Pad.Left -> { pile = if (pile == 6) 12 else if (pile == 0) 5 else pile - 1; depth = 1 }
            Pad.Right -> { pile = if (pile == 12) 6 else if (pile == 5) 0 else pile + 1; depth = 1 }
            Pad.Up -> if (pile >= 6) {
                if (held < 0 && depth < faceUp(pile)) depth++ else { pile = (pile - 6).coerceAtMost(5); depth = 1 }
            }
            Pad.Down -> if (pile < 6) { pile = (pile + 6).coerceAtMost(12); depth = 1 } else if (depth > 1) depth--
            Pad.Ok -> ok()
            else -> Unit
        }
    }

    private fun ok() {
        if (pile == 0) {
            held = -1
            if (stock.isEmpty()) {
                waste.reversed().forEach { it.up = false; stock.add(it) }
                waste.clear()
            } else {
                waste.add(stock.removeAt(stock.size - 1).also { it.up = true })
            }
            score++
            return
        }
        if (held < 0) {
            val n = if (pile >= 6) depth else 1
            if (cardsAt(pile, n).isNotEmpty()) {
                held = pile
                heldCount = n
            }
            return
        }
        if (held == pile) {
            // OK again on the same pile sends its last card home if it can go there.
            if (heldCount == 1) {
                val card = cardsAt(pile, 1).firstOrNull()
                val h = homes.indexOfFirst { card != null && fitsHome(card, it) }
                if (h >= 0) moveCards(pile, 2 + h, 1)
            }
            held = -1
            return
        }
        val moving = cardsAt(held, heldCount)
        val fits = when {
            moving.isEmpty() -> false
            pile in 2..5 -> moving.size == 1 && fitsHome(moving[0], homes[pile - 2])
            pile >= 6 -> fitsColumn(moving[0], column(pile))
            else -> false
        }
        if (fits) moveCards(held, pile, heldCount)
        held = -1
        depth = 1
    }

    private fun fitsHome(card: Card, home: List<Card>) =
        if (home.isEmpty()) card.rank == 1 else home.last().suit == card.suit && home.last().rank == card.rank - 1

    private fun fitsColumn(card: Card, col: List<Card>) =
        if (col.isEmpty()) card.rank == 13 else col.last().up && col.last().red != card.red && col.last().rank == card.rank + 1

    private fun list(p: Int): MutableList<Card> = when (p) {
        1 -> waste
        in 2..5 -> homes[p - 2]
        else -> column(p)
    }

    private fun cardsAt(p: Int, n: Int): List<Card> {
        val l = list(p)
        if (l.size < n || (p >= 6 && faceUp(p) < n)) return emptyList()
        return l.subList(l.size - n, l.size).toList()
    }

    private fun moveCards(from: Int, to: Int, n: Int) {
        val src = list(from)
        val cards = src.subList(src.size - n, src.size).toList()
        repeat(n) { src.removeAt(src.size - 1) }
        list(to).addAll(cards)
        if (from >= 6) src.lastOrNull()?.up = true
        score++
        if (homes.all { it.size == 13 }) finish("You won in $score moves!", won = true)
    }
}

/**
 * Carrom on your own: pocket all nine coins (four white, four black and the red queen) in as
 * few shots as you can. Pocketing the striker costs a coin back to the middle.
 */
class Carrom(private val rnd: Random = Random.Default) : Game() {
    val size = 100f
    val pocketR = 5.2f
    val coinR = 2.3f
    val strikerR = 3.1f
    val baseline = 82f

    /** Each coin: x, y, vx, vy, kind (0 white, 1 black, 2 queen), in play (1) or pocketed (0). */
    val coins = mutableListOf<FloatArray>()
    var sx = 50f
        private set
    var sy = baseline
        private set
    private var svx = 0f
    private var svy = 0f
    /** Aim, in radians: straight up is -π/2. */
    var angle = (-Math.PI / 2).toFloat()
        private set
    var power = 0f
        private set
    var charging = false
        private set
    var moving = false
        private set
    var news = ""
        private set
    private var held = 0
    private var aimHeld = 0
    private var potted = false
    private var strikerPotted = false

    override val tickMs = 16L
    override val repeats = true
    override val status: String
        get() = "Shots $score · Coins left ${coins.count { it[5] == 1f }}" + if (news.isNotEmpty()) "\n$news" else ""

    init {
        val c = size / 2
        coins.add(floatArrayOf(c, c, 0f, 0f, 2f, 1f))
        for (k in 0 until 8) {
            val a = k * Math.PI.toFloat() / 4
            coins.add(floatArrayOf(c + cos(a) * coinR * 2.1f, c + sin(a) * coinR * 2.1f, 0f, 0f, (k % 2).toFloat(), 1f))
        }
    }

    override fun press(p: Pad) {
        if (over || moving) return
        when (p) {
            Pad.Left -> held = -1
            Pad.Right -> held = 1
            Pad.Up -> aimHeld = -1
            Pad.Down -> aimHeld = 1
            Pad.Ok -> if (!charging) { charging = true; power = 0f }
            else -> Unit
        }
    }

    override fun release(p: Pad) {
        when (p) {
            Pad.Left, Pad.Right -> held = 0
            Pad.Up, Pad.Down -> aimHeld = 0
            Pad.Ok -> if (charging && !moving) shoot()
            else -> Unit
        }
    }

    private fun shoot() {
        charging = false
        val speed = 0.6f + power * 3.4f
        svx = cos(angle) * speed
        svy = sin(angle) * speed
        moving = true
        potted = false
        strikerPotted = false
        news = ""
        score++
    }

    override fun tick() {
        if (over) return
        if (!moving) {
            sx = (sx + held * 0.6f).coerceIn(20f, 80f)
            angle = (angle + aimHeld * 0.025f).coerceIn(-Math.PI.toFloat() + 0.12f, -0.12f)
            if (charging) power = (power + 0.012f).let { if (it > 1f) 0f else it }
            return
        }
        // Small steps keep fast pieces from passing through each other.
        repeat(4) { physics(0.25f) }
        val still = hypot(svx, svy) < 0.02f && coins.all { it[5] == 0f || hypot(it[2], it[3]) < 0.02f }
        if (still) settle()
    }

    private fun physics(f: Float) {
        val bodies = mutableListOf<FloatArray>()
        val striker = floatArrayOf(sx, sy, svx, svy, 9f, if (strikerPotted) 0f else 1f)
        bodies.add(striker)
        bodies.addAll(coins)
        for (b in bodies) {
            if (b[5] == 0f) continue
            b[0] += b[2] * f
            b[1] += b[3] * f
            val r = if (b === striker) strikerR else coinR
            if (b[0] < r) { b[0] = r; b[2] = -b[2] * 0.8f }
            if (b[0] > size - r) { b[0] = size - r; b[2] = -b[2] * 0.8f }
            if (b[1] < r) { b[1] = r; b[3] = -b[3] * 0.8f }
            if (b[1] > size - r) { b[1] = size - r; b[3] = -b[3] * 0.8f }
            val fr = 1f - 0.012f * f
            b[2] *= fr
            b[3] *= fr
            for ((px, py) in listOf(0f to 0f, size to 0f, 0f to size, size to size)) {
                if (hypot(b[0] - px, b[1] - py) < pocketR) {
                    b[5] = 0f
                    b[2] = 0f
                    b[3] = 0f
                    if (b === striker) strikerPotted = true else potted = true
                }
            }
        }
        for (i in bodies.indices) for (j in i + 1 until bodies.size) {
            val a = bodies[i]
            val b = bodies[j]
            if (a[5] == 0f || b[5] == 0f) continue
            val ra = if (a === striker) strikerR else coinR
            val rb = coinR
            val dx = b[0] - a[0]
            val dy = b[1] - a[1]
            val d = hypot(dx, dy)
            if (d <= 0f || d >= ra + rb) continue
            val nx = dx / d
            val ny = dy / d
            val ma = if (a === striker) 1.6f else 1f
            val rel = (a[2] - b[2]) * nx + (a[3] - b[3]) * ny
            if (rel > 0f) {
                val imp = 2f * rel / (ma + 1f) * 0.95f
                a[2] -= imp * nx
                a[3] -= imp * ny
                b[2] += imp * ma * nx
                b[3] += imp * ma * ny
            }
            val push = (ra + rb - d) / 2f
            a[0] -= nx * push
            a[1] -= ny * push
            b[0] += nx * push
            b[1] += ny * push
        }
        sx = striker[0]
        sy = striker[1]
        svx = striker[2]
        svy = striker[3]
    }

    private fun settle() {
        moving = false
        if (strikerPotted) {
            // Foul: one pocketed coin comes back to the middle.
            val back = coins.firstOrNull { it[5] == 0f }
            if (back != null) {
                back[0] = size / 2
                back[1] = size / 2
                back[5] = 1f
            }
            news = "Foul! The striker went in"
        } else if (potted) {
            news = "Nice shot!"
        }
        sx = 50f
        sy = baseline
        svx = 0f
        svy = 0f
        angle = aimAtNearest()
        if (coins.none { it[5] == 1f }) finish("All coins in, in $score shots!", won = true)
    }

    /** Points the next shot at the nearest coin, as a starting point to adjust. */
    private fun aimAtNearest(): Float {
        val c = coins.filter { it[5] == 1f && it[1] < sy - 1f }.minByOrNull { hypot(it[0] - sx, it[1] - sy) }
            ?: return (-Math.PI / 2).toFloat()
        return atan2(c[1] - sy, c[0] - sx).coerceIn(-Math.PI.toFloat() + 0.12f, -0.12f)
    }
}

/** Guess the hidden word a letter at a time; seven wrong letters lose the round. */
class WordGuess(private val rnd: Random = Random.Default) : Game() {
    var topic = ""
        private set
    var word = ""
        private set
    val guessed = mutableSetOf<Char>()
    var wrong = 0
        private set
    var cursor = 0
        private set
    var rounds = 0
        private set
    private var used = mutableSetOf<String>()

    val letters = ('A'..'Z').toList()
    val cols = 9
    val maxWrong = 7

    override val status: String get() = "Words solved: $score · Wrong: $wrong of $maxWrong\nTopic: $topic"

    init {
        next()
    }

    private fun next() {
        val (t, w) = WORDS.filter { it.second !in used }.ifEmpty { used.clear(); WORDS }.let { it[rnd.nextInt(it.size)] }
        used.add(w)
        topic = t
        word = w
        guessed.clear()
        wrong = 0
    }

    fun solved() = word.all { !it.isLetter() || it in guessed }

    override fun press(p: Pad) {
        if (over) return
        if (p != Pad.Ok) {
            val rows = (letters.size + cols - 1) / cols
            cursor = moveCursor(cursor, p, cols, rows).coerceAtMost(letters.size - 1)
            return
        }
        val ch = letters[cursor]
        if (!guessed.add(ch)) return
        if (ch !in word) {
            wrong++
            if (wrong >= maxWrong) finish("The word was $word. You solved $score")
        } else if (solved()) {
            score++
            rounds++
            next()
        }
    }

    companion object {
        val WORDS = listOf(
            "Fruit" to "MANGO", "Fruit" to "BANANA", "Fruit" to "POMEGRANATE", "Fruit" to "WATERMELON", "Fruit" to "APRICOT", "Fruit" to "GUAVA",
            "City" to "KARACHI", "City" to "LAHORE", "City" to "ISLAMABAD", "City" to "TORONTO", "City" to "LONDON", "City" to "DELHI", "City" to "MUMBAI", "City" to "PESHAWAR", "City" to "DUBAI", "City" to "MAKKAH", "City" to "MADINAH",
            "Country" to "PAKISTAN", "Country" to "CANADA", "Country" to "INDIA", "Country" to "BANGLADESH", "Country" to "MALAYSIA", "Country" to "TURKEY", "Country" to "EGYPT", "Country" to "AUSTRALIA", "Country" to "JAPAN",
            "Food" to "BIRYANI", "Food" to "SAMOSA", "Food" to "PAKORA", "Food" to "KEBAB", "Food" to "NIHARI", "Food" to "HALWA", "Food" to "PARATHA", "Food" to "CHUTNEY", "Food" to "LASSI", "Food" to "JALEBI",
            "Animal" to "ELEPHANT", "Animal" to "GIRAFFE", "Animal" to "TIGER", "Animal" to "CAMEL", "Animal" to "PEACOCK", "Animal" to "DOLPHIN", "Animal" to "KANGAROO", "Animal" to "PENGUIN",
            "Sport" to "CRICKET", "Sport" to "HOCKEY", "Sport" to "FOOTBALL", "Sport" to "BADMINTON", "Sport" to "SQUASH", "Sport" to "TENNIS", "Sport" to "KABADDI",
            "At home" to "TELEVISION", "At home" to "KETTLE", "At home" to "PILLOW", "At home" to "CARPET", "At home" to "WINDOW", "At home" to "REMOTE",
            "Nature" to "MOUNTAIN", "Nature" to "RIVER", "Nature" to "RAINBOW", "Nature" to "DESERT", "Nature" to "VOLCANO", "Nature" to "THUNDER",
        )
    }
}
