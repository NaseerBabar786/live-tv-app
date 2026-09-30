package com.livetv.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Very dark navy (near black, still blue) behind channel numbers and the selected filter. */
val AccentBlue = Color(0xFF0D1B3A)

private val colors = darkColorScheme(
    primary = Color(0xFFE53935),
    onPrimary = Color.White,
    secondary = Color(0xFFFFB300),
    background = Color(0xFF121218),
    surface = Color(0xFF1E1E2E),
    surfaceVariant = Color(0xFF2A2A3C),
    onSurfaceVariant = Color(0xFFCACAD8),
)

/** Soft light blue for text, outlines and ticks on the dark Settings screens. */
val AccentText = Color(0xFF9DB8F0)

/**
 * Settings uses the main page's colours: the card colour behind the dialogs and the
 * navy accent for buttons (see [AccentButton]) instead of the red.
 */
private val settingsColors = colors.copy(
    primary = AccentText,
    onPrimary = AccentBlue,
    surfaceContainerHigh = colors.surface,
    surfaceContainerHighest = colors.surfaceVariant,
)

@Composable
fun SettingsTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = settingsColors, content = content)
}

/**
 * A filled button in the main page's navy, with a light blue edge so it stands out.
 * The 48dp touch-target padding is turned off so the button's bounds match the pill,
 * otherwise [focusGlow]'s ring is drawn taller than the button with a gap above and below.
 */
@Composable
fun AccentButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit,
) {
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
        Button(
            onClick = onClick,
            modifier = modifier,
            enabled = enabled,
            colors = ButtonDefaults.buttonColors(containerColor = AccentBlue, contentColor = Color.White),
            border = BorderStroke(1.dp, AccentText),
            content = content,
        )
    }
}

@Composable
fun LiveTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, content = content)
}
