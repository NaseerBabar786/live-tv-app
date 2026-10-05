package com.livetv.app.games

import kotlin.random.Random

/** Moves a cursor on a grid with the arrows, stopping at the edges. */
internal fun moveCursor(i: Int, p: Pad, cols: Int, rows: Int): Int {
    val x = i % cols
    val y = i / cols
    return when (p) {
        Pad.Up -> if (y > 0) i - cols else i
        Pad.Down -> if (y < rows - 1) i + cols else i
        Pad.Left -> if (x > 0) i - 1 else i
        Pad.Right -> if (x < cols - 1) i + 1 else i
        else -> i
    }
}

/** Slide and join numbered tiles on a 4 × 4 board. */
class Game2048(private val rnd: Random = Random.Default) : Game() {
    val tiles = IntArray(16)
    private var reached = false

    init {
        add()
        add()
    }

    override fun press(p: Pad) {
        if (over) return
        val lines = when (p) {
            Pad.Left -> (0 until 4).map { r -> (0 until 4).map { r * 4 + it } }
            Pad.Right -> (0 until 4).map { r -> (3 downTo 0).map { r * 4 + it } }
            Pad.Up -> (0 until 4).map { c -> (0 until 4).map { it * 4 + c } }
            Pad.Down -> (0 until 4).map { c -> (3 downTo 0).map { it * 4 + c } }
            else -> return
        }
        var moved = false
        for (line in lines) {
            val merged = slide(line.map { tiles[it] })
            line.forEachIndexed { k, idx ->
                if (tiles[idx] != merged[k]) moved = true
                tiles[idx] = merged[k]
            }
        }
        if (!moved) return
        add()
        if (!reached && tiles.any { it >= 2048 }) reached = true
        if (!canMove()) finish(if (reached) "You reached 2048!" else "No more moves", won = reached)
    }

    /** One row slid towards its start, equal neighbours joined once. */
    internal fun slide(line: List<Int>): List<Int> {
        val nums = line.filter { it != 0 }
        val out = mutableListOf<Int>()
        var i = 0
        while (i < nums.size) {
            if (i + 1 < nums.size && nums[i] == nums[i + 1]) {
                out.add(nums[i] * 2)
                score += nums[i] * 2
                i += 2
            } else {
                out.add(nums[i])
                i++
            }
        }
        while (out.size < line.size) out.add(0)
        return out
    }

    private fun add() {
        val free = tiles.indices.filter { tiles[it] == 0 }
        if (free.isEmpty()) return
        tiles[free[rnd.nextInt(free.size)]] = if (rnd.nextInt(10) == 0) 4 else 2
    }

    private fun canMove(): Boolean {
        if (tiles.any { it == 0 }) return true
        for (i in 0 until 16) {
            if (i % 4 < 3 && tiles[i] == tiles[i + 1]) return true
            if (i < 12 && tiles[i] == tiles[i + 4]) return true
        }
        return false
    }
}

private val THREE_LINES = listOf(
    listOf(0, 1, 2), listOf(3, 4, 5), listOf(6, 7, 8),
    listOf(0, 3, 6), listOf(1, 4, 7), listOf(2, 5, 8),
    listOf(0, 4, 8), listOf(2, 4, 6),
)

/** You are X and go first; the TV plays O and makes the odd mistake. */
class TicTacToe(private val rnd: Random = Random.Default) : Game() {
    /** 0 empty, 1 you (X), 2 the TV (O). */
    val board = IntArray(9)
    var cursor = 4
        private set
    var winLine: List<Int> = emptyList()
        private set

    override fun press(p: Pad) {
        if (over) return
        if (p != Pad.Ok) {
            cursor = moveCursor(cursor, p, 3, 3)
            return
        }
        if (board[cursor] != 0) return
        board[cursor] = 1
        if (settle()) return
        board[tvMove()] = 2
        settle()
    }

    private fun settle(): Boolean {
        val line = THREE_LINES.firstOrNull { l -> board[l[0]] != 0 && l.all { board[it] == board[l[0]] } }
        when {
            line != null && board[line[0]] == 1 -> { winLine = line; score = 1; finish("You win!", won = true) }
            line != null -> { winLine = line; finish("The TV wins") }
            board.none { it == 0 } -> finish("It's a draw")
            else -> return false
        }
        return true
    }

    private fun tvMove(): Int {
        val free = board.indices.filter { board[it] == 0 }
        // One move in five is a guess, so the TV can be beaten.
        if (rnd.nextInt(5) == 0) return free[rnd.nextInt(free.size)]
        val best = free.maxOf { i -> board[i] = 2; val v = minimax(false); board[i] = 0; v }
        val choices = free.filter { i -> board[i] = 2; val v = minimax(false); board[i] = 0; v == best }
        return choices[rnd.nextInt(choices.size)]
    }

    /** +1 when the TV can force a win, -1 when you can, 0 for a draw. */
    private fun minimax(tvTurn: Boolean): Int {
        THREE_LINES.firstOrNull { l -> board[l[0]] != 0 && l.all { board[it] == board[l[0]] } }?.let {
            return if (board[it[0]] == 2) 1 else -1
        }
        val free = board.indices.filter { board[it] == 0 }
        if (free.isEmpty()) return 0
        val scores = free.map { i ->
            board[i] = if (tvTurn) 2 else 1
            val v = minimax(!tvTurn)
            board[i] = 0
            v
        }
        return if (tvTurn) scores.max() else scores.min()
    }
}

/** Drop discs into a 7 × 6 frame and line up four before the TV does. */
class FourInRow(private val rnd: Random = Random.Default) : Game() {
    val cols = 7
    val rows = 6

    /** Row 0 is the top. 0 empty, 1 you (red), 2 the TV (yellow). */
    val board = IntArray(cols * rows)
    var column = 3
        private set
    var winLine: List<Int> = emptyList()
        private set

    override fun press(p: Pad) {
        if (over) return
        when (p) {
            Pad.Left -> if (column > 0) column--
            Pad.Right -> if (column < cols - 1) column++
            Pad.Ok, Pad.Down -> {
                val r = landing(column) ?: return
                board[r * cols + column] = 1
                if (settle(r * cols + column)) return
                val c = tvColumn()
                val tr = landing(c) ?: return
                board[tr * cols + c] = 2
                settle(tr * cols + c)
            }
            else -> Unit
        }
    }

    private fun landing(c: Int): Int? = (rows - 1 downTo 0).firstOrNull { board[it * cols + c] == 0 }

    /** The four (or more) in a row through [i], if its disc made one. */
    internal fun lineThrough(i: Int): List<Int>? {
        val who = board[i]
        if (who == 0) return null
        val x0 = i % cols
        val y0 = i / cols
        for ((dx, dy) in listOf(1 to 0, 0 to 1, 1 to 1, 1 to -1)) {
            val line = mutableListOf(i)
            for (sign in listOf(1, -1)) {
                var x = x0 + dx * sign
                var y = y0 + dy * sign
                while (x in 0 until cols && y in 0 until rows && board[y * cols + x] == who) {
                    line.add(y * cols + x)
                    x += dx * sign
                    y += dy * sign
                }
            }
            if (line.size >= 4) return line
        }
        return null
    }

    private fun settle(i: Int): Boolean {
        val line = lineThrough(i)
        when {
            line != null && board[i] == 1 -> { winLine = line; score = 1; finish("You win!", won = true) }
            line != null -> { winLine = line; finish("The TV wins") }
            board.none { it == 0 } -> finish("It's a draw")
            else -> return false
        }
        return true
    }

    private fun wins(c: Int, who: Int): Boolean {
        val r = landing(c) ?: return false
        board[r * cols + c] = who
        val win = lineThrough(r * cols + c) != null
        board[r * cols + c] = 0
        return win
    }

    /** Win if it can, block you if it must, otherwise a sensible column near the middle. */
    private fun tvColumn(): Int {
        val open = (0 until cols).filter { landing(it) != null }
        open.firstOrNull { wins(it, 2) }?.let { return it }
        open.firstOrNull { wins(it, 1) }?.let { return it }
        // Avoid a column that lets you win right on top of the TV's disc.
        val safe = open.filter { c ->
            val r = landing(c)!!
            board[r * cols + c] = 2
            val gives = wins(c, 1)
            board[r * cols + c] = 0
            !gives
        }.ifEmpty { open }
        val scored = safe.map { c -> c to (10 - 2 * kotlin.math.abs(3 - c) + neighbours(c) + rnd.nextInt(4)) }
        return scored.maxBy { it.second }.first
    }

    /** How many of the TV's own discs touch where a disc in column [c] would land. */
    private fun neighbours(c: Int): Int {
        val r = landing(c) ?: return 0
        var n = 0
        for (dy in -1..1) for (dx in -1..1) {
            val x = c + dx
            val y = r + dy
            if ((dx != 0 || dy != 0) && x in 0 until cols && y in 0 until rows && board[y * cols + x] == 2) n++
        }
        return n
    }
}

/** Open every square without a mine. The first square opened is always safe. */
class Mines(private val rnd: Random = Random.Default, val cols: Int = 12, val rows: Int = 8, private val count: Int = 15) : Game() {
    override val cursorRepeats = true
    val mine = BooleanArray(cols * rows)
    val open = BooleanArray(cols * rows)
    val flag = BooleanArray(cols * rows)
    var cursor = (rows / 2) * cols + cols / 2
        private set
    private var placed = false

    override val usesHold = true
    override val status: String get() = "Mines $count · Flags ${flag.count { it }}"

    fun around(i: Int): List<Int> {
        val x = i % cols
        val y = i / cols
        val out = mutableListOf<Int>()
        for (dy in -1..1) for (dx in -1..1) {
            val nx = x + dx
            val ny = y + dy
            if ((dx != 0 || dy != 0) && nx in 0 until cols && ny in 0 until rows) out.add(ny * cols + nx)
        }
        return out
    }

    fun number(i: Int): Int = around(i).count { mine[it] }

    override fun press(p: Pad) {
        if (over) return
        when (p) {
            Pad.Hold -> if (!open[cursor]) flag[cursor] = !flag[cursor]
            Pad.Ok -> reveal(cursor)
            else -> cursor = moveCursor(cursor, p, cols, rows)
        }
    }

    private fun reveal(start: Int) {
        if (open[start] || flag[start]) return
        if (!placed) {
            placed = true
            val keep = around(start) + start
            val spots = mine.indices.filter { it !in keep }.shuffled(rnd).take(count)
            spots.forEach { mine[it] = true }
        }
        if (mine[start]) {
            open[start] = true
            for (i in mine.indices) if (mine[i]) open[i] = true
            finish("Boom! You hit a mine")
            return
        }
        // Opens the whole empty area around a square with no mines next to it.
        val todo = ArrayDeque(listOf(start))
        while (todo.isNotEmpty()) {
            val i = todo.removeFirst()
            if (open[i] || mine[i]) continue
            open[i] = true
            flag[i] = false
            if (number(i) == 0) todo.addAll(around(i).filter { !open[it] })
        }
        if (mine.indices.all { mine[it] || open[it] }) {
            score = 1
            for (i in mine.indices) if (mine[i]) flag[i] = true
            finish("Cleared! Well done", won = true)
        }
    }
}

private val CARD_FACES = listOf("🍎", "🍌", "🍇", "🍒", "⭐", "🌙", "⚽", "🎈", "🐟", "🌸")

/** Twenty cards face down; turn two at a time to find the ten pairs. */
class Memory(rnd: Random = Random.Default) : Game() {
    override val cursorRepeats = true
    val cols = 5
    val rows = 4
    val cards: List<String> = (CARD_FACES + CARD_FACES).shuffled(rnd)
    val faceUp = BooleanArray(cards.size)
    val matched = BooleanArray(cards.size)
    var cursor = 0
        private set
    private var first = -1
    private var second = -1
    private var waitTicks = 0

    override val tickMs = 400L
    override val status: String get() = "Moves $score · Pairs ${matched.count { it } / 2} of ${cards.size / 2}"

    override fun press(p: Pad) {
        if (over) return
        if (p != Pad.Ok) {
            cursor = moveCursor(cursor, p, cols, rows)
            return
        }
        if (second >= 0) hide()
        if (faceUp[cursor] || matched[cursor]) return
        faceUp[cursor] = true
        if (first < 0) {
            first = cursor
            return
        }
        second = cursor
        score++
        if (cards[first] == cards[second]) {
            matched[first] = true
            matched[second] = true
            first = -1
            second = -1
            if (matched.all { it }) finish("All pairs found in $score moves", won = true)
        } else {
            waitTicks = 3
        }
    }

    override fun tick() {
        if (second >= 0 && --waitTicks <= 0) hide()
    }

    private fun hide() {
        faceUp[first] = false
        faceUp[second] = false
        first = -1
        second = -1
    }
}

/** The 15 puzzle: tiles 1 to 15 and a gap, shuffled by real moves so it can always be solved. */
class SlidePuzzle(rnd: Random = Random.Default) : Game() {
    val tiles = IntArray(16) { (it + 1) % 16 }

    init {
        var gap = 15
        var last = -1
        var moves = 0
        while (moves < 300 || solved()) {
            val options = listOf(-4, 4, -1, 1).map { gap + it }.filter { n ->
                n in 0 until 16 && n != last && (n / 4 == gap / 4 || n % 4 == gap % 4)
            }
            val n = options[rnd.nextInt(options.size)]
            tiles[gap] = tiles[n]
            tiles[n] = 0
            last = gap
            gap = n
            moves++
        }
    }

    override val status: String get() = "Moves $score"

    fun solved() = (0 until 15).all { tiles[it] == it + 1 }

    override fun press(p: Pad) {
        if (over) return
        val gap = tiles.indexOf(0)
        // The arrow moves a tile into the gap, so the tile comes from the other side.
        val from = when (p) {
            Pad.Left -> if (gap % 4 < 3) gap + 1 else return
            Pad.Right -> if (gap % 4 > 0) gap - 1 else return
            Pad.Up -> if (gap < 12) gap + 4 else return
            Pad.Down -> if (gap >= 4) gap - 4 else return
            else -> return
        }
        tiles[gap] = tiles[from]
        tiles[from] = 0
        score++
        if (solved()) finish("Solved in $score moves", won = true)
    }
}

/** Four coloured pads light up in a growing order; repeat it with the arrows. */
class ColorEcho(private val rnd: Random = Random.Default) : Game() {
    /** 0 Up, 1 Right, 2 Down, 3 Left. */
    val order = mutableListOf<Int>()
    var lit: Int? = null
        private set
    var showing = true
        private set
    private var step = 0
    private var pause = 4
    private var typed = 0

    init {
        order.add(rnd.nextInt(4))
    }

    override val tickMs = 300L
    override val status: String get() = if (showing) "Watch…" else "Your turn: ${typed + 1} of ${order.size}"

    override fun tick() {
        if (over) return
        if (!showing) {
            lit = null
            return
        }
        if (pause > 0) {
            pause--
            lit = null
            return
        }
        // Each colour is lit for one tick, with a dark tick between colours.
        if (lit != null) {
            lit = null
            step++
            if (step >= order.size) {
                showing = false
                typed = 0
            }
        } else {
            lit = order[step]
        }
    }

    override fun press(p: Pad) {
        if (over || showing) return
        val pad = when (p) {
            Pad.Up -> 0
            Pad.Right -> 1
            Pad.Down -> 2
            Pad.Left -> 3
            else -> return
        }
        lit = pad
        if (pad != order[typed]) {
            finish("Wrong colour! You repeated $score")
            return
        }
        typed++
        if (typed == order.size) {
            score = order.size
            order.add(rnd.nextInt(4))
            showing = true
            step = 0
            pause = 4
        }
    }
}
