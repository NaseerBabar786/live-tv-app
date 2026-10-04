package com.livetv.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
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
import com.livetv.app.data.MyScreen
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

/** Settings: My Screen mode's layout, style, colour and information. */
@Composable
fun MyScreenSection() {
    val choices by MyScreen.choices.collectAsStateWithLifecycle()
    Text("Customize My Screen", fontWeight = FontWeight.Bold)
    Text(
        "Press OK to change each one. Whatever you pick fills the whole screen; the sponsor and the ticker stay.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.secondary,
    )
    MyScreen.Section.entries.forEach { section ->
        ChoiceRow(section.label, choices[section]) { MyScreen.next(section) }
    }
    TextButton(onClick = { MyScreen.reset() }, modifier = Modifier.focusGlow()) { Text("Back to the usual My Screen") }
}

/** Which screen's settings [ScreenSettings] shows. */
enum class ScreenKind { News, Cp24, Mine }

/**
 * The screen's own settings, opened from inside the mode (hold OK, Menu, or tap ⚙). A panel on
 * the right with the screen still bright behind it, so each change shows straight away.
 * Back or Done closes it.
 */
@Composable
fun ScreenSettings(section: ScreenKind, onDone: () -> Unit) {
    androidx.compose.ui.window.Dialog(
        onDismissRequest = onDone,
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false),
    ) {
        // No dimming: the viewer watches the screen change behind the panel.
        val view = androidx.compose.ui.platform.LocalView.current
        androidx.compose.runtime.SideEffect {
            (view.parent as? androidx.compose.ui.window.DialogWindowProvider)?.window?.setDimAmount(0f)
        }
        val done = remember { FocusRequester() }
        LaunchedEffect(Unit) { runCatching { done.requestFocus() } }
        SettingsTheme {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterEnd) {
                Surface(
                    modifier = Modifier.fillMaxWidth(0.42f).widthIn(min = 280.dp, max = 380.dp).fillMaxHeight(),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
                    shape = RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp),
                ) {
                    Column(
                        Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        AccentButton(onClick = onDone, modifier = Modifier.focusRequester(done).focusGlow()) { Text("Done") }
                        when (section) {
                            ScreenKind.News -> NewsScreenSection()
                            ScreenKind.Cp24 -> Cp24ScreenSection()
                            ScreenKind.Mine -> MyScreenSection()
                        }
                    }
                }
            }
        }
    }
}
