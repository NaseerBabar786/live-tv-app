package com.livetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** Settings: the whole app's colours, and the text size. */
@Composable
fun ThemeSection() {
    Text("Themes and styles", fontWeight = FontWeight.Bold)
    Text(
        "Colours for the whole app. Press OK on one to use it.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.secondary,
    )
    Themes.all.forEach { p ->
        val picked = p === Themes.current
        Row(
            Modifier
                .fillMaxWidth()
                .focusGlow(ChipShape)
                .clickable { Themes.pick(p) }
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // A little preview: background, card, main colour and highlight.
            Row(
                Modifier
                    .background(p.background, ChipShape)
                    .border(1.dp, Color.White.copy(alpha = 0.25f), ChipShape)
                    .padding(horizontal = 6.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                listOf(p.surfaceVariant, p.primary, p.focus).forEach { c ->
                    Box(Modifier.size(14.dp).background(c, CircleShape))
                }
            }
            Spacer(Modifier.width(12.dp))
            Text(p.name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            if (picked) Text("✓", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
        }
    }
    Row(
        Modifier
            .fillMaxWidth()
            .focusGlow(ChipShape)
            .clickable { Themes.nextSize() }
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Text size", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text("${Themes.sizeName}  ›", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
    }
}
