package com.livetv.app.games

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableIntState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.livetv.app.ui.FocusColor
import kotlin.math.cos
import kotlin.math.sin

private val LUDO_COLORS = listOf(Color(0xFFE53935), Color(0xFF43A047), Color(0xFFFDD835), Color(0xFF1E88E5))

/** Pips of a dice face [n] centred at ([cx], [cy]) with side [side]. */
private fun DrawScope.dice(n: Int, cx: Float, cy: Float, side: Float) {
    drawRoundRect(Color.White, Offset(cx - side / 2, cy - side / 2), Size(side, side), CornerRadius(side * 0.18f))
    drawRoundRect(Color(0xFF333333), Offset(cx - side / 2, cy - side / 2), Size(side, side), CornerRadius(side * 0.18f), style = Stroke(side * 0.05f))
    val q = side * 0.27f
    val spots = when (n) {
        1 -> listOf(0 to 0)
        2 -> listOf(-1 to -1, 1 to 1)
        3 -> listOf(-1 to -1, 0 to 0, 1 to 1)
        4 -> listOf(-1 to -1, 1 to -1, -1 to 1, 1 to 1)
        5 -> listOf(-1 to -1, 1 to -1, 0 to 0, -1 to 1, 1 to 1)
        6 -> listOf(-1 to -1, 1 to -1, -1 to 0, 1 to 0, -1 to 1, 1 to 1)
        else -> emptyList()
    }
    spots.forEach { (x, y) -> drawCircle(Color(0xFF222222), side * 0.09f, Offset(cx + x * q, cy + y * q)) }
}

@Composable
internal fun LudoBoard(g: Ludo, frame: MutableIntState) {
    Canvas(Modifier.aspectRatio(1f).fillMaxSize().background(Color.White, RoundedCornerShape(6.dp))) {
        frame.intValue
        val s = size.width / 15f
        fun sq(x: Int, y: Int, color: Color) {
            drawRect(color, Offset(x * s, y * s), Size(s, s))
            drawRect(Color(0xFF9E9E9E), Offset(x * s, y * s), Size(s, s), style = Stroke(1f))
        }
        // The track, every colour's yard and home lane are Red's turned a quarter at a time.
        for (c in Ludo.TRACK) sq(c.x, c.y, Color.White)
        for (k in 0 until 4) {
            val col = LUDO_COLORS[k]
            val (yx, yy) = Ludo.turnPoint(3f, 3f, k)
            drawRoundRect(col, Offset((yx - 3f) * s, (yy - 3f) * s), Size(6 * s, 6 * s), CornerRadius(s * 0.4f))
            drawRoundRect(Color.White, Offset((yx - 2f) * s, (yy - 2f) * s), Size(4 * s, 4 * s), CornerRadius(s * 0.4f))
            for (x in 1..5) {
                val (hx, hy) = Ludo.turnPoint(x + 0.5f, 7.5f, k)
                sq((hx - 0.5f).toInt(), (hy - 0.5f).toInt(), col)
            }
            val start = Ludo.TRACK[13 * k]
            sq(start.x, start.y, col)
            val star = Ludo.TRACK[13 * k + 8]
            drawCircle(Color(0xFFBDBDBD), s * 0.22f, Offset((star.x + 0.5f) * s, (star.y + 0.5f) * s))
            // A triangle of the centre square in each colour, pointing in from its lane.
            val (ax, ay) = Ludo.turnPoint(6f, 6f, k)
            val (bx, by) = Ludo.turnPoint(6f, 9f, k)
            drawPath(
                Path().apply {
                    moveTo(ax * s, ay * s)
                    lineTo(bx * s, by * s)
                    lineTo(7.5f * s, 7.5f * s)
                    close()
                },
                col,
            )
        }
        if (g.dice > 0) dice(g.dice, 7.5f * s, 7.5f * s, s * 1.3f)
        val movable = if (g.isHuman(g.turn)) g.movable() else emptyList()
        for (c in 0 until 4) for (i in 0 until 4) {
            val (x, y) = g.place(c, i)
            // Pieces sharing a square sit slightly apart.
            val shift = if (g.pos[c][i] in 0..55) (i - 1.5f) * 0.08f * s else 0f
            val centre = Offset(x * s + shift, y * s + shift)
            if (c == g.turn && i in movable) {
                drawCircle(if (i == g.selected) FocusColor else Color.White, s * (if (i == g.selected) 0.55f else 0.47f), centre)
                if (i == g.selected) drawCircle(Color.Black, s * 0.55f, centre, style = Stroke(s * 0.06f))
            }
            drawCircle(Color.Black.copy(alpha = 0.35f), s * 0.38f, centre + Offset(s * 0.04f, s * 0.06f))
            drawCircle(LUDO_COLORS[c], s * 0.38f, centre)
            drawCircle(Color.White, s * 0.38f, centre, style = Stroke(s * 0.07f))
            drawCircle(Color.White.copy(alpha = 0.5f), s * 0.12f, centre - Offset(s * 0.1f, s * 0.1f))
        }
        val (tx, ty) = Ludo.turnPoint(3f, 3f, g.turn)
        drawRoundRect(Color.Black, Offset((tx - 3f) * s, (ty - 3f) * s), Size(6 * s, 6 * s), CornerRadius(s * 0.4f), style = Stroke(s * 0.15f))
    }
}

private val SNAKE_TOKENS = listOf(Color(0xFFE53935), Color(0xFF1E88E5), Color(0xFF43A047), Color(0xFFFDD835))

@Composable
internal fun SnakesBoard(g: SnakesLadders, frame: MutableIntState) {
    Box(Modifier.aspectRatio(1f).fillMaxSize()) {
        Canvas(Modifier.matchParentSize()) {
            frame.intValue
            val s = size.width / 10f
            for (n in 1..100) {
                val c = SnakesLadders.cellOf(n)
                val light = (c.x + c.y) % 2 == 0
                drawRect(if (light) Color(0xFFFFF3C4) else Color(0xFFFFCC80), Offset(c.x * s, c.y * s), Size(s, s))
            }
            fun centre(n: Int) = SnakesLadders.cellOf(n).let { Offset((it.x + 0.5f) * s, (it.y + 0.5f) * s) }
            for ((from, to) in SnakesLadders.JUMPS) {
                val a = centre(from)
                val b = centre(to)
                if (to > from) {
                    // A ladder: two rails and rungs.
                    val d = b - a
                    val len = d.getDistance()
                    val n = Offset(-d.y / len, d.x / len) * (s * 0.18f)
                    drawLine(Color(0xFF6D4C41), a + n, b + n, s * 0.08f, StrokeCap.Round)
                    drawLine(Color(0xFF6D4C41), a - n, b - n, s * 0.08f, StrokeCap.Round)
                    val rungs = (len / (s * 0.4f)).toInt()
                    for (k in 1 until rungs) {
                        val p = a + d * (k / rungs.toFloat())
                        drawLine(Color(0xFF8D6E63), p + n, p - n, s * 0.06f)
                    }
                } else {
                    // A snake: a wavy body from its head (top) down to its tail.
                    val path = Path()
                    val d = b - a
                    val len = d.getDistance()
                    val n = Offset(-d.y / len, d.x / len)
                    path.moveTo(a.x, a.y)
                    val steps = 24
                    for (k in 1..steps) {
                        val t = k / steps.toFloat()
                        val wave = sin(t * Math.PI.toFloat() * 3f) * s * 0.3f
                        val p = a + d * t + n * wave
                        path.lineTo(p.x, p.y)
                    }
                    drawPath(path, Color(0xFF2E7D32), style = Stroke(s * 0.2f, cap = StrokeCap.Round))
                    drawPath(path, Color(0xFF81C784), style = Stroke(s * 0.07f, cap = StrokeCap.Round))
                    drawCircle(Color(0xFF1B5E20), s * 0.2f, a)
                    drawCircle(Color.White, s * 0.05f, a + Offset(-s * 0.07f, -s * 0.04f))
                    drawCircle(Color.White, s * 0.05f, a + Offset(s * 0.07f, -s * 0.04f))
                }
            }
            for (p in 0 until g.players) {
                val at = g.pos[p]
                val base = if (at == 0) Offset(-0.3f * s + p * 0.3f * s + 0.5f * s, 9.5f * s) else centre(at)
                val o = base + Offset((p % 2 - 0.5f) * s * 0.3f, (p / 2 - 0.5f) * s * 0.3f)
                drawCircle(Color.Black.copy(alpha = 0.4f), s * 0.24f, o + Offset(s * 0.03f, s * 0.05f))
                drawCircle(SNAKE_TOKENS[p], s * 0.24f, o)
                drawCircle(if (p == g.turn) FocusColor else Color.White, s * 0.24f, o, style = Stroke(s * 0.06f))
            }
            if (g.dice > 0) dice(g.dice, 9.4f * s, 0.6f * s, s * 0.9f)
        }
        Column(Modifier.matchParentSize()) {
            for (r in 0 until 10) Row(Modifier.weight(1f)) {
                for (c in 0 until 10) {
                    val fromBottom = 9 - r
                    val n = fromBottom * 10 + (if (fromBottom % 2 == 0) c else 9 - c) + 1
                    Box(Modifier.weight(1f).fillMaxHeight().padding(3.dp)) {
                        Text("$n", color = Color(0xFF5D4037), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

/** Chess and checkers squares, with the cursor, the picked piece and where it can go. */
@Composable
private fun CheckerSquares(frame: MutableIntState, cursor: Int, selected: Int, targets: List<Int>, marked: List<Int>, piece: @Composable (Int) -> Unit) {
    frame.intValue
    Column(Modifier.aspectRatio(1f).fillMaxSize().border(3.dp, Color(0xFF3E2723))) {
        for (r in 0 until 8) Row(Modifier.weight(1f)) {
            for (c in 0 until 8) {
                val i = r * 8 + c
                val dark = (r + c) % 2 == 1
                val base = when {
                    i == selected -> Color(0xFFF9A825)
                    i in marked -> if (dark) Color(0xFFAAA23A) else Color(0xFFCDD26A)
                    dark -> Color(0xFF8B5A2B)
                    else -> Color(0xFFF0D9B5)
                }
                Box(
                    Modifier.weight(1f).fillMaxHeight().background(base)
                        .then(if (i == cursor) Modifier.border(4.dp, FocusColor) else Modifier),
                    contentAlignment = Alignment.Center,
                ) {
                    piece(i)
                    if (i in targets) Box(Modifier.fillMaxSize(0.3f).background(Color.Black.copy(alpha = 0.35f), CircleShape))
                }
            }
        }
    }
}

private fun chessGlyph(p: Int) = when (kotlin.math.abs(p)) {
    1 -> "♟"
    2 -> "♞"
    3 -> "♝"
    4 -> "♜"
    5 -> "♛"
    else -> "♚"
} + "︎"

@Composable
internal fun ChessBoard(g: Chess, frame: MutableIntState) {
    val last = g.lastMove?.let { listOf(it.from, it.to) } ?: emptyList()
    CheckerSquares(frame, if (g.over) -1 else g.cursor, g.selected, g.targets, last) { i ->
        val p = g.pos.b[i]
        if (p != 0) {
            BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                val size = with(LocalDensity.current) { (maxHeight * 0.72f).toSp() }
                Text(
                    chessGlyph(p),
                    style = TextStyle(
                        fontSize = size,
                        color = if (p > 0) Color.White else Color(0xFF151515),
                        shadow = Shadow(if (p > 0) Color.Black else Color(0xFFBDBDBD), Offset(2f, 2f), 4f),
                    ),
                )
            }
        }
    }
}

@Composable
internal fun CheckersBoard(g: Checkers, frame: MutableIntState) {
    CheckerSquares(frame, if (g.over) -1 else g.cursor, g.selected, g.targets, g.path + g.lastMove) { i ->
        val p = g.board[i]
        if (p != 0) {
            Box(
                Modifier.fillMaxSize(0.78f)
                    .background(if (p > 0) Color(0xFFD32F2F) else Color(0xFF212121), CircleShape)
                    .border(3.dp, if (p > 0) Color(0xFFFF8A80) else Color(0xFF757575), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                if (kotlin.math.abs(p) == 2) FitText("♛︎", FocusColor, 0.5f)
            }
        }
    }
}

@Composable
internal fun QuizBoard(g: Quiz, frame: MutableIntState) {
    frame.intValue
    if (!g.ready) {
        Box(Modifier.fillMaxSize())
        return
    }
    Column(Modifier.fillMaxSize().padding(8.dp), verticalArrangement = Arrangement.Center) {
        Text(g.question.topic, color = FocusColor, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(g.question.text, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold, lineHeight = 34.sp)
        Spacer(Modifier.height(10.dp))
        // Time left.
        Box(Modifier.fillMaxWidth().height(8.dp).background(Color(0xFF2B3452), RoundedCornerShape(4.dp))) {
            Box(
                Modifier.fillMaxWidth(g.timeLeft / 150f).fillMaxHeight()
                    .background(if (g.timeLeft > 40) Color(0xFF43A047) else Color(0xFFE53935), RoundedCornerShape(4.dp)),
            )
        }
        Spacer(Modifier.height(14.dp))
        for (r in 0 until 2) {
            Row(Modifier.fillMaxWidth()) {
                for (c in 0 until 2) {
                    val i = r * 2 + c
                    val color = when {
                        g.picked >= 0 && i == g.right -> Color(0xFF2E7D32)
                        g.picked == i -> Color(0xFFC62828)
                        else -> Color(0xFF2B3452)
                    }
                    Box(
                        Modifier.weight(1f).padding(6.dp).height(78.dp)
                            .background(color, RoundedCornerShape(12.dp))
                            .then(if (i == g.cursor && g.picked < 0) Modifier.border(4.dp, FocusColor, RoundedCornerShape(12.dp)) else Modifier)
                            .padding(horizontal = 14.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        Text("${"ABCD"[i]}.  ${g.answers.getOrElse(i) { "" }}", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.Bold, maxLines = 2)
                    }
                }
            }
        }
    }
}

@Composable
internal fun CricketBoard(g: Cricket, frame: MutableIntState) {
    Box(Modifier.aspectRatio(1f).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Canvas(Modifier.matchParentSize()) {
            frame.intValue
            val s = size.width / 100f
            drawRect(Color(0xFF1B5E20))
            drawCircle(Color(0xFF2E7D32), 48f * s, Offset(50f * s, 50f * s))
            drawCircle(Color.White.copy(alpha = 0.5f), 48f * s, Offset(50f * s, 50f * s), style = Stroke(0.6f * s))
            drawRect(Color(0xFFD7C189), Offset(43f * s, 12f * s), Size(14f * s, 76f * s))
            val y0 = 18f
            val y1 = 84f
            fun py(t: Float) = (y0 + t * (y1 - y0)) * s
            // The yellow zone where a swing connects.
            drawRect(FocusColor.copy(alpha = 0.35f), Offset(43f * s, py(g.zoneStart)), Size(14f * s, py(g.zoneEnd) - py(g.zoneStart)))
            for (y in listOf(14f, 86f)) for (dx in listOf(-1.2f, 0f, 1.2f)) {
                drawLine(Color(0xFFFFF8E1), Offset((50f + dx) * s, (y - 2.5f) * s), Offset((50f + dx) * s, (y + 1f) * s), 0.6f * s)
            }
            // Bowler at the top, batter at the bottom.
            drawCircle(Color(0xFF1565C0), 2.6f * s, Offset(50f * s, 8f * s))
            drawCircle(Color(0xFFFFFFFF), 2.8f * s, Offset(53f * s, 90f * s))
            val swing = if (g.swung) -0.9f else 0.4f
            drawLine(Color(0xFFBCAAA4), Offset(51f * s, 88f * s), Offset((51f + cos(swing) * -7f) * s, (88f + sin(swing) * -7f) * s), 1.6f * s, StrokeCap.Round)
            if (g.ball >= 0f) {
                drawCircle(Color(0xFFD32F2F), 1.4f * s, Offset(50f * s, py(g.ball)))
            }
            if (g.flight >= 0f) {
                val d = g.flight * 50f
                drawCircle(Color(0xFFD32F2F), (1.4f + g.flight * 1.2f) * s, Offset((50f + sin(g.shotAngle) * d) * s, (84f - cos(g.shotAngle) * d) * s))
            }
        }
        if (g.call.isNotEmpty()) {
            Text(
                g.call,
                color = if (g.call.endsWith("!") && !g.call.contains("Caught") && !g.call.contains("Bowled")) FocusColor else Color.White,
                fontSize = 40.sp,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 40.dp).background(Color.Black.copy(alpha = 0.5f), RoundedCornerShape(12.dp)).padding(horizontal = 18.dp, vertical = 6.dp),
            )
        }
    }
}

private fun DrawScope.car(cx: Float, top: Float, w: Float, h: Float, color: Color) {
    drawRoundRect(color, Offset(cx - w / 2, top), Size(w, h), CornerRadius(w * 0.25f))
    drawRoundRect(Color(0xFF90CAF9), Offset(cx - w * 0.35f, top + h * 0.2f), Size(w * 0.7f, h * 0.18f), CornerRadius(w * 0.1f))
    drawRoundRect(Color(0xFF90CAF9), Offset(cx - w * 0.35f, top + h * 0.65f), Size(w * 0.7f, h * 0.14f), CornerRadius(w * 0.1f))
    for (sx in listOf(-1, 1)) for (sy in listOf(0.15f, 0.7f)) {
        drawRect(Color.Black, Offset(cx + sx * w / 2 - (if (sx > 0) 0f else w * 0.12f), top + h * sy), Size(w * 0.12f, h * 0.18f))
    }
}

private val CAR_COLORS = listOf(Color(0xFF1E88E5), Color(0xFF8E24AA), Color(0xFFFB8C00), Color(0xFF43A047), Color(0xFF6D4C41))

@Composable
internal fun RaceBoard(g: CarRace, frame: MutableIntState) = Field(60f, 100f, frame) { s ->
    drawRect(Color(0xFF424242), Offset(0f, 0f), Size(60f * s, 100f * s))
    drawRect(Color(0xFF2E7D32), Offset(0f, 0f), Size(3f * s, 100f * s))
    drawRect(Color(0xFF2E7D32), Offset(57f * s, 0f), Size(3f * s, 100f * s))
    for (l in 1 until g.lanes) {
        var y = -20f + g.road * 100f
        while (y < 100f) {
            drawRect(Color.White, Offset((3f + l * 18f - 0.5f) * s, y * s), Size(1f * s, 10f * s))
            y += 20f
        }
    }
    fun laneX(l: Int) = (3f + 9f + l * 18f) * s
    g.cars.forEachIndexed { k, c ->
        car(laneX(c[0].toInt()), c[1] * 100f * s, 10f * s, 16f * s, if (k == g.crashed && g.over) Color.Red else CAR_COLORS[(c[0].toInt() * 7 + k) % CAR_COLORS.size])
    }
    car(laneX(g.lane), 80f * s, 10f * s, 16f * s, Color(0xFFE53935))
}

@Composable
internal fun MazeBoard(g: MazeMuncher, frame: MutableIntState) = Field(g.w.toFloat(), g.h.toFloat(), frame) { s ->
    for (y in 0 until g.h) for (x in 0 until g.w) {
        val i = y * g.w + x
        val c = Offset((x + 0.5f) * s, (y + 0.5f) * s)
        when {
            g.wall[i] -> drawRoundRect(Color(0xFF1A3FB5), Offset((x + 0.1f) * s, (y + 0.1f) * s), Size(s * 0.8f, s * 0.8f), CornerRadius(s * 0.25f))
            g.dots[i] == 1 -> drawCircle(Color(0xFFFFE0B2), s * 0.1f, c)
            g.dots[i] == 2 -> drawCircle(Color(0xFFFFE0B2), s * 0.28f, c)
        }
    }
    val pc = Offset((g.player.x + 0.5f) * s, (g.player.y + 0.5f) * s)
    val face = when (g.facing) {
        Cell(1, 0) -> 0f
        Cell(0, 1) -> 90f
        Cell(-1, 0) -> 180f
        else -> 270f
    }
    val open = if (g.mouth) 40f else 8f
    drawArc(Color(0xFFFFD600), face + open, 360f - 2 * open, true, Offset(pc.x - s * 0.45f, pc.y - s * 0.45f), Size(s * 0.9f, s * 0.9f))
    val ghostColors = listOf(Color(0xFFE53935), Color(0xFFF48FB1), Color(0xFF4DD0E1), Color(0xFFFFB74D))
    g.ghosts.forEachIndexed { k, gh ->
        val color = if (g.scared > 0) (if (g.scared < 12 && g.scared % 2 == 0) Color.White else Color(0xFF3949AB)) else ghostColors[k]
        val left = (gh.x + 0.1f) * s
        val top = (gh.y + 0.1f) * s
        drawRoundRect(color, Offset(left, top), Size(s * 0.8f, s * 0.8f), CornerRadius(s * 0.4f, s * 0.4f))
        drawRect(color, Offset(left, top + s * 0.4f), Size(s * 0.8f, s * 0.4f))
        drawCircle(Color.White, s * 0.13f, Offset(left + s * 0.25f, top + s * 0.33f))
        drawCircle(Color.White, s * 0.13f, Offset(left + s * 0.55f, top + s * 0.33f))
        drawCircle(Color(0xFF0D47A1), s * 0.06f, Offset(left + s * 0.27f, top + s * 0.35f))
        drawCircle(Color(0xFF0D47A1), s * 0.06f, Offset(left + s * 0.57f, top + s * 0.35f))
    }
}

@Composable
internal fun SudokuBoard(g: Sudoku, frame: MutableIntState) {
    frame.intValue
    Column(Modifier.aspectRatio(1f).fillMaxSize().background(Color(0xFF0A0F1E)).border(3.dp, Color(0xFF9FA8DA)).padding(2.dp)) {
        for (r in 0 until 9) {
            Row(Modifier.weight(1f)) {
                for (c in 0 until 9) {
                    val i = r * 9 + c
                    val v = g.grid[i]
                    val cur = g.cursor
                    val near = cur / 9 == r || cur % 9 == c
                    val same = v != 0 && v == g.grid[cur]
                    val bg = when {
                        i == cur -> FocusColor.copy(alpha = 0.55f)
                        same -> Color(0xFF3949AB)
                        near -> Color(0xFF1F2A4D)
                        else -> Color(0xFF141B33)
                    }
                    // Thicker lines between the 3 × 3 boxes.
                    val pad = Modifier.padding(
                        start = if (c % 3 == 0 && c > 0) 3.dp else 1.dp,
                        top = if (r % 3 == 0 && r > 0) 3.dp else 1.dp,
                    )
                    Box(Modifier.weight(1f).fillMaxHeight().then(pad).background(bg), contentAlignment = Alignment.Center) {
                        if (v != 0) {
                            FitText(
                                "$v",
                                when {
                                    g.clash(i) -> Color(0xFFFF5252)
                                    g.given[i] -> Color.White
                                    else -> Color(0xFF80D8FF)
                                },
                                0.6f,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlayingCard(card: Card?, w: androidx.compose.ui.unit.Dp, h: androidx.compose.ui.unit.Dp, highlight: Color? = null, empty: String = "") {
    val shape = RoundedCornerShape(w * 0.1f)
    Box(
        Modifier.size(w, h)
            // A bright glow around the highlighted card so it's easy to find from the sofa.
            .then(
                if (highlight != null) Modifier.drawBehind {
                    val r = w.toPx() * 0.1f
                    for ((grow, alpha) in listOf(10.dp to 0.25f, 6.dp to 0.45f)) {
                        val g = grow.toPx()
                        drawRoundRect(
                            highlight.copy(alpha = alpha),
                            topLeft = Offset(-g, -g),
                            size = Size(size.width + 2 * g, size.height + 2 * g),
                            cornerRadius = CornerRadius(r + g, r + g),
                        )
                    }
                } else Modifier
            )
            .background(
                when {
                    card == null -> Color.White.copy(alpha = 0.08f)
                    card.up -> Color.White
                    else -> Color(0xFF283593)
                },
                shape,
            )
            .border(if (highlight != null) 5.dp else 1.dp, highlight ?: Color(0xFF9E9E9E), shape)
            .then(if (highlight != null) Modifier.background(highlight.copy(alpha = 0.22f), shape) else Modifier)
            .padding(start = w * 0.08f, top = h * 0.02f),
    ) {
        val fs = with(LocalDensity.current) { (w * 0.3f).toSp() }
        when {
            card == null -> Text(empty, color = Color.White.copy(alpha = 0.35f), fontSize = fs)
            card.up -> Text(card.label, color = if (card.red) Color(0xFFD32F2F) else Color.Black, fontSize = fs, fontWeight = FontWeight.Bold, maxLines = 1)
            else -> Text("✦", color = Color.White.copy(alpha = 0.4f), fontSize = fs)
        }
    }
}

/** Solitaire's cursor: a vivid yellow that stands out on the green table whatever the app's theme. */
private val SolitaireYellow = Color(0xFFFFEA00)

@Composable
internal fun SolitaireBoard(g: Solitaire, frame: MutableIntState) {
    frame.intValue
    BoxWithConstraints(Modifier.fillMaxSize().background(Color(0xFF1B5E20), RoundedCornerShape(8.dp)).padding(6.dp)) {
        val gap = 6.dp
        val w = minOf((maxWidth - gap * 6) / 7, maxHeight / 4.4f)
        val h = w * 1.4f
        val boxH = maxHeight
        fun mark(p: Int): Color? = when {
            g.held == p -> Color(0xFF00E5FF)
            g.pile == p && !g.over -> SolitaireYellow
            else -> null
        }
        Column {
            Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                PlayingCard(g.stock.lastOrNull(), w, h, mark(0), "↻")
                PlayingCard(g.waste.lastOrNull(), w, h, mark(1))
                Spacer(Modifier.width(w))
                for (k in 0 until 4) PlayingCard(g.homes[k].lastOrNull(), w, h, mark(2 + k), "A")
            }
            Spacer(Modifier.height(gap * 2))
            val avail = boxH - h - gap * 2 - 12.dp
            Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                for (k in 0 until 7) {
                    val col = g.columns[k]
                    val p = 6 + k
                    val step = if (col.size <= 1) 0.dp else minOf(h * 0.3f, (avail - h) / (col.size - 1))
                    Box(Modifier.width(w).height(avail)) {
                        if (col.isEmpty()) PlayingCard(null, w, h, mark(p), "K")
                        col.forEachIndexed { idx, card ->
                            val fromEnd = col.size - idx
                            val picked = (g.pile == p && fromEnd <= g.depth && !g.over) || (g.held == p && fromEnd <= g.heldCount)
                            Box(Modifier.offset(y = step * idx)) {
                                PlayingCard(card, w, h, if (picked) mark(p) ?: SolitaireYellow else null)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun CarromBoard(g: Carrom, frame: MutableIntState) = Field(g.size, g.size, frame) { s ->
    drawRect(Color(0xFFE8C48A), Offset.Zero, Size(g.size * s, g.size * s))
    drawRect(Color(0xFF4E342E), Offset.Zero, Size(g.size * s, g.size * s), style = Stroke(2.5f * s))
    for ((px, py) in listOf(0f to 0f, g.size to 0f, 0f to g.size, g.size to g.size)) {
        drawCircle(Color(0xFF212121), g.pocketR * s, Offset(px * s, py * s))
    }
    drawCircle(Color(0xFF8D6E63), 12f * s, Offset(50f * s, 50f * s), style = Stroke(0.5f * s))
    drawCircle(Color(0xFFC62828), 2f * s, Offset(50f * s, 50f * s), style = Stroke(0.4f * s))
    for (y in listOf(g.baseline - 3f, g.baseline + 3f)) drawLine(Color(0xFF5D4037), Offset(20f * s, y * s), Offset(80f * s, y * s), 0.4f * s)
    for (c in g.coins) {
        if (c[5] == 0f) continue
        val color = when (c[4].toInt()) {
            0 -> Color(0xFFFFF8E1)
            1 -> Color(0xFF263238)
            else -> Color(0xFFD32F2F)
        }
        drawCircle(color, g.coinR * s, Offset(c[0] * s, c[1] * s))
        drawCircle(Color.Black.copy(alpha = 0.4f), g.coinR * s, Offset(c[0] * s, c[1] * s), style = Stroke(0.3f * s))
        drawCircle(Color.Black.copy(alpha = 0.25f), g.coinR * 0.55f * s, Offset(c[0] * s, c[1] * s), style = Stroke(0.25f * s))
    }
    if (!g.moving) {
        val len = 30f
        drawLine(
            Color.White,
            Offset(g.sx * s, g.sy * s),
            Offset((g.sx + cos(g.angle) * len) * s, (g.sy + sin(g.angle) * len) * s),
            0.5f * s,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(2f * s, 1.5f * s)),
        )
    }
    drawCircle(Color(0xFF80DEEA), g.strikerR * s, Offset(g.sx * s, g.sy * s))
    drawCircle(Color(0xFF00838F), g.strikerR * s, Offset(g.sx * s, g.sy * s), style = Stroke(0.5f * s))
    if (g.charging) {
        drawRect(Color.Black.copy(alpha = 0.5f), Offset(92f * s, 30f * s), Size(4f * s, 50f * s))
        drawRect(
            if (g.power > 0.8f) Color(0xFFE53935) else if (g.power > 0.5f) FocusColor else Color(0xFF43A047),
            Offset(92f * s, (80f - 50f * g.power) * s),
            Size(4f * s, 50f * g.power * s),
        )
    }
}

@Composable
internal fun WordBoard(g: WordGuess, frame: MutableIntState) {
    frame.intValue
    Column(Modifier.fillMaxSize().padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text("Topic: ${g.topic}", color = FocusColor, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Row {
            repeat(g.maxWrong) { k ->
                Text(if (k < g.maxWrong - g.wrong) "❤️" else "🖤", fontSize = 24.sp, modifier = Modifier.padding(horizontal = 2.dp))
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (ch in g.word) {
                val shown = ch in g.guessed || g.over
                Box(
                    Modifier.size(width = 40.dp, height = 52.dp).background(Color(0xFF2B3452), RoundedCornerShape(6.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (shown) "$ch" else "",
                        color = if (ch in g.guessed) Color.White else Color(0xFFFF8A80),
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
        Spacer(Modifier.height(20.dp))
        val rows = (g.letters.size + g.cols - 1) / g.cols
        for (r in 0 until rows) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 3.dp)) {
                for (c in 0 until g.cols) {
                    val i = r * g.cols + c
                    if (i >= g.letters.size) {
                        Spacer(Modifier.size(46.dp))
                        continue
                    }
                    val ch = g.letters[i]
                    val color = when {
                        ch !in g.guessed -> Color(0xFF3949AB)
                        ch in g.word -> Color(0xFF2E7D32)
                        else -> Color(0xFF37474F)
                    }
                    Box(
                        Modifier.size(46.dp).background(color, RoundedCornerShape(8.dp))
                            .then(if (i == g.cursor && !g.over) Modifier.border(3.dp, FocusColor, RoundedCornerShape(8.dp)) else Modifier),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("$ch", color = if (ch in g.guessed) Color.White.copy(alpha = 0.5f) else Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
