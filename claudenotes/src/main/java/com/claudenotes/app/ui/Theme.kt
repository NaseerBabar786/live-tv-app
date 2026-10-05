package com.claudenotes.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Clay = Color(0xFFD97757)
val Recording = Color(0xFFE5484D)

private val colors = darkColorScheme(
    primary = Clay,
    onPrimary = Color(0xFF1F1410),
    primaryContainer = Color(0xFF5A3324),
    onPrimaryContainer = Color(0xFFFFDBCF),
    secondaryContainer = Color(0xFF3A302A),
    onSecondaryContainer = Color(0xFFF3E3D8),
    background = Color(0xFF16130F),
    onBackground = Color(0xFFF3ECE6),
    surface = Color(0xFF16130F),
    onSurface = Color(0xFFF3ECE6),
    surfaceVariant = Color(0xFF2A2420),
    onSurfaceVariant = Color(0xFFCFC3B9),
    surfaceContainer = Color(0xFF221D19),
    surfaceContainerHigh = Color(0xFF2B2521),
    surfaceContainerHighest = Color(0xFF352E29),
    outline = Color(0xFF8F8178),
)

@Composable
fun NotesTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, content = content)
}
