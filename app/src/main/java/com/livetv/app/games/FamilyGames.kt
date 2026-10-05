package com.livetv.app.games

import kotlin.random.Random

/** Who plays: options shared by the board games played by passing the remote. */
private val FAMILY_OPTIONS = listOf("You vs the TV", "2 people", "3 people", "4 people")

/**
 * Ludo for up to four: Red, Green, Yellow and Blue. People take turns with the remote; any
 * colour without a person is played by the TV.
 */
class Ludo(private val rnd: Random = Random.Default) : Game() {
    val names = listOf("Red", "Green", "Yellow", "Blue")

    /** Each colour's four pieces: -1 in the yard, 0 to 50 round the board, 51 to 55 the home lane, 56 home. */
    val pos = Array(4) { IntArray(4) { -1 } }
    var turn = 0
        private set
    var dice = 0
        private set
    var rolled = false
        private set
    var selected = 0
        private set
    var humans = 1
        private set
    var news = ""
        private set
    private var wait = 0

    override val options = listOf("You vs 3 TV players", "2 people + 2 TV", "3 people + 1 TV", "4 people")
    override val optionsTitle = "Who is playing?"
    override val tickMs = 450L
    override val status: String
        get() = when {
            !isHuman(turn) -> "${names[turn]} (TV) is playing"
            !rolled -> "${names[turn]}: press OK to roll"
            movable().isEmpty() -> "${names[turn]} rolled $dice: no move"
            else -> "${names[turn]} rolled $dice: pick a piece"
        } + if (news.isNotEmpty()) "\n$news" else ""

    override fun onBegin(choice: Int) {
        humans = choice + 1
        wait = 1
    }

    fun isHuman(c: Int) = c < humans

    /** Where piece [p] of colour [c] is on the shared 52-square track. */
    fun square(c: Int, p: Int) = (p + 13 * c) % 52

    private fun canMove(c: Int, i: Int, d: Int): Boolean {
        val p = pos[c][i]
        return when {
            p == -1 -> d == 6
            p == 56 -> false
            else -> p + d <= 56
        }
    }

    fun movable(): List<Int> = if (!rolled) emptyList() else (0 until 4).filter { canMove(turn, it, dice) }

    private fun roll() {
        dice = rnd.nextInt(6) + 1
        rolled = true
        val m = movable()
        if (m.isNotEmpty()) selected = m.first()
        wait = if (m.isEmpty()) 3 else if (isHuman(turn)) 0 else 2
    }

    override fun press(p: Pad) {
        if (over || !isHuman(turn) || wait > 0) return
        if (!rolled) {
            if (p == Pad.Ok) roll()
            return
        }
        val m = movable()
        if (m.isEmpty()) return
        when (p) {
            Pad.Right, Pad.Down -> selected = m[(m.indexOf(selected) + 1).mod(m.size)]
            Pad.Left, Pad.Up -> selected = m[(m.indexOf(selected) - 1).mod(m.size)]
            Pad.Ok -> if (selected in m) move(turn, selected)
            else -> Unit
        }
    }

    override fun tick() {
        if (over) return
        if (wait > 0) {
            wait--
            return
        }
        when {
            !rolled && !isHuman(turn) -> roll()
            rolled && movable().isEmpty() -> nextTurn()
            rolled && !isHuman(turn) -> move(turn, tvPick())
        }
    }

    /** What would be taken if colour [c] moved piece [i] by the dice. */
    private fun captures(c: Int, i: Int): List<Pair<Int, Int>> {
        val p = pos[c][i]
        val np = if (p == -1) 0 else p + dice
        if (np > 50) return emptyList()
        val sq = square(c, np)
        if (sq in SAFE) return emptyList()
        val out = mutableListOf<Pair<Int, Int>>()
        for (o in 0 until 4) if (o != c) for (j in 0 until 4) {
            val op = pos[o][j]
            if (op in 0..50 && square(o, op) == sq) out.add(o to j)
        }
        return out
    }

    private fun move(c: Int, i: Int) {
        val caught = captures(c, i)
        val p = pos[c][i]
        val np = if (p == -1) 0 else p + dice
        pos[c][i] = np
        caught.forEach { (o, j) -> pos[o][j] = -1 }
        news = when {
            caught.isNotEmpty() -> "${names[c]} sent ${names[caught.first().first]} back to the yard!"
            np == 56 -> "${names[c]} brought a piece home"
            else -> ""
        }
        if (pos[c].all { it == 56 }) {
            if (isHuman(c)) score = 1
            finish(if (isHuman(c)) "${names[c]} wins!" else "${names[c]} (TV) wins", won = isHuman(c))
            return
        }
        if (dice == 6 || caught.isNotEmpty() || np == 56) {
            rolled = false
            wait = if (isHuman(c)) 0 else 2
        } else {
            nextTurn()
        }
    }

    private fun nextTurn() {
        turn = (turn + 1) % 4
        rolled = false
        wait = if (isHuman(turn)) 0 else 2
    }

    /** The TV takes a piece if it can, then gets a piece home, then out of the yard, then the furthest. */
    private fun tvPick(): Int = movable().maxBy { i ->
        val p = pos[turn][i]
        val np = if (p == -1) 0 else p + dice
        var v = np
        if (captures(turn, i).isNotEmpty()) v += 200
        if (np == 56) v += 120
        if (p == -1) v += 90
        if (np <= 50 && square(turn, np) in SAFE) v += 30
        v * 10 + rnd.nextInt(10)
    }

    companion object {
        /** The coloured start squares and the star squares, where nobody can be taken. */
        val SAFE = setOf(0, 8, 13, 21, 26, 34, 39, 47)

        /** The 52 track squares on a 15 × 15 board, from Red's start, clockwise. */
        val TRACK: List<Cell> = buildList {
            for (x in 1..5) add(Cell(x, 6))
            for (y in 5 downTo 0) add(Cell(6, y))
            add(Cell(7, 0)); add(Cell(8, 0))
            for (y in 1..5) add(Cell(8, y))
            for (x in 9..14) add(Cell(x, 6))
            add(Cell(14, 7)); add(Cell(14, 8))
            for (x in 13 downTo 9) add(Cell(x, 8))
            for (y in 9..14) add(Cell(8, y))
            add(Cell(7, 14)); add(Cell(6, 14))
            for (y in 13 downTo 9) add(Cell(6, y))
            for (x in 5 downTo 0) add(Cell(x, 8))
            add(Cell(0, 7)); add(Cell(0, 6))
        }

        /** A point on the board turned a quarter clockwise [k] times (each colour is Red's corner turned). */
        fun turnPoint(x: Float, y: Float, k: Int): Pair<Float, Float> {
            var px = x
            var py = y
            repeat(k) {
                val nx = 15f - py
                py = px
                px = nx
            }
            return px to py
        }
    }

    /** Centre of piece [i] of colour [c], in board squares (0 to 15). */
    fun place(c: Int, i: Int): Pair<Float, Float> {
        val p = pos[c][i]
        return when {
            p == -1 -> turnPoint(listOf(2f, 4f, 2f, 4f)[i], listOf(2f, 2f, 4f, 4f)[i], c)
            p <= 50 -> TRACK[square(c, p)].let { it.x + 0.5f to it.y + 0.5f }
            p < 56 -> turnPoint(p - 50 + 0.5f, 7.5f, c)
            else -> turnPoint(6.6f + 0.6f * (i % 2), 7.2f + 0.6f * (i / 2), c)
        }
    }
}

/** Snakes and ladders on a 1 to 100 board. */
class SnakesLadders(private val rnd: Random = Random.Default) : Game() {
    var players = 2
        private set
    var humans = 1
        private set
    var pos = IntArray(2)
        private set
    var turn = 0
        private set
    var dice = 0
        private set
    var news = ""
        private set
    private var steps = 0
    private var wait = 0
    private var busy = false

    override val options = FAMILY_OPTIONS
    override val optionsTitle = "Who is playing?"
    override val tickMs = 260L
    val names = listOf("Red", "Blue", "Green", "Yellow")
    override val status: String
        get() = (if (!isHuman(turn)) "${names[turn]} (TV) is playing" else if (busy) "${names[turn]} rolled $dice" else "${names[turn]}: press OK to roll") +
            if (news.isNotEmpty()) "\n$news" else ""

    override fun onBegin(choice: Int) {
        players = if (choice == 0) 2 else choice + 1
        humans = if (choice == 0) 1 else players
        pos = IntArray(players)
    }

    fun isHuman(p: Int) = p < humans

    override fun press(p: Pad) {
        if (over || busy || !isHuman(turn) || p != Pad.Ok) return
        roll()
    }

    private fun roll() {
        dice = rnd.nextInt(6) + 1
        busy = true
        news = ""
        if (pos[turn] + dice > 100) {
            news = "${names[turn]} needs exactly ${100 - pos[turn]}"
            steps = 0
            wait = 3
        } else {
            steps = dice
        }
    }

    override fun tick() {
        if (over) return
        if (wait > 0) {
            wait--
            if (wait == 0 && steps == 0 && busy) endMove()
            return
        }
        if (!busy) {
            if (!isHuman(turn)) {
                wait = 2
                roll()
            }
            return
        }
        if (steps > 0) {
            pos[turn]++
            steps--
            if (steps == 0) {
                val to = JUMPS[pos[turn]]
                if (to != null) {
                    news = if (to > pos[turn]) "${names[turn]} climbed a ladder to $to!" else "${names[turn]} slid down a snake to $to"
                    pos[turn] = to
                }
                wait = 2
            }
        }
    }

    private fun endMove() {
        busy = false
        if (pos[turn] == 100) {
            if (isHuman(turn)) score = 1
            finish(if (isHuman(turn)) "${names[turn]} wins!" else "The TV wins", won = isHuman(turn))
            return
        }
        if (dice != 6) turn = (turn + 1) % players
    }

    companion object {
        val JUMPS = mapOf(
            2 to 38, 7 to 14, 8 to 31, 15 to 26, 21 to 42, 28 to 84, 36 to 44, 51 to 67, 71 to 91, 78 to 98, 87 to 94,
            16 to 6, 46 to 25, 49 to 11, 62 to 19, 64 to 60, 74 to 53, 89 to 68, 92 to 88, 95 to 75, 99 to 80,
        )

        /** Square [n] (1 to 100) as a grid cell, 1 at the bottom left, rows zig-zagging up. */
        fun cellOf(n: Int): Cell {
            val r = (n - 1) / 10
            val c = (n - 1) % 10
            return Cell(if (r % 2 == 0) c else 9 - c, 9 - r)
        }
    }
}

/**
 * Checkers (draughts) on 8 × 8. Red is at the bottom and moves first; taking is compulsory and
 * a jump carries on while it can. Against the TV, or two people.
 */
class Checkers(private val rnd: Random = Random.Default) : Game() {
    /** 1 red, 2 red king, -1 black, -2 black king. */
    val board = IntArray(64)
    var side = 1
        private set
    var cursor = 5 * 8 + 0
        private set
    var selected = -1
        private set
    var targets: List<Int> = emptyList()
        private set
    var lastMove: List<Int> = emptyList()
        private set
    private var vsTv = true
    private var depth = 4
    private var partial = mutableListOf<Int>()

    /** The squares a jump has passed through so far this turn. */
    val path: List<Int> get() = partial
    private var tvWait = 0

    override val options = listOf("You vs TV: Easy", "You vs TV: Hard", "2 people")
    override val optionsTitle = "Choose a game"
    override val tickMs = 300L
    override val heavy = true
    override val status: String
        get() = when {
            vsTv && side == -1 -> "The TV is thinking…"
            else -> (if (side == 1) "Red" else "Black") + " to move" + if (moves(board, side).any { it.taken.isNotEmpty() }) " (you must jump)" else ""
        }

    init {
        for (i in 0 until 64) {
            val r = i / 8
            val c = i % 8
            if ((r + c) % 2 == 1) {
                if (r < 3) board[i] = -1
                if (r > 4) board[i] = 1
            }
        }
        cursor = 5 * 8 + 0
    }

    override fun onBegin(choice: Int) {
        vsTv = choice != 2
        depth = if (choice == 0) 2 else 5
    }

    class Move(val path: List<Int>, val taken: List<Int>)

    override fun press(p: Pad) {
        if (over || (vsTv && side == -1)) return
        if (p != Pad.Ok) {
            cursor = moveCursor(cursor, p, 8, 8)
            return
        }
        val all = moves(board, side)
        if (partial.isEmpty()) {
            if (board[cursor] * side > 0 && all.any { it.path.first() == cursor }) {
                selected = cursor
                targets = all.filter { it.path.first() == cursor }.map { it.path[1] }.distinct()
            } else if (cursor in targets && selected >= 0) {
                step(all)
            } else {
                selected = -1
                targets = emptyList()
            }
        } else if (cursor in targets) {
            step(all)
        }
    }

    /** Moves the selected piece one hop to the cursor; ends the turn when the jump can't go on. */
    private fun step(all: List<Move>) {
        if (partial.isEmpty()) partial.add(selected)
        partial.add(cursor)
        val fits = all.filter { it.path.size >= partial.size && it.path.subList(0, partial.size) == partial }
        val done = fits.firstOrNull { it.path.size == partial.size }
        if (done != null) {
            apply(board, done)
            lastMove = done.path
            partial.clear()
            selected = -1
            targets = emptyList()
            endTurn()
        } else {
            selected = cursor
            targets = fits.map { it.path[partial.size] }.distinct()
        }
    }

    private fun endTurn() {
        side = -side
        val next = moves(board, side)
        if (next.isEmpty()) {
            val winner = -side
            val humanWon = !vsTv || winner == 1
            if (humanWon) score = 1
            finish(
                when {
                    !vsTv -> (if (winner == 1) "Red" else "Black") + " wins!"
                    winner == 1 -> "You win!"
                    else -> "The TV wins"
                },
                won = humanWon,
            )
            return
        }
        if (vsTv && side == -1) tvWait = 2
    }

    override fun tick() {
        if (over || !vsTv || side != -1) return
        if (tvWait > 0) {
            tvWait--
            return
        }
        val all = moves(board, -1)
        val scored = all.map { m ->
            val b = board.copyOf()
            apply(b, m)
            m to -search(b, 1, depth - 1, -100000, 100000) + rnd.nextInt(3)
        }
        val best = scored.maxBy { it.second }.first
        apply(board, best)
        lastMove = best.path
        endTurn()
    }

    private fun search(b: IntArray, who: Int, d: Int, alphaIn: Int, beta: Int): Int {
        val ms = moves(b, who)
        if (ms.isEmpty()) return -10000 - d
        if (d <= 0) return who * eval(b)
        var alpha = alphaIn
        for (m in ms) {
            val nb = b.copyOf()
            apply(nb, m)
            val v = -search(nb, -who, d - 1, -beta, -alpha)
            if (v > alpha) alpha = v
            if (alpha >= beta) break
        }
        return alpha
    }

    private fun eval(b: IntArray): Int {
        var v = 0
        for (i in 0 until 64) {
            val p = b[i]
            if (p == 0) continue
            val row = i / 8
            v += when (p) {
                1 -> 100 + (7 - row) * 3
                2 -> 170
                -1 -> -100 - row * 3
                else -> -170
            }
        }
        return v
    }

    companion object {
        fun moves(b: IntArray, who: Int): List<Move> {
            val jumps = mutableListOf<Move>()
            for (i in 0 until 64) if (b[i] * who > 0) jumpsFrom(b, i, who, listOf(i), emptyList(), jumps)
            if (jumps.isNotEmpty()) return jumps
            val out = mutableListOf<Move>()
            for (i in 0 until 64) {
                if (b[i] * who <= 0) continue
                for ((dr, dc) in dirs(b[i])) {
                    val r = i / 8 + dr
                    val c = i % 8 + dc
                    if (r in 0..7 && c in 0..7 && b[r * 8 + c] == 0) out.add(Move(listOf(i, r * 8 + c), emptyList()))
                }
            }
            return out
        }

        private fun dirs(piece: Int): List<Pair<Int, Int>> = when (piece) {
            1 -> listOf(-1 to -1, -1 to 1)
            -1 -> listOf(1 to -1, 1 to 1)
            else -> listOf(-1 to -1, -1 to 1, 1 to -1, 1 to 1)
        }

        private fun jumpsFrom(b: IntArray, at: Int, who: Int, path: List<Int>, taken: List<Int>, out: MutableList<Move>) {
            val piece = b[path.first()]
            var more = false
            for ((dr, dc) in dirs(piece)) {
                val mr = at / 8 + dr
                val mc = at % 8 + dc
                val lr = mr + dr
                val lc = mc + dc
                if (lr !in 0..7 || lc !in 0..7) continue
                val mid = mr * 8 + mc
                val land = lr * 8 + lc
                if (b[mid] * who < 0 && mid !in taken && (b[land] == 0 || land == path.first())) {
                    more = true
                    // A man that reaches the far row is crowned, and that ends the move.
                    val crowned = abs(piece) == 1 && (lr == 0 || lr == 7)
                    if (crowned) out.add(Move(path + land, taken + mid))
                    else jumpsFrom(b, land, who, path + land, taken + mid, out)
                }
            }
            if (!more && taken.isNotEmpty()) out.add(Move(path, taken))
        }

        private fun abs(v: Int) = if (v < 0) -v else v

        fun apply(b: IntArray, m: Move) {
            val from = m.path.first()
            val to = m.path.last()
            var piece = b[from]
            b[from] = 0
            m.taken.forEach { b[it] = 0 }
            val row = to / 8
            if (piece == 1 && row == 0) piece = 2
            if (piece == -1 && row == 7) piece = -2
            b[to] = piece
        }
    }
}
