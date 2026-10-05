package com.iqraquran.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.iqraquran.app.R

val Green = Color(0xFF0B5D45)
val GreenDark = Color(0xFF06261D)
val GreenCard = Color(0xFF0F3B2E)
val Gold = Color(0xFFF2C14E)
val Cream = Color(0xFFFFF8E7)
val FocusColor = Color(0xFFFFD54F)
val Good = Color(0xFF43A047)
val Bad = Color(0xFFE53935)
val TileShape: Shape = RoundedCornerShape(18.dp)

/** Bright colours for the kids' lesson tiles and profiles. */
val KidColors = listOf(
    Color(0xFF26A69A), Color(0xFFEF6C00), Color(0xFF7E57C2), Color(0xFF29B6F6),
    Color(0xFFEC407A), Color(0xFF9CCC65), Color(0xFFFFA726), Color(0xFF5C6BC0),
)

/** Scheherazade New (SIL Open Font License): a font made for the Quran's full set of marks. */
val QuranFont = FontFamily(Font(R.font.scheherazade))

private val colors = darkColorScheme(
    primary = Gold,
    onPrimary = GreenDark,
    secondary = Color(0xFF80CBC4),
    background = GreenDark,
    surface = GreenCard,
    surfaceVariant = Color(0xFF16483A),
    onSurfaceVariant = Color(0xFFCFE3DA),
)

@Composable
fun IqraTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors) {
        Surface(color = colors.background, contentColor = colors.onBackground, content = content)
    }
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
