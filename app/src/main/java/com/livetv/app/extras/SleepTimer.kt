package com.livetv.app.extras

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.ui.CardShape
import com.livetv.app.ui.ChipShape
import com.livetv.app.ui.FocusColor
import com.livetv.app.ui.focusGlow
import kotlinx.coroutines.delay

/** "Turn off in": Off, 15, 30, 60, 90 or 120 minutes (owner, 2026-10-09). Free for everyone. */
@Composable
fun SleepTimerDialog(onDismiss: () -> Unit) {
    val at by Extras.sleepAt.collectAsStateWithLifecycle()
    val left = at?.let { ((it - System.currentTimeMillis()) / 60_000L).toInt() + 1 }
    val first = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { delay(100); first.requestFocus() } }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("💤 Sleep timer") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    if (left != null) "Cable TV turns off in about $left min." else "Cable TV closes by itself after the time you pick.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.secondary,
                )
                Extras.SLEEP_CHOICES.forEachIndexed { i, minutes ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .then(if (i == 0) Modifier.focusRequester(first) else Modifier)
                            .focusGlow(ChipShape)
                            .clickable { Extras.setSleep(minutes); onDismiss() }
                            .padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = if (minutes == 0) at == null else false, onClick = null)
                        Text(
                            when (minutes) {
                                0 -> "Off"
                                60 -> "1 hour"
                                90 -> "1½ hours"
                                120 -> "2 hours"
                                else -> "$minutes minutes"
                            },
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Close") } },
    )
}

/**
 * A minute before the sleep timer ends: "Still watching?" with Keep watching (the timer goes off) and Turn off now.
 * If nobody presses anything, [onSleep] closes the app.
 */
@Composable
fun SleepWarning(onSleep: () -> Unit) {
    val at by Extras.sleepAt.collectAsStateWithLifecycle()
    val end = at ?: return
    var now by remember(end) { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(end) {
        while (true) {
            now = System.currentTimeMillis()
            if (now >= end) {
                Extras.setSleep(0)
                onSleep()
                break
            }
            delay(1_000)
        }
    }
    if (end - now > 60_000L) return
    val keep = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { delay(100); keep.requestFocus() } }
    OnTop(onBack = { Extras.setSleep(0) }) {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
        Column(
            Modifier
                .widthIn(max = 460.dp)
                .background(Color(0xF0101828), CardShape)
                .border(2.dp, FocusColor, CardShape)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("💤 Still watching?", color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text(
                "The sleep timer turns Cable TV off in ${((end - now) / 1000).coerceAtLeast(0)} seconds.",
                color = Color.White.copy(alpha = 0.85f),
            )
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { Extras.setSleep(0) }, modifier = Modifier.focusRequester(keep).focusGlow()) { Text("Keep watching") }
                OutlinedButton(onClick = { Extras.setSleep(0); onSleep() }, modifier = Modifier.focusGlow()) {
                    Text("Turn off now", color = Color.White)
                }
            }
        }
    }
    }
}
