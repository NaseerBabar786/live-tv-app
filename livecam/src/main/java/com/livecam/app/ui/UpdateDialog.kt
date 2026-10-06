package com.livecam.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** The "New update available" reminder, then download progress and the install prompt. Nothing shows while idle. */
@Composable
fun UpdateDialog(state: UpdateState, onInstall: () -> Unit, onDismiss: () -> Unit) {
    when (state) {
        UpdateState.Idle -> Unit
        is UpdateState.Available -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("New update available") },
            text = { Text("Live Cam ${state.release.version} is ready. Your settings are kept.") },
            confirmButton = {
                TextButton(onClick = onInstall, modifier = Modifier.focusRing(CircleShape)) { Text("Update") }
            },
            dismissButton = {
                TextButton(onClick = onDismiss, modifier = Modifier.focusRing(CircleShape)) { Text("Later") }
            },
        )
        is UpdateState.Downloading -> AlertDialog(
            onDismissRequest = {},
            title = { Text("Updating to Live Cam ${state.release.version}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Downloading the new version… ${(state.progress * 100).toInt()}%")
                    LinearProgressIndicator(progress = { state.progress }, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {},
        )
        is UpdateState.ReadyToInstall -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Live Cam ${state.release.version} is ready") },
            text = {
                Text(
                    if (state.needsPermission) {
                        "Allow Live Cam to install apps in the screen that opened (one time only), " +
                            "then come back and press Install."
                    } else {
                        "Press Install on the next screen, then Open to start the new version."
                    }
                )
            },
            confirmButton = {
                TextButton(onClick = onInstall, modifier = Modifier.focusRing(CircleShape)) { Text("Install") }
            },
            dismissButton = {
                TextButton(onClick = onDismiss, modifier = Modifier.focusRing(CircleShape)) { Text("Later") }
            },
        )
        is UpdateState.Failed -> AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Update failed") },
            text = { Text(state.message) },
            confirmButton = {
                TextButton(onClick = onDismiss, modifier = Modifier.focusRing(CircleShape)) { Text("OK") }
            },
        )
    }
}
