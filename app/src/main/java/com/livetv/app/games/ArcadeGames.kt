package com.livetv.app.games

import kotlin.math.abs
import kotlin.random.Random

/**
 * Batting in a run chase: the TV bowls, OK swings. The closer the ball is to the middle of the
 * yellow zone when you swing, the bigger the shot. Swing too early or miss a straight ball and
 * you can be out.
 */
class Cricket(private val rnd: Random = Random.Default) : Game() {
    /** How far the ball has come down the pitch, 0 at the bowler to 1 past the stumps. */
    var ball = -1f
        private set
    private var speed = 0.02f
    var balls = 0
        private set
    var wickets = 0
        private set
    var target = 0
        private set
    var overs = 3
        private set
    var maxWickets = 3
        private set
    /** "SIX!", "Bowled!" — the last ball's result, shown for a moment. */
    var call = ""
        private set
    var shotAngle = 0f
        private set
    /** After a hit, how far the ball has flown (0 to 1). */
    var flight = -1f
        private set
    var swung = false
        private set
    private var straight = true
    private var pause = 20

    val zoneStart = 0.78f
    val zoneEnd = 0.92f

    override val options = listOf("Quick: 2 overs", "Classic: 3 overs", "Long: 5 overs")
    override val optionsTitle = "How long a match?"
    override val tickMs = 16L
    override val status: String
        get() {
            val over = "${balls / 6}.${balls % 6}"
            val need = target - score
            return "$score/$wickets · Overs $over of $overs\nTarget $target: need $need from ${overs * 6 - balls}"
        }

    override fun onBegin(choice: Int) {
        overs = listOf(2, 3, 5)[choice]
        maxWickets = listOf(2, 3, 5)[choice]
        target = overs * 6 * (14 + rnd.nextInt(8)) / 10
    }

    override fun press(p: Pad) {
        // OK swings; so does any arrow, for remotes where OK is awkward to reach.
        if (over || p == Pad.Hold || ball < 0f || swung) return
        swung = true
        val mid = (zoneStart + zoneEnd) / 2
        val off = abs(ball - mid)
        val runs = when {
            ball < zoneStart - 0.12f -> -1
            off < 0.015f -> 6
            off < 0.035f -> 4
            off < 0.05f -> 3
            off < 0.065f -> 2
            off < 0.09f -> 1
            else -> 0
        }
        when {
            runs < 0 -> if (rnd.nextInt(3) == 0) out("Caught! Swung too early") else result("Swing and a miss", 0)
            runs == 0 -> result("Missed", 0)
            else -> {
                // A lofted big shot can still be caught now and then.
                if (runs >= 4 && rnd.nextInt(14) == 0) {
                    out("Caught on the boundary!")
                    return
                }
                result(
                    when (runs) {
                        6 -> "SIX!"
                        4 -> "FOUR!"
                        else -> "$runs run" + if (runs > 1) "s" else ""
                    },
                    runs,
                )
                shotAngle = (rnd.nextFloat() - 0.5f) * 2.6f
                flight = 0f
            }
        }
    }

    private fun result(text: String, runs: Int) {
        call = text
        score += runs
        endBall()
    }

    private fun out(text: String) {
        call = text
        wickets++
        endBall()
    }

    private fun endBall() {
        balls++
        ball = -1f
        pause = 70
        when {
            score >= target -> finish("You won the chase! $score/$wickets", won = true)
            wickets >= maxWickets -> finish("All out for $score. Target was $target")
            balls >= overs * 6 -> finish(if (score == target - 1) "Lost by 1 run!" else "Overs done: $score/$wickets. Target was $target")
        }
    }

    override fun tick() {
        if (over) return
        if (flight >= 0f) {
            flight += 0.02f
            if (flight > 1f) flight = -1f
        }
        if (ball < 0f) {
            if (--pause <= 0) {
                ball = 0f
                swung = false
                call = ""
                straight = rnd.nextInt(3) != 0
                speed = 0.011f + rnd.nextFloat() * 0.009f + balls * 0.0002f
            }
            return
        }
        ball += speed
        if (ball >= 1f) {
            if (!swung && straight && rnd.nextInt(2) == 0) out("Bowled!") else result("Dot ball", 0)
        }
    }
}

/** Three lanes of traffic; Left and Right change lane. */
class CarRace(private val rnd: Random = Random.Default) : Game() {
    val lanes = 3
    var lane = 1
        private set
    /** Each car ahead: lane and how far down the road (0 top to 1 bottom). */
    val cars = mutableListOf<FloatArray>()
    var road = 0f
        private set
    private var speed = 0.008f
    private var gap = 0f
    var crashed = -1
        private set

    override val tickMs = 16L
    override val status: String get() = "Speed ${(speed * 12000).toInt()} km/h"

    override fun press(p: Pad) {
        if (over) return
        when (p) {
            Pad.Left -> if (lane > 0) lane--
            Pad.Right -> if (lane < lanes - 1) lane++
            else -> Unit
        }
    }

    override fun tick() {
        if (over) return
        road = (road + speed) % 0.2f
        speed = (speed + 0.000004f).coerceAtMost(0.022f)
        cars.forEach { it[1] += speed * 0.8f }
        cars.removeAll { it[1] > 1.2f }
        gap -= speed
        if (gap <= 0f) {
            // Never block all three lanes at once.
            val free = (0 until lanes).filter { l -> cars.none { it[0].toInt() == l && it[1] < 0.25f } }
            val l = free[rnd.nextInt(free.size)]
            cars.add(floatArrayOf(l.toFloat(), -0.15f))
            gap = 0.22f + rnd.nextFloat() * 0.25f
        }
        score++
        val hit = cars.indexOfFirst { it[0].toInt() == lane && it[1] > 0.72f && it[1] < 0.98f }
        if (hit >= 0) {
            crashed = hit
            finish("Crash! You drove ${score / 6} m")
        }
    }
}

/**
 * Eat every dot in the maze while four ghosts chase you. A big dot turns them blue for a while,
 * and then they can be eaten. Three lives.
 */
class MazeMuncher(private val rnd: Random = Random.Default) : Game() {
    val w = MAZE[0].length
    val h = MAZE.size
    val wall = BooleanArray(w * h)
    /** 0 nothing, 1 dot, 2 big dot. */
    val dots = IntArray(w * h)
    var player = Cell(0, 0)
        private set
    private var dir = Cell(0, 0)
    private var want = Cell(0, 0)
    val ghosts = MutableList(4) { Cell(0, 0) }
    private val ghostDir = MutableList(4) { Cell(0, 0) }
    private val ghostOut = IntArray(4)
    var scared = 0
        private set
    var lives = 3
        private set
    var level = 1
        private set
    private var tickCount = 0
    private var start = Cell(0, 0)
    private var home = Cell(0, 0)
    var mouth = false
        private set
    var facing = Cell(1, 0)
        private set

    override val tickMs = 150L
    override val status: String get() = "Lives $lives · Level $level"

    init {
        load()
    }

    private fun load() {
        for (y in 0 until h) for (x in 0 until w) {
            val ch = MAZE[y][x]
            val i = y * w + x
            wall[i] = ch == '#'
            dots[i] = when (ch) {
                '.' -> 1
                'o' -> 2
                else -> 0
            }
            if (ch == 'P') start = Cell(x, y)
            if (ch == 'G') home = Cell(x - 1, y)
        }
        resetPositions()
    }

    private fun resetPositions() {
        player = start
        dir = Cell(0, 0)
        want = Cell(0, 0)
        for (g in 0 until 4) {
            ghosts[g] = if (g < 3) Cell(home.x - 1 + g, home.y) else Cell(home.x, home.y - 1)
            ghostDir[g] = Cell(0, -1)
            ghostOut[g] = g * 12
        }
        scared = 0
    }

    private fun open(c: Cell): Boolean {
        val x = (c.x + w) % w
        return c.y in 0 until h && !wall[c.y * w + x]
    }

    private fun step(c: Cell, d: Cell) = Cell((c.x + d.x + w) % w, c.y + d.y)

    override fun press(p: Pad) {
        want = when (p) {
            Pad.Up -> Cell(0, -1)
            Pad.Down -> Cell(0, 1)
            Pad.Left -> Cell(-1, 0)
            Pad.Right -> Cell(1, 0)
            else -> return
        }
        if (dir == Cell(0, 0)) dir = want
    }

    override fun tick() {
        if (over) return
        tickCount++
        mouth = !mouth
        if (want != dir && open(step(player, want))) dir = want
        if (dir != Cell(0, 0) && open(step(player, dir))) {
            player = step(player, dir)
            facing = dir
        }
        val i = player.y * w + player.x
        if (dots[i] == 1) score += 10
        if (dots[i] == 2) {
            score += 50
            scared = 45
        }
        dots[i] = 0
        if (dots.none { it != 0 }) {
            level++
            load()
            return
        }
        if (collide()) return
        // Ghosts move a little slower than you, and much slower when scared.
        val ghostTurn = if (scared > 0) tickCount % 2 == 0 else tickCount % 5 != 0
        if (scared > 0) scared--
        if (ghostTurn) for (g in 0 until 4) moveGhost(g)
        collide()
    }

    private fun moveGhost(g: Int) {
        if (ghostOut[g] > 0) {
            ghostOut[g]--
            return
        }
        val dirs = listOf(Cell(0, -1), Cell(-1, 0), Cell(0, 1), Cell(1, 0))
        val back = Cell(-ghostDir[g].x, -ghostDir[g].y)
        val choices = dirs.filter { it != back && open(step(ghosts[g], it)) }.ifEmpty { listOf(back) }
        // Each ghost aims a little differently so they don't all bunch up.
        val target = when (g) {
            0 -> player
            1 -> Cell(player.x + facing.x * 4, player.y + facing.y * 4)
            2 -> Cell(w - 1 - player.x, player.y)
            else -> if (rnd.nextInt(3) == 0) Cell(rnd.nextInt(w), rnd.nextInt(h)) else player
        }
        val pick = if (scared > 0) {
            choices.maxBy { dist(step(ghosts[g], it), player) + rnd.nextInt(3) }
        } else {
            choices.minBy { dist(step(ghosts[g], it), target) * 4 + rnd.nextInt(3) }
        }
        ghostDir[g] = pick
        ghosts[g] = step(ghosts[g], pick)
    }

    private fun dist(a: Cell, b: Cell) = abs(a.x - b.x) + abs(a.y - b.y)

    private fun collide(): Boolean {
        for (g in 0 until 4) {
            if (ghosts[g] != player) continue
            if (scared > 0) {
                score += 200
                ghosts[g] = home
                ghostOut[g] = 20
            } else {
                lives--
                if (lives <= 0) finish("Caught! Game over") else resetPositions()
                return true
            }
        }
        return false
    }

    companion object {
        /** # wall, . dot, o big dot, P start, G ghosts' home, - its door; the side gaps wrap round. */
        val MAZE = listOf(
            "###################",
            "#o.......#.......o#",
            "#.##.###.#.###.##.#",
            "#.................#",
            "#.##.#.#####.#.##.#",
            "#....#...#...#....#",
            "####.### # ###.####",
            "   #.#       #.#   ",
            "####.# ##-## #.####",
            "    .  #GGG#  .    ",
            "####.# ##### #.####",
            "   #.#       #.#   ",
            "####.# ##### #.####",
            "#........#........#",
            "#.##.###.#.###.##.#",
            "#o.#.....P.....#.o#",
            "##.#.#.#####.#.#.##",
            "#....#...#...#....#",
            "#.######.#.######.#",
            "#.................#",
            "###################",
        )
    }
}
