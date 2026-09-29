package com.livetv.app.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp

/**
 * Lets the user choose where channels come from: an M3U URL, an M3U file
 * on the device, or the bundled sample playlist.
 */
@Composable
fun SettingsDialog(
    currentSource: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    val context = LocalContext.current
    var url by rememberSaveable {
        mutableStateOf(if (currentSource.startsWith("content://")) "" else currentSource)
    }

    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            onSave(uri.toString())
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Channel playlist") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "Paste the URL of an M3U / M3U8 playlist you have the right to watch, " +
                        "or open a playlist file from this device.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("Playlist URL") },
                    placeholder = { Text("https://example.com/playlist.m3u") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedButton(
                    onClick = { pickFile.launch(arrayOf("*/*")) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Open playlist file") }
                TextButton(
                    onClick = { onSave("") },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Use built-in sample channels") }
                if (currentSource.startsWith("content://")) {
                    Text(
                        "Currently using a playlist file from this device.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    // Keep a picked file when the URL box was left empty.
                    val keepFile = url.isBlank() && currentSource.startsWith("content://")
                    onSave(if (keepFile) currentSource else url)
                },
                enabled = url.isBlank() || url.trim().startsWith("http", ignoreCase = true),
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
