package com.livetv.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp

/** The theme's accent (very dark navy in Midnight) behind channel numbers and the selected filter. */
val AccentBlue: Color get() = Themes.current.accent

/** The theme's colours for Material (see [Themes]). */
private fun colorsOf(p: Palette): ColorScheme {
    val base = if (p.dark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = p.primary,
        onPrimary = Color.White,
        secondary = p.secondary,
        onSecondary = Color.Black,
        background = p.background,
        onBackground = p.onSurface,
        surface = p.surface,
        onSurface = p.onSurface,
        surfaceVariant = p.surfaceVariant,
        onSurfaceVariant = p.onSurfaceVariant,
        surfaceContainer = p.surface,
        surfaceContainerLow = p.surface,
        surfaceContainerLowest = p.background,
    )
}

/** Soft text colour (light blue in Midnight) for text, outlines and ticks on the Settings screens. */
val AccentText: Color get() = Themes.current.accentText

/**
 * Settings uses the main page's colours: the card colour behind the dialogs and the
 * accent for buttons (see [AccentButton]) instead of the red.
 */
@Composable
fun SettingsTheme(content: @Composable () -> Unit) {
    val p = Themes.current
    val colors = colorsOf(p)
    MaterialTheme(
        colorScheme = colors.copy(
            primary = p.accentText,
            onPrimary = if (p.dark) p.accent else Color.White,
            surfaceContainerHigh = colors.surface,
            surfaceContainerHighest = colors.surfaceVariant,
        ),
        content = content,
    )
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

/** The whole app's look: the theme and text size picked in Settings > Themes and styles. */
@Composable
fun LiveTvTheme(content: @Composable () -> Unit) {
    val density = LocalDensity.current
    MaterialTheme(colorScheme = colorsOf(Themes.current)) {
        CompositionLocalProvider(
            LocalDensity provides Density(density.density, density.fontScale * Themes.textScale),
            content = content,
        )
    }
}
