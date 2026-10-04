package com.livetv.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.data.Cp24Screen
import com.livetv.app.data.NewsScreen

/** Settings: what each spot of News mode shows. OK (or a tap) moves a spot on to its next choice. */
@Composable
fun NewsScreenSection() {
    val choices by NewsScreen.choices.collectAsStateWithLifecycle()
    Text("Customize News screen", fontWeight = FontWeight.Bold)
    Text(
        "Press OK on a spot to change what it shows. The sponsor corner stays.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.secondary,
    )
    NewsScreen.Slot.entries.forEach { slot ->
        ChoiceRow(slot.label, choices[slot].label) { NewsScreen.next(slot) }
    }
    ChoiceRow("Bottom line", choices.bottom.label) { NewsScreen.nextBottom() }
    TextButton(onClick = { NewsScreen.reset() }, modifier = Modifier.focusGlow()) { Text("Back to the usual screen") }
}

@Composable
private fun ChoiceRow(label: String, value: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .focusGlow(ChipShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text("$value  ›", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
    }
}

/** Settings: what each section of CP24 mode shows. */
@Composable
fun Cp24ScreenSection() {
    val choices by Cp24Screen.choices.collectAsStateWithLifecycle()
    Text("Customize CP24 screen", fontWeight = FontWeight.Bold)
    Text(
        "Press OK on a section to change what it shows. The sponsor stays.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.secondary,
    )
    Cp24Screen.Section.entries.forEach { section ->
        ChoiceRow(section.label, choices[section]) { Cp24Screen.next(section) }
    }
    TextButton(onClick = { Cp24Screen.reset() }, modifier = Modifier.focusGlow()) { Text("Back to the usual CP24 screen") }
}
