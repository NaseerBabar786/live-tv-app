package com.livecam.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
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

val LiveRed = Color(0xFFE53935)
val FocusColor = Color(0xFF1DE9B6)
val TileShape: Shape = RoundedCornerShape(14.dp)

private val colors = darkColorScheme(
    primary = FocusColor,
    onPrimary = Color(0xFF00201A),
    secondary = LiveRed,
    background = Color(0xFF0B0F17),
    surface = Color(0xFF151B26),
    surfaceVariant = Color(0xFF212A38),
    onSurfaceVariant = Color(0xFFC3CCDA),
)

@Composable
fun LiveCamTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, content = content)
}

/**
 * Outline and slight zoom on whatever the TV remote is on. No effect on touch,
 * where nothing takes focus.
 */
fun Modifier.focusRing(shape: Shape = TileShape): Modifier = composed {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (focused) 1.04f else 1f, label = "focusScale")
    this
        .onFocusChanged { focused = it.hasFocus }
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .then(if (focused) Modifier.border(3.dp, FocusColor, shape) else Modifier)
}
