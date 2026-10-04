package com.livetv.app.games

import kotlin.random.Random

/**
 * Chess with the full rules (castling, en passant, a pawn becomes a queen) against the TV at
 * three strengths, or two people. White is at the bottom and moves first.
 */
class Chess(private val rnd: Random = Random.Default) : Game() {
    /** Square = row * 8 + column, row 0 at the top. Positive is White: 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king. */
    class Position(
        val b: IntArray = IntArray(64),
        var side: Int = 1,
        /** White short, white long, black short, black long. */
        val castle: BooleanArray = booleanArrayOf(true, true, true, true),
        var ep: Int = -1,
    ) {
        fun copy() = Position(b.copyOf(), side, castle.copyOf(), ep)
    }

    data class Move(val from: Int, val to: Int)

    val pos = Position()
    var cursor = 6 * 8 + 4
        private set
    var selected = -1
        private set
    var targets: List<Int> = emptyList()
        private set
    var lastMove: Move? = null
        private set
    private var vsTv = true
    private var depth = 2
    private var tvWait = 0

    override val options = listOf("You vs TV: Easy", "You vs TV: Medium", "You vs TV: Hard", "2 people")
    override val optionsTitle = "Choose a game"
    override val tickMs = 300L
    override val heavy = true
    override val status: String
        get() {
            val who = if (pos.side == 1) "White" else "Black"
            val check = if (inCheck(pos, pos.side)) " · Check!" else ""
            return if (vsTv && pos.side == -1) "The TV is thinking…$check" else "$who to move$check"
        }

    init {
        val back = intArrayOf(4, 2, 3, 5, 6, 3, 2, 4)
        for (c in 0 until 8) {
            pos.b[c] = -back[c]
            pos.b[8 + c] = -1
            pos.b[48 + c] = 1
            pos.b[56 + c] = back[c]
        }
    }

    override fun onBegin(choice: Int) {
        vsTv = choice != 3
        depth = when (choice) {
            0 -> 1
            1 -> 2
            else -> 3
        }
    }

    override fun press(p: Pad) {
        if (over || (vsTv && pos.side == -1)) return
        if (p != Pad.Ok) {
            cursor = moveCursor(cursor, p, 8, 8)
            return
        }
        val legal = legalMoves(pos)
        if (selected >= 0 && cursor in targets) {
            play(Move(selected, cursor))
            return
        }
        if (pos.b[cursor] * pos.side > 0 && legal.any { it.from == cursor }) {
            selected = cursor
            targets = legal.filter { it.from == cursor }.map { it.to }
        } else {
            selected = -1
            targets = emptyList()
        }
    }

    private fun play(m: Move) {
        make(pos, m)
        lastMove = m
        selected = -1
        targets = emptyList()
        val next = legalMoves(pos)
        if (next.isEmpty()) {
            if (inCheck(pos, pos.side)) {
                val winner = -pos.side
                val humanWon = !vsTv || winner == 1
                if (humanWon) score = 1
                finish(
                    when {
                        !vsTv -> (if (winner == 1) "White" else "Black") + " wins by checkmate!"
                        winner == 1 -> "Checkmate! You win!"
                        else -> "Checkmate. The TV wins"
                    },
                    won = humanWon,
                )
            } else {
                finish("Stalemate: a draw")
            }
            return
        }
        if (pos.b.count { it != 0 } == 2) {
            finish("Only the kings are left: a draw")
            return
        }
        if (vsTv && pos.side == -1) tvWait = 1
    }

    override fun tick() {
        if (over || !vsTv || pos.side != -1) return
        if (tvWait > 0) {
            tvWait--
            return
        }
        val moves = ordered(pos, legalMoves(pos))
        var best = moves.first()
        var bestScore = Int.MIN_VALUE
        for (m in moves) {
            val p = pos.copy()
            make(p, m)
            // Easy plays loosely: a little noise on top of a one-move look ahead.
            val noise = if (depth == 1) rnd.nextInt(60) else rnd.nextInt(6)
            val v = -search(p, depth - 1, -1_000_000, 1_000_000) + noise
            if (v > bestScore) {
                bestScore = v
                best = m
            }
        }
        play(best)
    }

    private fun search(p: Position, d: Int, alphaIn: Int, beta: Int): Int {
        if (d <= 0) return quiet(p, alphaIn, beta, 3)
        val moves = legalMoves(p)
        if (moves.isEmpty()) return if (inCheck(p, p.side)) -100_000 - d else 0
        var alpha = alphaIn
        for (m in ordered(p, moves)) {
            val n = p.copy()
            make(n, m)
            val v = -search(n, d - 1, -beta, -alpha)
            if (v > alpha) alpha = v
            if (alpha >= beta) break
        }
        return alpha
    }

    /** Follows captures a few deep so the TV doesn't leave a piece hanging. */
    private fun quiet(p: Position, alphaIn: Int, beta: Int, left: Int): Int {
        val stand = p.side * eval(p)
        if (left == 0 || stand >= beta) return stand
        var alpha = maxOf(alphaIn, stand)
        val caps = legalMoves(p).filter { p.b[it.to] != 0 }
        for (m in ordered(p, caps)) {
            val n = p.copy()
            make(n, m)
            val v = -quiet(n, -beta, -alpha, left - 1)
            if (v > alpha) alpha = v
            if (alpha >= beta) break
        }
        return alpha
    }

    private fun ordered(p: Position, moves: List<Move>) =
        moves.sortedByDescending { if (p.b[it.to] != 0) VALUE[kotlin.math.abs(p.b[it.to])] * 10 - VALUE[kotlin.math.abs(p.b[it.from])] else 0 }

    companion object {
        val VALUE = intArrayOf(0, 100, 320, 330, 500, 900, 0)
        private val KNIGHT = listOf(-2 to -1, -2 to 1, -1 to -2, -1 to 2, 1 to -2, 1 to 2, 2 to -1, 2 to 1)
        private val KING = listOf(-1 to -1, -1 to 0, -1 to 1, 0 to -1, 0 to 1, 1 to -1, 1 to 0, 1 to 1)
        private val DIAG = listOf(-1 to -1, -1 to 1, 1 to -1, 1 to 1)
        private val LINE = listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)

        fun eval(p: Position): Int {
            var v = 0
            for (i in 0 until 64) {
                val x = p.b[i]
                if (x == 0) continue
                val kind = kotlin.math.abs(x)
                val r = i / 8
                val c = i % 8
                var s = VALUE[kind]
                // Knights, bishops and pawns like the middle; pawns like to advance.
                val centre = 6 - (kotlin.math.abs(2 * r - 7) + kotlin.math.abs(2 * c - 7)) / 2
                if (kind in 1..3) s += centre * 4
                if (kind == 1) s += (if (x > 0) 6 - r else r - 1) * 6
                v += if (x > 0) s else -s
            }
            return v
        }

        fun inCheck(p: Position, who: Int): Boolean {
            val k = p.b.indexOfFirst { it == 6 * who }
            return k >= 0 && attacked(p, k, -who)
        }

        /** Whether side [by] attacks square [sq]. */
        fun attacked(p: Position, sq: Int, by: Int): Boolean {
            val r = sq / 8
            val c = sq % 8
            fun at(rr: Int, cc: Int) = if (rr in 0..7 && cc in 0..7) p.b[rr * 8 + cc] else 99
            // Pawns attack diagonally forwards: White's from below, Black's from above.
            val pr = r + by
            if (at(pr, c - 1) == by || at(pr, c + 1) == by) return true
            for ((dr, dc) in KNIGHT) if (at(r + dr, c + dc) == 2 * by) return true
            for ((dr, dc) in KING) if (at(r + dr, c + dc) == 6 * by) return true
            for ((dr, dc) in DIAG) {
                var rr = r + dr
                var cc = c + dc
                while (at(rr, cc) == 0) { rr += dr; cc += dc }
                val x = at(rr, cc)
                if (x == 3 * by || x == 5 * by) return true
            }
            for ((dr, dc) in LINE) {
                var rr = r + dr
                var cc = c + dc
                while (at(rr, cc) == 0) { rr += dr; cc += dc }
                val x = at(rr, cc)
                if (x == 4 * by || x == 5 * by) return true
            }
            return false
        }

        private fun pseudo(p: Position): List<Move> {
            val out = mutableListOf<Move>()
            val s = p.side
            for (i in 0 until 64) {
                val x = p.b[i]
                if (x * s <= 0) continue
                val r = i / 8
                val c = i % 8
                fun add(rr: Int, cc: Int): Boolean {
                    if (rr !in 0..7 || cc !in 0..7) return false
                    val t = p.b[rr * 8 + cc]
                    if (t * s > 0) return false
                    out.add(Move(i, rr * 8 + cc))
                    return t == 0
                }
                when (kotlin.math.abs(x)) {
                    1 -> {
                        val f = r - s
                        if (f in 0..7 && p.b[f * 8 + c] == 0) {
                            out.add(Move(i, f * 8 + c))
                            val start = if (s == 1) 6 else 1
                            if (r == start && p.b[(f - s) * 8 + c] == 0) out.add(Move(i, (f - s) * 8 + c))
                        }
                        for (dc in listOf(-1, 1)) {
                            val cc = c + dc
                            if (f !in 0..7 || cc !in 0..7) continue
                            val t = f * 8 + cc
                            if (p.b[t] * s < 0 || t == p.ep) out.add(Move(i, t))
                        }
                    }
                    2 -> for ((dr, dc) in KNIGHT) add(r + dr, c + dc)
                    3 -> for ((dr, dc) in DIAG) { var k = 1; while (add(r + dr * k, c + dc * k)) k++ }
                    4 -> for ((dr, dc) in LINE) { var k = 1; while (add(r + dr * k, c + dc * k)) k++ }
                    5 -> for ((dr, dc) in DIAG + LINE) { var k = 1; while (add(r + dr * k, c + dc * k)) k++ }
                    6 -> {
                        for ((dr, dc) in KING) add(r + dr, c + dc)
                        val home = if (s == 1) 7 else 0
                        val short = if (s == 1) 0 else 2
                        if (r == home && c == 4 && !attacked(p, i, -s)) {
                            if (p.castle[short] && p.b[home * 8 + 5] == 0 && p.b[home * 8 + 6] == 0 &&
                                p.b[home * 8 + 7] == 4 * s && !attacked(p, home * 8 + 5, -s)
                            ) out.add(Move(i, home * 8 + 6))
                            if (p.castle[short + 1] && p.b[home * 8 + 3] == 0 && p.b[home * 8 + 2] == 0 && p.b[home * 8 + 1] == 0 &&
                                p.b[home * 8] == 4 * s && !attacked(p, home * 8 + 3, -s)
                            ) out.add(Move(i, home * 8 + 2))
                        }
                    }
                }
            }
            return out
        }

        fun legalMoves(p: Position): List<Move> = pseudo(p).filter { m ->
            val n = p.copy()
            make(n, m)
            !inCheck(n, p.side)
        }

        fun make(p: Position, m: Move) {
            val s = p.side
            val x = p.b[m.from]
            val kind = kotlin.math.abs(x)
            val fr = m.from / 8
            val tr = m.to / 8
            val tc = m.to % 8
            // En passant takes the pawn beside, not on, the square moved to.
            if (kind == 1 && m.to == p.ep) p.b[fr * 8 + tc] = 0
            p.b[m.to] = if (kind == 1 && (tr == 0 || tr == 7)) 5 * s else x
            p.b[m.from] = 0
            if (kind == 6 && kotlin.math.abs(m.to - m.from) == 2) {
                if (tc == 6) { p.b[tr * 8 + 5] = p.b[tr * 8 + 7]; p.b[tr * 8 + 7] = 0 }
                else { p.b[tr * 8 + 3] = p.b[tr * 8]; p.b[tr * 8] = 0 }
            }
            p.ep = if (kind == 1 && kotlin.math.abs(tr - fr) == 2) ((fr + tr) / 2) * 8 + tc else -1
            if (kind == 6) { p.castle[if (s == 1) 0 else 2] = false; p.castle[if (s == 1) 1 else 3] = false }
            for ((sq, idx) in listOf(63 to 0, 56 to 1, 7 to 2, 0 to 3)) if (m.from == sq || m.to == sq) p.castle[idx] = false
            p.side = -s
        }
    }
}
