package com.appbazaar.app.ui

import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp

// The same colours as apps.bulkbazaar.ca: white pages, Play-store green buttons, teal logo.
val Bg = Color(0xFFFFFFFF)
val Soft = Color(0xFFF1F3F4)
val Ink = Color(0xFF202124)
val Muted = Color(0xFF5F6368)
val Line = Color(0xFFDADCE0)
val Green = Color(0xFF01875F)
val GreenDark = Color(0xFF056449)
val GreenSoft = Color(0xFFE6F3EF)
val Teal = Color(0xFF12999C)
val TealDeep = Color(0xFF0B8A8F)
val LogoInk = Color(0xFF1B2A35)
/** The ring that shows where the TV remote is: the logo's teal, thick enough to see from the sofa. */
val FocusRing = Color(0xFF0B8A8F)

private val Colors = lightColorScheme(
    primary = Green,
    onPrimary = Color.White,
    secondary = Teal,
    background = Bg,
    onBackground = Ink,
    surface = Bg,
    onSurface = Ink,
    surfaceVariant = Soft,
    onSurfaceVariant = Muted,
    outline = Line,
)

@Composable
fun StoreTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, content = content)
}

/** A clickable card: a thin grey line normally, a thick teal ring and a slight lift when the remote is on it. */
@Composable
fun FocusSurface(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(16.dp),
    color: Color = Bg,
    border: Color? = Line,
    grow: Boolean = true,
    content: @Composable () -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val s by animateFloatAsState(if (focused && grow) 1.03f else 1f, label = "focus")
    Surface(
        onClick = onClick,
        modifier = modifier.scale(s),
        shape = shape,
        color = color,
        border = when {
            focused -> BorderStroke(3.dp, FocusRing)
            border != null -> BorderStroke(1.dp, border)
            else -> null
        },
        shadowElevation = if (focused) 10.dp else 0.dp,
        interactionSource = source,
        content = content,
    )
}

/** The green Install button of the website, with the remote-focus ring. */
@Composable
fun FocusButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    container: Color = Green,
    content: @Composable RowScope.() -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    Button(
        onClick = onClick,
        modifier = modifier.heightIn(min = 40.dp),
        enabled = enabled,
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = container, contentColor = Color.White,
            disabledContainerColor = Soft, disabledContentColor = Muted,
        ),
        border = if (focused) BorderStroke(3.dp, FocusRing) else null,
        contentPadding = PaddingValues(horizontal = 22.dp, vertical = 8.dp),
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
        modifier = modifier.heightIn(min = 40.dp),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(if (focused) 3.dp else 1.dp, if (focused) FocusRing else Line),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = GreenDark, containerColor = Bg),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        interactionSource = source,
        content = content,
    )
}
