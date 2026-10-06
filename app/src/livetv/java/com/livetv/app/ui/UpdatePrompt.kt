package com.livetv.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import com.livetv.app.Edition
import com.livetv.app.data.Updater

/**
 * Shown after the start-up check finds a newer approved version: reminds the viewer an update is
 * available and, once they tap Update now, shows the download progress. [update] must be Available, Downloading or NeedsPermission.
 */
@Composable
fun UpdatePromptDialog(
    update: UpdateState,
    onInstall: (Updater.Release) -> Unit,
    onLater: () -> Unit,
) {
    val release = when (update) {
        is UpdateState.Available -> update.release
        is UpdateState.Downloading -> update.release
        is UpdateState.NeedsPermission -> update.release
        else -> return
    }
    val focus = remember { FocusRequester() }
    SettingsTheme {
        AlertDialog(
            onDismissRequest = onLater,
            title = { Text(if (update is UpdateState.Available) "New update available" else "Updating ${Edition.APP_NAME}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "${Edition.APP_NAME} ${release.version} is ready. Your favourites and settings are kept."
                    )
                    when (update) {
                        is UpdateState.Downloading -> {
                            Text("Downloading… ${(update.progress * 100).toInt()}%")
                            LinearProgressIndicator(progress = { update.progress }, modifier = Modifier.fillMaxWidth())
                        }
                        is UpdateState.NeedsPermission -> Text(
                            "Allow Cable TV to install apps in the screen that opened, then come back " +
                                "and press Update now again."
                        )
                        else -> Unit
                    }
                }
            },
            confirmButton = {
                if (update !is UpdateState.Downloading) {
                    AccentButton(
                        onClick = { onInstall(release) },
                        modifier = Modifier.focusRequester(focus).focusGlow(),
                    ) { Text("Update now") }
                    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
                }
            },
            dismissButton = {
                TextButton(onClick = onLater, modifier = Modifier.focusGlow()) { Text("Later") }
            },
        )
    }
}
