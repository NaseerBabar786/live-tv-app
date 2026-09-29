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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp

/** Bright highlight colour for whatever the TV remote's cursor is on. */
val FocusColor = Color(0xFFFFD600)

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
