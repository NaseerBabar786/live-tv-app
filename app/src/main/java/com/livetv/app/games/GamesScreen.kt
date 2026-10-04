package com.livetv.app.games

import android.content.Context
import android.content.pm.PackageManager
import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableIntState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.livetv.app.ui.CardShape
import com.livetv.app.ui.FocusColor
import com.livetv.app.ui.focusGlow
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Each game's record (best score, fewest moves or wins), kept on this device. */
class GameScores(context: Context) {
    private val prefs = context.getSharedPreferences("games", Context.MODE_PRIVATE)

    fun get(id: String): Int? = if (prefs.contains(id)) prefs.getInt(id, 0) else null

    fun record(info: GameInfo, game: Game) {
        val old = get(info.id)
        val new = when (info.scoring) {
            Scoring.Best -> maxOf(old ?: 0, game.score)
            Scoring.Fewest -> if (game.won) minOf(old ?: Int.MAX_VALUE, game.score) else return
            Scoring.Wins -> (old ?: 0) + if (game.won) 1 else 0
        }
        prefs.edit().putInt(info.id, new).apply()
    }

    fun label(info: GameInfo): String {
        val v = get(info.id) ?: return "New"
        return when (info.scoring) {
            Scoring.Best -> "Best: $v"
            Scoring.Fewest -> "Best: $v moves"
            Scoring.Wins -> "Wins: $v"
        }
    }
}

/**
 * The Games section: a menu of classic games played with the remote's arrows and OK (or the
 * on-screen buttons on a phone). Back leaves a game for the menu, and the menu for the channels.
 */
@Composable
fun GamesScreen(onClose: () -> Unit) {
    val context = LocalContext.current
    val scores = remember { GameScores(context) }
    var openId by rememberSaveable { mutableStateOf<String?>(null) }
    var lastId by rememberSaveable { mutableStateOf(GAMES.first().id) }
    val open = GAMES.firstOrNull { it.id == openId }
    BackHandler { if (open != null) openId = null else onClose() }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.fillMaxSize().safeDrawingPadding()) {
            if (open == null) {
                GameMenu(scores, lastId, onPick = { lastId = it.id; openId = it.id }, onClose = onClose)
            } else {
                GamePlay(open, scores)
            }
        }
    }
}

@Composable
private fun GameMenu(scores: GameScores, lastId: String, onPick: (GameInfo) -> Unit, onClose: () -> Unit) {
    val focus = remember { GAMES.associate { it.id to FocusRequester() } }
    LaunchedEffect(Unit) {
        delay(50)
        runCatching { focus.getValue(lastId).requestFocus() }
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose, modifier = Modifier.focusGlow()) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back to channels")
            }
            Spacer(Modifier.width(8.dp))
            Text("🎮 Games", fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(16.dp))
            Text(
                "Play with the arrows and OK on your remote",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 15.sp,
            )
        }
        Spacer(Modifier.height(12.dp))
        LazyVerticalGrid(
            columns = GridCells.Adaptive(170.dp),
            contentPadding = PaddingValues(8.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            itemsIndexed(GAMES, key = { _, g -> g.id }) { _, g ->
                Surface(
                    onClick = { onPick(g) },
                    shape = CardShape,
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    modifier = Modifier.focusRequester(focus.getValue(g.id)).focusGlow(CardShape),
                ) {
                    Column(
                        Modifier.fillMaxWidth().padding(vertical = 18.dp, horizontal = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(g.icon, fontSize = 44.sp)
                        Spacer(Modifier.height(8.dp))
                        Text(g.name, fontWeight = FontWeight.Bold, fontSize = 17.sp, textAlign = TextAlign.Center, maxLines = 1)
                        Text(scores.label(g), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

private val OK_KEYS = setOf(
    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER,
    KeyEvent.KEYCODE_SPACE, KeyEvent.KEYCODE_BUTTON_A,
)

private fun padFor(keyCode: Int): Pad? = when (keyCode) {
    KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_W, KeyEvent.KEYCODE_CHANNEL_UP -> Pad.Up
    KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_S, KeyEvent.KEYCODE_CHANNEL_DOWN -> Pad.Down
    KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_A -> Pad.Left
    KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_D -> Pad.Right
    in OK_KEYS -> Pad.Ok
    else -> null
}

/** Phones and tablets get on-screen buttons; a TV (no touch screen) uses its remote. */
private fun hasTouch(context: Context) =
    context.packageManager.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN)

@Composable
private fun GamePlay(info: GameInfo, scores: GameScores) {
    val context = LocalContext.current
    val touch = remember { hasTouch(context) }
    var game by remember(info.id) { mutableStateOf(info.create()) }
    val frame = remember { mutableIntStateOf(0) }
    var recorded by remember(game) { mutableStateOf(false) }
    var overAt by remember(game) { mutableStateOf(0L) }
    val focus = remember { FocusRequester() }
    // OK in Mines: a short press opens a square, a long one plants a flag.
    var okPending by remember { mutableStateOf(false) }
    var holdFired by remember { mutableStateOf(false) }

    fun after() {
        frame.intValue++
        if (game.over && !recorded) {
            recorded = true
            overAt = System.currentTimeMillis()
            scores.record(info, game)
        }
    }

    fun send(p: Pad, down: Boolean) {
        if (game.over) {
            // OK starts again, but not from a button still held when the game ended.
            if (down && p == Pad.Ok && System.currentTimeMillis() - overAt > 800) {
                game = info.create()
                frame.intValue++
            }
            return
        }
        if (down) game.press(p) else game.release(p)
        after()
    }

    LaunchedEffect(game) {
        runCatching { focus.requestFocus() }
        if (game.tickMs <= 0) return@LaunchedEffect
        // Ticks follow the screen's frames, so the game pauses whenever the app isn't showing.
        var last = withFrameMillis { it }
        var spare = 0L
        while (true) {
            val now = withFrameMillis { it }
            val t = game.tickMs
            spare = (spare + now - last).coerceAtMost(t * 4)
            last = now
            if (game.over) continue
            var ran = false
            while (spare >= t && !game.over) {
                game.tick()
                spare -= t
                ran = true
            }
            if (ran) after()
        }
    }

    val keys = Modifier
        .focusRequester(focus)
        .focusable()
        .onKeyEvent { event ->
            val e = event.nativeKeyEvent
            val pad = padFor(e.keyCode) ?: return@onKeyEvent false
            val holdMode = pad == Pad.Ok && game.usesHold && !game.over
            when (e.action) {
                KeyEvent.ACTION_DOWN -> when {
                    holdMode && e.repeatCount == 0 -> { okPending = true; holdFired = false }
                    holdMode -> if (okPending && !holdFired) { holdFired = true; send(Pad.Hold, true) }
                    e.repeatCount == 0 || game.repeats -> send(pad, true)
                }
                KeyEvent.ACTION_UP -> {
                    if (holdMode && okPending && !holdFired) send(Pad.Ok, true)
                    if (pad == Pad.Ok) okPending = false
                    send(pad, false)
                }
            }
            true
        }

    BoxWithConstraints(Modifier.fillMaxSize().then(keys).padding(16.dp)) {
        val wide = maxWidth > maxHeight
        val board: @Composable (Modifier) -> Unit = { m ->
            Box(m, contentAlignment = Alignment.Center) {
                GameBoard(game, frame)
                if (game.over) {
                    frame.intValue
                    GameOver(game, touch)
                }
            }
        }
        val panel: @Composable () -> Unit = { InfoPanel(info, game, frame, scores) }
        if (wide) {
            Row(Modifier.fillMaxSize()) {
                board(Modifier.weight(1f).fillMaxHeight())
                Spacer(Modifier.width(20.dp))
                Column(Modifier.width(260.dp).fillMaxHeight()) {
                    panel()
                    Spacer(Modifier.weight(1f))
                    if (touch) ControlPad(game.usesHold, game.repeats) { p, down -> send(p, down) }
                }
            }
        } else {
            Column(Modifier.fillMaxSize()) {
                panel()
                Spacer(Modifier.height(8.dp))
                board(Modifier.weight(1f).fillMaxWidth())
                if (touch) {
                    Spacer(Modifier.height(8.dp))
                    ControlPad(game.usesHold, game.repeats) { p, down -> send(p, down) }
                }
            }
        }
    }
}

@Composable
private fun InfoPanel(info: GameInfo, game: Game, frame: MutableIntState, scores: GameScores) {
    frame.intValue
    Column {
        Text("${info.icon} ${info.name}", fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        val scoreLine = when (info.scoring) {
            Scoring.Fewest -> null
            Scoring.Wins -> null
            Scoring.Best -> "Score ${game.score}"
        }
        if (scoreLine != null) Text(scoreLine, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = FocusColor)
        if (game.status.isNotEmpty()) Text(game.status, fontSize = 17.sp)
        Text(scores.label(info), fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(10.dp))
        Text(info.help, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Back: games menu", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun GameOver(game: Game, touch: Boolean) {
    Box(
        Modifier
            .background(Color.Black.copy(alpha = 0.8f), RoundedCornerShape(16.dp))
            .border(2.dp, FocusColor, RoundedCornerShape(16.dp))
            .padding(horizontal = 28.dp, vertical = 20.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(game.message, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            Text(
                if (touch) "Tap OK to play again" else "Press OK to play again",
                color = FocusColor,
                fontSize = 18.sp,
            )
        }
    }
}

/** On-screen arrows and OK for touch screens. Holding a button repeats it where the game wants that. */
@Composable
private fun ControlPad(usesHold: Boolean, repeats: Boolean, send: (Pad, Boolean) -> Unit) {
    val scope = rememberCoroutineScope()
    val sendNow by rememberUpdatedState(send)
    val holdNow by rememberUpdatedState(usesHold)
    val repeatNow by rememberUpdatedState(repeats)

    @Composable
    fun PadButton(p: Pad, label: String) {
        Box(
            Modifier
                .size(64.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(14.dp))
                .pointerInput(p) {
                    if (p == Pad.Ok) {
                        detectTapGestures(
                            onTap = { if (holdNow) { sendNow(Pad.Ok, true) } },
                            onLongPress = { if (holdNow) sendNow(Pad.Hold, true) },
                            onPress = {
                                if (!holdNow) {
                                    sendNow(Pad.Ok, true)
                                    tryAwaitRelease()
                                    sendNow(Pad.Ok, false)
                                }
                            },
                        )
                    } else {
                        detectTapGestures(onPress = {
                            sendNow(p, true)
                            var again: Job? = null
                            if (repeatNow) {
                                again = scope.launch {
                                    delay(300)
                                    while (true) {
                                        sendNow(p, true)
                                        delay(90)
                                    }
                                }
                            }
                            tryAwaitRelease()
                            again?.cancel()
                            sendNow(p, false)
                        })
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            Text(label, fontSize = if (p == Pad.Ok) 18.sp else 26.sp, fontWeight = FontWeight.Bold)
        }
    }

    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        PadButton(Pad.Up, "▲")
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PadButton(Pad.Left, "◀")
            PadButton(Pad.Ok, "OK")
            PadButton(Pad.Right, "▶")
        }
        PadButton(Pad.Down, "▼")
    }
}
