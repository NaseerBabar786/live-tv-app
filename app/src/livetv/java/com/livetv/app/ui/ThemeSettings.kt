package com.livetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.TextButton
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
import com.livetv.app.Plans

/** Settings: the theme in use (the list opens in its own menu) and the text size. */
@Composable
fun ThemeSection(onPick: () -> Unit) {
    Text("Themes and styles", fontWeight = FontWeight.Bold)
    Text(
        "Colours for the whole app, ${Themes.all.size} to choose from." +
            if (Plans.has(Plans.Feature.Themes)) "" else " A Gold feature: try one for 1 minute.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.secondary,
    )
    OutlinedButton(onClick = onPick, modifier = Modifier.fillMaxWidth().focusGlow()) {
        Swatches(Themes.current)
        Spacer(Modifier.width(10.dp))
        Text("Theme: ${Themes.current.name}  ›")
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

/** The themes menu: every theme with a little preview. OK on one uses it straight away. */
@Composable
fun ThemePicker(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Themes") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Themes.all.forEach { p ->
                    val picked = p === Themes.current
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .focusGlow(ChipShape)
                            // A theme on Free: a minute's try (Plans.ask), then the usual theme comes back.
                            .clickable { Plans.ask("Themes", Plans.Feature.Themes); Themes.pick(p) }
                            .padding(horizontal = 8.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Swatches(p)
                        Spacer(Modifier.width(12.dp))
                        Text(p.name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        if (picked) Text("✓", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Done") }
        },
    )
}

/** A little preview of a theme: background, card, main colour and highlight. */
@Composable
private fun Swatches(p: Palette) {
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
}
