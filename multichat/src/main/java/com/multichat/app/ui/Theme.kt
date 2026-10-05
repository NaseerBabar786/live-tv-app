package com.multichat.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Bg = Color(0xFF0B141A)
val Bar = Color(0xFF111B21)
val Panel = Color(0xFF202C33)
val Line = Color(0xFF2A3942)
val Ink = Color(0xFFE9EDEF)
val Muted = Color(0xFF8696A0)
val Accent = Color(0xFF21C063)
val Danger = Color(0xFFF15C6D)

private val colors = darkColorScheme(
    primary = Accent,
    onPrimary = Bg,
    secondary = Accent,
    background = Bg,
    onBackground = Ink,
    surface = Bar,
    onSurface = Ink,
    surfaceVariant = Panel,
    onSurfaceVariant = Muted,
    surfaceContainer = Panel,
    surfaceContainerHigh = Panel,
    surfaceContainerHighest = Line,
    outline = Line,
    error = Danger,
)

@Composable
fun MultiChatTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, content = content)
}
