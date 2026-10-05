package com.appbazaar.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp

val Accent = Color(0xFF2FBFBF)
val AccentDark = Color(0xFF12999C)
val Bg = Color(0xFF101418)
val Panel = Color(0xFF1A2027)
val Muted = Color(0xFFA9B4BF)
/** The bright ring that shows where the TV remote is. */
val FocusRing = Color(0xFFFFD54F)

private val Colors = darkColorScheme(
    primary = AccentDark,
    onPrimary = Color.White,
    secondary = Accent,
    background = Bg,
    onBackground = Color.White,
    surface = Panel,
    onSurface = Color.White,
    surfaceVariant = Color(0xFF242C35),
    onSurfaceVariant = Muted,
)

@Composable
fun StoreTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, content = content)
}

/** A clickable panel that shows a thick ring when the TV remote is on it. */
@Composable
fun FocusSurface(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(16.dp),
    color: Color = Panel,
    content: @Composable () -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = shape,
        color = if (focused) Color(0xFF2A333D) else color,
        border = if (focused) BorderStroke(3.dp, FocusRing) else null,
        interactionSource = source,
        content = content,
    )
}

/** Filled button with the same remote-focus ring. */
@Composable
fun FocusButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    container: Color = AccentDark,
    content: @Composable RowScope.() -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    Button(
        onClick = onClick,
        modifier = modifier.heightIn(min = 44.dp),
        enabled = enabled,
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(containerColor = container, contentColor = Color.White),
        border = if (focused) BorderStroke(3.dp, FocusRing) else null,
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
        interactionSource = source,
        content = content,
    )
}

@Composable
fun FocusOutlinedButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.heightIn(min = 44.dp),
        shape = RoundedCornerShape(10.dp),
        border = BorderStroke(if (focused) 3.dp else 1.dp, if (focused) FocusRing else Color(0xFF3A4550)),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Accent),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp),
        interactionSource = source,
        content = content,
    )
}
