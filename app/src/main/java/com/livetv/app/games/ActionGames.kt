package com.livetv.app.games

import kotlin.math.abs
import kotlin.math.sqrt
import kotlin.random.Random

/** The snake moves one square per tick and speeds up as it grows. */
class Snake(private val rnd: Random = Random.Default) : Game() {
    val w = 24
    val h = 15

    /** Head first. */
    val body = ArrayDeque<Cell>()
    var food = Cell(0, 0)
        private set
    private var dir = Cell(1, 0)
    private val turns = ArrayDeque<Cell>()

    init {
        for (i in 0 until 4) body.addLast(Cell(8 - i, h / 2))
        food = place() ?: Cell(0, 0)
    }

    override val tickMs: Long get() = (150 - body.size * 2).coerceAtLeast(70).toLong()

    override fun press(p: Pad) {
        val d = when (p) {
            Pad.Up -> Cell(0, -1)
            Pad.Down -> Cell(0, 1)
            Pad.Left -> Cell(-1, 0)
            Pad.Right -> Cell(1, 0)
            else -> return
        }
        // Up to two quick turns are kept, so a fast U-turn isn't lost between ticks.
        val last = turns.lastOrNull() ?: dir
        if (d == last || (d.x == -last.x && d.y == -last.y)) return
        if (turns.size < 2) turns.addLast(d)
    }

    override fun tick() {
        if (over) return
        turns.removeFirstOrNull()?.let { dir = it }
        val head = body.first()
        val next = Cell(head.x + dir.x, head.y + dir.y)
        if (next.x !in 0 until w || next.y !in 0 until h || (next in body && next != body.last())) {
            finish("Game over")
            return
        }
        body.addFirst(next)
        if (next == food) {
            score += 10
            food = place() ?: run {
                finish("You filled the board!", won = true)
                return
            }
        } else {
            body.removeLast()
        }
    }

    private fun place(): Cell? {
        val free = (0 until w * h).map { Cell(it % w, it / w) }.filter { it !in body }
        return if (free.isEmpty()) null else free[rnd.nextInt(free.size)]
    }
}

/** Falling blocks on a 10 × 20 well. */
class Blocks(private val rnd: Random = Random.Default) : Game() {
    val w = 10
    val h = 20

    /** 0 is empty; 1 to 7 is the colour of the block that landed there. */
    val board = IntArray(w * h)

    private val shapes = listOf(
        4 to listOf(Cell(0, 1), Cell(1, 1), Cell(2, 1), Cell(3, 1)),
        2 to listOf(Cell(0, 0), Cell(1, 0), Cell(0, 1), Cell(1, 1)),
        3 to listOf(Cell(1, 0), Cell(0, 1), Cell(1, 1), Cell(2, 1)),
        3 to listOf(Cell(1, 0), Cell(2, 0), Cell(0, 1), Cell(1, 1)),
        3 to listOf(Cell(0, 0), Cell(1, 0), Cell(1, 1), Cell(2, 1)),
        3 to listOf(Cell(0, 0), Cell(0, 1), Cell(1, 1), Cell(2, 1)),
        3 to listOf(Cell(2, 0), Cell(0, 1), Cell(1, 1), Cell(2, 1)),
    )

    var kind = 0
        private set
    var next = rnd.nextInt(shapes.size)
        private set
    private var size = 3
    private var shape = emptyList<Cell>()
    private var px = 0
    private var py = 0
    var lines = 0
        private set
    private val level get() = lines / 10

    init {
        spawn()
    }

    override val tickMs: Long get() = (600 - level * 50).coerceAtLeast(100).toLong()
    override val repeats = true
    override val status: String get() = "Lines $lines · Level ${level + 1}"

    /** The falling piece's squares on the board. */
    fun piece(): List<Cell> = shape.map { Cell(px + it.x, py + it.y) }

    /** The next piece's squares, for the preview. */
    fun nextShape(): List<Cell> = shapes[next].second

    private fun spawn() {
        kind = next
        next = rnd.nextInt(shapes.size)
        size = shapes[kind].first
        shape = shapes[kind].second
        px = (w - size) / 2
        py = 0
        if (!fits(shape, px, py)) finish("Game over")
    }

    private fun fits(cells: List<Cell>, x: Int, y: Int) = cells.all {
        val cx = x + it.x
        val cy = y + it.y
        cx in 0 until w && cy < h && (cy < 0 || board[cy * w + cx] == 0)
    }

    override fun press(p: Pad) {
        if (over) return
        when (p) {
            Pad.Left -> if (fits(shape, px - 1, py)) px--
            Pad.Right -> if (fits(shape, px + 1, py)) px++
            Pad.Up -> {
                val turned = shape.map { Cell(size - 1 - it.y, it.x) }
                // Nudges the piece off a wall when turning it there.
                for (dx in listOf(0, -1, 1, -2, 2)) {
                    if (fits(turned, px + dx, py)) {
                        shape = turned
                        px += dx
                        break
                    }
                }
            }
            Pad.Down -> if (fits(shape, px, py + 1)) {
                py++
                score += 1
            }
            Pad.Ok -> {
                while (fits(shape, px, py + 1)) {
                    py++
                    score += 2
                }
                lock()
            }
            else -> Unit
        }
    }

    override fun tick() {
        if (over) return
        if (fits(shape, px, py + 1)) py++ else lock()
    }

    private fun lock() {
        for (c in piece()) {
            if (c.y < 0) {
                finish("Game over")
                return
            }
            board[c.y * w + c.x] = kind + 1
        }
        var cleared = 0
        var y = h - 1
        while (y >= 0) {
            if ((0 until w).all { board[y * w + it] != 0 }) {
                for (yy in y downTo 1) for (x in 0 until w) board[yy * w + x] = board[(yy - 1) * w + x]
                for (x in 0 until w) board[x] = 0
                cleared++
            } else {
                y--
            }
        }
        score += listOf(0, 100, 300, 500, 800)[cleared] * (level + 1)
        lines += cleared
        spawn()
    }
}

/** Shared by the paddle games: which way the held arrow moves. */
private fun heldDirection(held: Int, p: Pad, down: Boolean, minus: Pad, plus: Pad): Int = when {
    p == minus && down -> -1
    p == plus && down -> 1
    p == minus && held == -1 -> 0
    p == plus && held == 1 -> 0
    else -> held
}

/** Break the bricks with a ball; three lives, and a faster ball every level. */
class BrickBreaker : Game() {
    val fieldW = 160f
    val fieldH = 120f
    val cols = 10
    val rows = 6
    val brickTop = 14f
    val brickH = 5f
    val brickW get() = fieldW / cols
    val bricks = BooleanArray(cols * rows) { true }
    val paddleW = 26f
    val paddleY = fieldH - 6f
    var paddleX = fieldW / 2
        private set
    val ballR = 1.8f
    var ballX = paddleX
        private set
    var ballY = paddleY - ballR
        private set
    private var vx = 0f
    private var vy = 0f
    var stuck = true
        private set
    var lives = 3
        private set
    var level = 1
        private set
    private var held = 0
    private val speed get() = 1.3f + 0.15f * level

    override val tickMs = 16L
    override val status: String get() = "Lives $lives · Level $level"

    override fun press(p: Pad) {
        held = heldDirection(held, p, true, Pad.Left, Pad.Right)
        if ((p == Pad.Ok || p == Pad.Up) && stuck) {
            stuck = false
            vx = speed * 0.5f
            vy = -speed * 0.87f
        }
    }

    override fun release(p: Pad) {
        held = heldDirection(held, p, false, Pad.Left, Pad.Right)
    }

    override fun tick() {
        if (over) return
        paddleX = (paddleX + held * 2.8f).coerceIn(paddleW / 2, fieldW - paddleW / 2)
        if (stuck) {
            ballX = paddleX
            ballY = paddleY - ballR
            return
        }
        // Two half steps so the ball can't jump over a brick.
        repeat(2) { step(0.5f) }
    }

    private fun step(f: Float) {
        ballX += vx * f
        ballY += vy * f
        if (ballX < ballR) { ballX = ballR; vx = abs(vx) }
        if (ballX > fieldW - ballR) { ballX = fieldW - ballR; vx = -abs(vx) }
        if (ballY < ballR) { ballY = ballR; vy = abs(vy) }
        if (vy > 0 && ballY + ballR >= paddleY && ballY + ballR <= paddleY + 4f && abs(ballX - paddleX) <= paddleW / 2 + ballR) {
            // Where it hits the paddle decides the angle.
            val hit = ((ballX - paddleX) / (paddleW / 2)).coerceIn(-1f, 1f)
            vx = speed * hit * 0.85f
            vy = -sqrt((speed * speed - vx * vx).coerceAtLeast(speed * speed * 0.2f))
        }
        if (ballY > fieldH + ballR) {
            lives--
            if (lives <= 0) finish("Game over") else stuck = true
            return
        }
        val row = ((ballY - brickTop) / brickH).toInt()
        val col = (ballX / brickW).toInt()
        if (ballY >= brickTop && row in 0 until rows && col in 0 until cols && bricks[row * cols + col]) {
            bricks[row * cols + col] = false
            vy = -vy
            score += 10 * (rows - row)
            if (bricks.none { it }) {
                level++
                bricks.fill(true)
                stuck = true
            }
        }
    }
}

/** Table tennis against the TV: Up and Down move the left paddle. First to 7. */
class PaddleBall(private val rnd: Random = Random.Default) : Game() {
    val fieldW = 160f
    val fieldH = 100f
    val paddleH = 20f
    val paddleX = 5f
    val cpuX = fieldW - 5f
    var playerY = fieldH / 2
        private set
    var cpuY = fieldH / 2
        private set
    var ballX = fieldW / 2
        private set
    var ballY = fieldH / 2
        private set
    private var vx = 0f
    private var vy = 0f
    private var speed = 1.4f
    var cpuScore = 0
        private set
    private var held = 0
    private var wait = 60

    init {
        serve(toPlayer = rnd.nextBoolean())
    }

    override val tickMs = 16L
    override val status: String get() = "You $score · TV $cpuScore"

    override fun press(p: Pad) {
        held = heldDirection(held, p, true, Pad.Up, Pad.Down)
    }

    override fun release(p: Pad) {
        held = heldDirection(held, p, false, Pad.Up, Pad.Down)
    }

    private fun serve(toPlayer: Boolean) {
        ballX = fieldW / 2
        ballY = fieldH / 2
        speed = 1.4f
        vx = if (toPlayer) -speed else speed
        vy = (rnd.nextFloat() - 0.5f) * speed
        wait = 50
    }

    override fun tick() {
        if (over) return
        playerY = (playerY + held * 2.4f).coerceIn(paddleH / 2, fieldH - paddleH / 2)
        // The TV follows the ball, a little slower than it can move, so it can be beaten.
        val target = if (vx > 0) ballY else fieldH / 2
        val cpuSpeed = 1.05f + 0.1f * cpuScore
        cpuY += (target - cpuY).coerceIn(-cpuSpeed, cpuSpeed)
        cpuY = cpuY.coerceIn(paddleH / 2, fieldH - paddleH / 2)
        if (wait > 0) {
            wait--
            return
        }
        ballX += vx
        ballY += vy
        if (ballY < 1.5f) { ballY = 1.5f; vy = abs(vy) }
        if (ballY > fieldH - 1.5f) { ballY = fieldH - 1.5f; vy = -abs(vy) }
        if (vx < 0 && ballX <= paddleX + 2f && ballX >= paddleX - 2f && abs(ballY - playerY) <= paddleH / 2 + 1.5f) {
            bounce(playerY, 1f)
        }
        if (vx > 0 && ballX >= cpuX - 2f && ballX <= cpuX + 2f && abs(ballY - cpuY) <= paddleH / 2 + 1.5f) {
            bounce(cpuY, -1f)
        }
        if (ballX < 0) point(player = false)
        if (ballX > fieldW) point(player = true)
    }

    private fun bounce(paddle: Float, dir: Float) {
        speed = (speed + 0.12f).coerceAtMost(3.4f)
        val hit = ((ballY - paddle) / (paddleH / 2)).coerceIn(-1f, 1f)
        vy = speed * hit * 0.75f
        vx = dir * sqrt(speed * speed - vy * vy)
    }

    private fun point(player: Boolean) {
        if (player) score++ else cpuScore++
        when {
            score >= 7 -> finish("You win $score to $cpuScore!", won = true)
            cpuScore >= 7 -> finish("The TV wins $cpuScore to $score")
            else -> serve(toPlayer = player)
        }
    }
}

/** Invaders march side to side and down; shoot them before they land. */
class SpaceDefender(private val rnd: Random = Random.Default) : Game() {
    val fieldW = 160f
    val fieldH = 120f
    val cols = 8
    val rows = 4
    val alienW = 10f
    val alienH = 6f
    val gapX = 15f
    val gapY = 10f
    val alive = BooleanArray(cols * rows) { true }
    var originX = 10f
        private set
    var originY = 12f
        private set
    private var dir = 1f
    private var moveTimer = 0
    val shipY = fieldH - 6f
    var shipX = fieldW / 2
        private set
    val shots = mutableListOf<FloatArray>()
    val bombs = mutableListOf<FloatArray>()
    var lives = 3
        private set
    var level = 1
        private set
    private var held = 0
    var hitFlash = 0
        private set

    override val tickMs = 16L
    override val status: String get() = "Lives $lives · Wave $level"

    fun alienX(c: Int) = originX + c * gapX
    fun alienY(r: Int) = originY + r * gapY

    override fun press(p: Pad) {
        held = heldDirection(held, p, true, Pad.Left, Pad.Right)
        if ((p == Pad.Ok || p == Pad.Up) && shots.size < 2) shots.add(floatArrayOf(shipX, shipY - 4f))
    }

    override fun release(p: Pad) {
        held = heldDirection(held, p, false, Pad.Left, Pad.Right)
    }

    override fun tick() {
        if (over) return
        if (hitFlash > 0) hitFlash--
        shipX = (shipX + held * 2.2f).coerceIn(6f, fieldW - 6f)
        // Fewer invaders left, faster march.
        val left = alive.count { it }
        if (++moveTimer >= (4 + left / 2) - level.coerceAtMost(4)) {
            moveTimer = 0
            val cs = (0 until cols).filter { c -> (0 until rows).any { alive[it * cols + c] } }
            val minX = alienX(cs.min())
            val maxX = alienX(cs.max()) + alienW
            if ((dir > 0 && maxX + 2f > fieldW) || (dir < 0 && minX - 2f < 0f)) {
                dir = -dir
                originY += 4f
            } else {
                originX += 2f * dir
            }
            val lowest = (0 until rows).filter { r -> (0 until cols).any { alive[r * cols + it] } }.max()
            if (alienY(lowest) + alienH >= shipY - 4f) {
                finish("The invaders landed")
                return
            }
        }
        // A random front-row invader drops a bomb now and then.
        if (rnd.nextFloat() < 0.015f + 0.005f * level) {
            val cs = (0 until cols).filter { c -> (0 until rows).any { alive[it * cols + c] } }
            val c = cs[rnd.nextInt(cs.size)]
            val r = (0 until rows).last { alive[it * cols + c] }
            bombs.add(floatArrayOf(alienX(c) + alienW / 2, alienY(r) + alienH))
        }
        shots.forEach { it[1] -= 3.5f }
        shots.removeAll { it[1] < 0f }
        bombs.forEach { it[1] += 1.3f + 0.1f * level }
        bombs.removeAll { it[1] > fieldH }
        val shotIt = shots.iterator()
        while (shotIt.hasNext()) {
            val s = shotIt.next()
            val c = ((s[0] - originX) / gapX).toInt()
            val r = ((s[1] - originY) / gapY).toInt()
            if (s[0] >= originX && s[1] >= originY && c in 0 until cols && r in 0 until rows && alive[r * cols + c] &&
                s[0] - alienX(c) <= alienW && s[1] - alienY(r) <= alienH
            ) {
                alive[r * cols + c] = false
                score += 10 * (rows - r)
                shotIt.remove()
            }
        }
        if (bombs.any { abs(it[0] - shipX) < 6f && it[1] >= shipY - 3f && it[1] <= shipY + 3f }) {
            bombs.clear()
            lives--
            hitFlash = 30
            if (lives <= 0) {
                finish("Game over")
                return
            }
        }
        if (alive.none { it }) {
            level++
            alive.fill(true)
            originX = 10f
            originY = 12f
            dir = 1f
            shots.clear()
            bombs.clear()
        }
    }
}
