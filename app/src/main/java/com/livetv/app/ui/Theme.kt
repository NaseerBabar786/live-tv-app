package com.livetv.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Soft dark blue behind channel numbers and the selected filter. */
val AccentBlue = Color(0xFF2B4C7E)

private val colors = darkColorScheme(
    primary = Color(0xFFE53935),
    onPrimary = Color.White,
    secondary = Color(0xFFFFB300),
    background = Color(0xFF121218),
    surface = Color(0xFF1E1E2E),
    surfaceVariant = Color(0xFF2A2A3C),
    onSurfaceVariant = Color(0xFFCACAD8),
)

@Composable
fun LiveTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, content = content)
}
