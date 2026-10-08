package com.livetv.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp

/** Bright highlight colour (the theme's; yellow in Midnight) for whatever the TV remote's cursor is on. */
val FocusColor: Color get() = Themes.current.focus

val PillShape: Shape = CircleShape
val ChipShape: Shape = RoundedCornerShape(8.dp)
val CardShape: Shape = RoundedCornerShape(12.dp)

/**
 * Makes the focused item stand out when moving around with a TV remote or keyboard:
 * it grows slightly and gets a bright yellow outline and glow. Has no effect on touch,
 * where nothing takes focus.
 */
fun Modifier.focusGlow(shape: Shape = PillShape): Modifier = composed {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (focused) 1.08f else 1f, label = "focusScale")
    this
        .onFocusChanged { focused = it.hasFocus }
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .then(
            if (focused) {
                Modifier
                    .background(FocusColor.copy(alpha = 0.3f), shape)
                    .border(3.dp, FocusColor, shape)
            } else {
                Modifier
            }
        )
}

/**
 * Makes a text box easy to use with a TV remote: it gets the same bright outline as buttons,
 * OK opens the on-screen keyboard, and Up/Down always move to the next item instead of being
 * caught by the text box (some remotes don't report themselves as a D-pad, so the text box would
 * keep the cursor and the screen felt stuck). Left/Right still move inside the text.
 */
fun Modifier.remoteTextField(): Modifier = composed {
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    this
        .focusGlow(RoundedCornerShape(6.dp))
        .onPreviewKeyEvent { e ->
            if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
            when (e.key) {
                Key.DirectionDown -> { focusManager.moveFocus(FocusDirection.Down); true }
                Key.DirectionUp -> { focusManager.moveFocus(FocusDirection.Up); true }
                Key.DirectionCenter, Key.Enter, Key.NumPadEnter -> { keyboard?.show(); true }
                else -> false
            }
        }
}
