package com.livetv.app.games

import androidx.compose.foundation.Canvas
import com.livetv.app.ui.Themes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableIntState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.livetv.app.ui.FocusColor

internal val FieldColor: Color get() = Themes.current.panel
internal val FieldLine: Color get() = Themes.current.line
private val BLOCK_COLORS = listOf(
    Color(0xFF00BCD4), Color(0xFFFFD600), Color(0xFFAB47BC), Color(0xFF66BB6A),
    Color(0xFFEF5350), Color(0xFF42A5F5), Color(0xFFFF9800),
)
private val ROW_COLORS = listOf(
    Color(0xFFEF5350), Color(0xFFFF9800), Color(0xFFFFD600),
    Color(0xFF66BB6A), Color(0xFF42A5F5), Color(0xFFAB47BC),
)

/** Draws whichever game is open. [frame] changes after every move, so the board redraws. */
@Composable
fun GameBoard(game: Game, frame: MutableIntState) {
    when (game) {
        is Snake -> SnakeBoard(game, frame)
        is Blocks -> BlocksBoard(game, frame)
        is BrickBreaker -> BrickBoard(game, frame)
        is SpaceDefender -> SpaceBoard(game, frame)
        is PaddleBall -> PaddleBoard(game, frame)
        is Game2048 -> Board2048(game, frame)
        is TicTacToe -> TicTacToeBoard(game, frame)
        is FourInRow -> FourBoard(game, frame)
        is Mines -> MinesBoard(game, frame)
        is Memory -> MemoryBoard(game, frame)
        is SlidePuzzle -> SlideBoard(game, frame)
        is ColorEcho -> EchoBoard(game, frame)
        is Ludo -> LudoBoard(game, frame)
        is SnakesLadders -> SnakesBoard(game, frame)
        is Chess -> ChessBoard(game, frame)
        is Checkers -> CheckersBoard(game, frame)
        is Quiz -> QuizBoard(game, frame)
        is Cricket -> CricketBoard(game, frame)
        is CarRace -> RaceBoard(game, frame)
        is MazeMuncher -> MazeBoard(game, frame)
        is Sudoku -> SudokuBoard(game, frame)
        is Solitaire -> SolitaireBoard(game, frame)
        is Carrom -> CarromBoard(game, frame)
        is WordGuess -> WordBoard(game, frame)
    }
}

/** A dark playing field of [w] × [h] game units, scaled to fit. */
@Composable
internal fun Field(w: Float, h: Float, frame: MutableIntState, draw: DrawScope.(scale: Float) -> Unit) {
    Canvas(
        Modifier
            .aspectRatio(w / h)
            .fillMaxSize()
            .border(2.dp, FieldLine, RoundedCornerShape(6.dp))
            .background(FieldColor, RoundedCornerShape(6.dp)),
    ) {
        frame.intValue
        draw(size.width / w)
    }
}

internal fun DrawScope.cell(x: Int, y: Int, s: Float, color: Color, inset: Float = 0.08f) {
    drawRoundRect(
        color,
        topLeft = Offset((x + inset) * s, (y + inset) * s),
        size = Size(s * (1 - 2 * inset), s * (1 - 2 * inset)),
        cornerRadius = CornerRadius(s * 0.2f),
    )
}

@Composable
private fun SnakeBoard(g: Snake, frame: MutableIntState) = Field(g.w.toFloat(), g.h.toFloat(), frame) { s ->
    drawCircle(Color(0xFFEF5350), radius = s * 0.4f, center = Offset((g.food.x + 0.5f) * s, (g.food.y + 0.5f) * s))
    g.body.forEachIndexed { i, c -> cell(c.x, c.y, s, if (i == 0) Color(0xFFB2FF59) else Color(0xFF43A047)) }
}

@Composable
private fun BlocksBoard(g: Blocks, frame: MutableIntState) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.Center) {
        Box(Modifier.fillMaxHeight().aspectRatio(g.w / g.h.toFloat())) {
            Field(g.w.toFloat(), g.h.toFloat(), frame) { s ->
                for (y in 0 until g.h) for (x in 0 until g.w) {
                    val v = g.board[y * g.w + x]
                    if (v != 0) cell(x, y, s, BLOCK_COLORS[v - 1])
                }
                if (!g.over) for (c in g.piece()) if (c.y >= 0) cell(c.x, c.y, s, BLOCK_COLORS[g.kind])
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Next", fontWeight = FontWeight.Bold)
            Box(Modifier.width(72.dp).aspectRatio(1f)) {
                Field(4f, 4f, frame) { s ->
                    g.nextShape().forEach { cell(it.x, it.y + 1, s, BLOCK_COLORS[g.next]) }
                }
            }
        }
    }
}

@Composable
private fun BrickBoard(g: BrickBreaker, frame: MutableIntState) = Field(g.fieldW, g.fieldH, frame) { s ->
    for (r in 0 until g.rows) for (c in 0 until g.cols) {
        if (!g.bricks[r * g.cols + c]) continue
        drawRoundRect(
            ROW_COLORS[r % ROW_COLORS.size],
            topLeft = Offset((c * g.brickW + 0.6f) * s, (g.brickTop + r * g.brickH + 0.5f) * s),
            size = Size((g.brickW - 1.2f) * s, (g.brickH - 1f) * s),
            cornerRadius = CornerRadius(s),
        )
    }
    drawRoundRect(
        Color(0xFFE0E0E0),
        topLeft = Offset((g.paddleX - g.paddleW / 2) * s, g.paddleY * s),
        size = Size(g.paddleW * s, 2.5f * s),
        cornerRadius = CornerRadius(s * 1.2f),
    )
    drawCircle(FocusColor, radius = g.ballR * s, center = Offset(g.ballX * s, g.ballY * s))
}

@Composable
private fun PaddleBoard(g: PaddleBall, frame: MutableIntState) = Field(g.fieldW, g.fieldH, frame) { s ->
    var y = 2f
    while (y < g.fieldH) {
        drawRect(FieldLine, topLeft = Offset((g.fieldW / 2 - 0.5f) * s, y * s), size = Size(s, 3f * s))
        y += 6f
    }
    drawRoundRect(
        Color(0xFF42A5F5),
        topLeft = Offset((g.paddleX - 1.5f) * s, (g.playerY - g.paddleH / 2) * s),
        size = Size(3f * s, g.paddleH * s),
        cornerRadius = CornerRadius(s),
    )
    drawRoundRect(
        Color(0xFFEF5350),
        topLeft = Offset((g.cpuX - 1.5f) * s, (g.cpuY - g.paddleH / 2) * s),
        size = Size(3f * s, g.paddleH * s),
        cornerRadius = CornerRadius(s),
    )
    drawCircle(Color.White, radius = 1.8f * s, center = Offset(g.ballX * s, g.ballY * s))
}

@Composable
private fun SpaceBoard(g: SpaceDefender, frame: MutableIntState) = Field(g.fieldW, g.fieldH, frame) { s ->
    for (r in 0 until g.rows) for (c in 0 until g.cols) {
        if (!g.alive[r * g.cols + c]) continue
        val x = g.alienX(c)
        val y = g.alienY(r)
        val color = ROW_COLORS[r % ROW_COLORS.size]
        drawRoundRect(color, Offset(x * s, y * s), Size(g.alienW * s, g.alienH * s), CornerRadius(s * 2))
        drawRect(color, Offset(x * s, (y + g.alienH) * s), Size(1.5f * s, 1.5f * s))
        drawRect(color, Offset((x + g.alienW - 1.5f) * s, (y + g.alienH) * s), Size(1.5f * s, 1.5f * s))
        drawRect(FieldColor, Offset((x + 2.5f) * s, (y + 2f) * s), Size(1.5f * s, 1.5f * s))
        drawRect(FieldColor, Offset((x + g.alienW - 4f) * s, (y + 2f) * s), Size(1.5f * s, 1.5f * s))
    }
    if (g.hitFlash % 6 < 3) {
        val ship = Path().apply {
            moveTo(g.shipX * s, (g.shipY - 4f) * s)
            lineTo((g.shipX + 6f) * s, (g.shipY + 3f) * s)
            lineTo((g.shipX - 6f) * s, (g.shipY + 3f) * s)
            close()
        }
        drawPath(ship, Color(0xFF66BB6A))
    }
    g.shots.forEach { drawRect(FocusColor, Offset((it[0] - 0.5f) * s, it[1] * s), Size(s, 3f * s)) }
    g.bombs.forEach { drawCircle(Color(0xFFEF5350), radius = s, center = Offset(it[0] * s, it[1] * s)) }
}

/** A square board of [cols] × [rows] boxes, each drawn by [content]. */
@Composable
internal fun Grid(cols: Int, rows: Int, frame: MutableIntState, gap: Float = 4f, content: @Composable BoxScope.(Int) -> Unit) {
    frame.intValue
    Column(
        Modifier
            .aspectRatio(cols / rows.toFloat())
            .fillMaxSize()
            .background(Themes.current.surfaceVariant, RoundedCornerShape(10.dp))
            .padding((gap / 2).dp),
    ) {
        for (r in 0 until rows) {
            Row(Modifier.weight(1f)) {
                for (c in 0 until cols) {
                    Box(
                        Modifier.weight(1f).fillMaxHeight().padding((gap / 2).dp),
                        contentAlignment = Alignment.Center,
                    ) { content(r * cols + c) }
                }
            }
        }
    }
}

/** Text sized to the box it's in. */
@Composable
internal fun FitText(text: String, color: Color = Color.White, part: Float = 0.5f) {
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val size = with(LocalDensity.current) { (minOf(maxWidth, maxHeight * 1.4f) * part).toSp() }
        Text(text, color = color, fontSize = size, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

internal fun Modifier.square(color: Color, selected: Boolean = false, shape: androidx.compose.ui.graphics.Shape = RoundedCornerShape(8.dp)) =
    fillMaxSize()
        .background(color, shape)
        .then(if (selected) Modifier.border(4.dp, FocusColor, shape) else Modifier)

@Composable
private fun Board2048(g: Game2048, frame: MutableIntState) = Grid(4, 4, frame, gap = 8f) { i ->
    val v = g.tiles[i]
    val color = when (v) {
        0 -> Color(0xFF2B3452)
        2 -> Color(0xFFEEE4DA)
        4 -> Color(0xFFEDE0C8)
        8 -> Color(0xFFF2B179)
        16 -> Color(0xFFF59563)
        32 -> Color(0xFFF67C5F)
        64 -> Color(0xFFF65E3B)
        128 -> Color(0xFFEDCF72)
        256 -> Color(0xFFEDCC61)
        512 -> Color(0xFFEDC850)
        1024 -> Color(0xFFEDC53F)
        else -> Color(0xFFEDC22E)
    }
    Box(Modifier.square(color)) {
        if (v != 0) FitText("$v", if (v <= 4) Color(0xFF776E65) else Color.White, if (v >= 1000) 0.32f else 0.45f)
    }
}

@Composable
private fun TicTacToeBoard(g: TicTacToe, frame: MutableIntState) = Grid(3, 3, frame, gap = 10f) { i ->
    val win = i in g.winLine
    Box(Modifier.square(if (win) Color(0xFF3949AB) else Color(0xFF2B3452), selected = i == g.cursor && !g.over)) {
        when (g.board[i]) {
            1 -> FitText("X", Color(0xFF42A5F5), 0.6f)
            2 -> FitText("O", Color(0xFFEF5350), 0.6f)
        }
    }
}

@Composable
private fun FourBoard(g: FourInRow, frame: MutableIntState) {
    frame.intValue
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.aspectRatio(g.cols.toFloat()).padding(horizontal = 4.dp)) {
            for (c in 0 until g.cols) {
                Box(Modifier.weight(1f).fillMaxHeight().padding(6.dp), contentAlignment = Alignment.Center) {
                    if (c == g.column && !g.over) Box(Modifier.fillMaxSize().background(Color(0xFFEF5350), CircleShape))
                }
            }
        }
        Grid(g.cols, g.rows, frame, gap = 6f) { i ->
            val color = when (g.board[i]) {
                1 -> Color(0xFFEF5350)
                2 -> Color(0xFFFFD600)
                else -> Color(0xFF0A0F1E)
            }
            Box(Modifier.square(color, selected = i in g.winLine, shape = CircleShape))
        }
    }
}

private val MINE_NUMBER_COLORS = listOf(
    Color.White, Color(0xFF64B5F6), Color(0xFF81C784), Color(0xFFE57373),
    Color(0xFFBA68C8), Color(0xFFFFB74D), Color(0xFF4DD0E1), Color.White, Color.LightGray,
)

@Composable
private fun MinesBoard(g: Mines, frame: MutableIntState) = Grid(g.cols, g.rows, frame, gap = 3f) { i ->
    val selected = i == g.cursor && !g.over
    when {
        g.open[i] && g.mine[i] -> Box(Modifier.square(Color(0xFFB71C1C), selected)) { FitText("💣", part = 0.55f) }
        g.open[i] -> Box(Modifier.square(Color(0xFF151B2E), selected)) {
            val n = g.number(i)
            if (n > 0) FitText("$n", MINE_NUMBER_COLORS[n], 0.55f)
        }
        else -> Box(Modifier.square(Color(0xFF3F4C78), selected)) {
            if (g.flag[i]) FitText("🚩", part = 0.5f)
        }
    }
}

@Composable
private fun MemoryBoard(g: Memory, frame: MutableIntState) = Grid(g.cols, g.rows, frame, gap = 8f) { i ->
    val up = g.faceUp[i] || g.matched[i]
    val color = when {
        g.matched[i] -> Color(0xFF1B5E20)
        up -> Color(0xFFECEFF1)
        else -> Color(0xFF3949AB)
    }
    Box(Modifier.square(color, selected = i == g.cursor && !g.over)) {
        FitText(if (up) g.cards[i] else "?", if (up) Color.Black else Color.White, 0.5f)
    }
}

@Composable
private fun SlideBoard(g: SlidePuzzle, frame: MutableIntState) = Grid(4, 4, frame, gap = 8f) { i ->
    val v = g.tiles[i]
    if (v != 0) {
        val home = g.tiles[i] == i + 1
        Box(Modifier.square(if (home) Color(0xFF2E7D32) else Color(0xFF3949AB))) { FitText("$v", part = 0.45f) }
    }
}

private val ECHO_COLORS = listOf(Color(0xFF43A047), Color(0xFFE53935), Color(0xFF1E88E5), Color(0xFFFDD835))

@Composable
private fun EchoBoard(g: ColorEcho, frame: MutableIntState) = Grid(3, 3, frame, gap = 10f) { i ->
    // Up, Right, Down and Left pads around a centre showing the round.
    val pad = when (i) {
        1 -> 0
        5 -> 1
        7 -> 2
        3 -> 3
        else -> null
    }
    when {
        pad != null -> {
            val on = g.lit == pad
            val base = ECHO_COLORS[pad]
            Box(
                Modifier.square(if (on) base else base.copy(alpha = 0.3f), shape = CircleShape)
                    .then(if (on) Modifier.border(5.dp, Color.White, CircleShape) else Modifier),
            ) {
                FitText(listOf("▲", "▶", "▼", "◀")[pad], Color.White.copy(alpha = if (on) 1f else 0.6f), 0.35f)
            }
        }
        i == 4 -> FitText("${g.order.size}", FocusColor, 0.5f)
    }
}
