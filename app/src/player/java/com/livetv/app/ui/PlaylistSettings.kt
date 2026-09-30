package com.livetv.app.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.livetv.app.Edition
import com.livetv.app.data.ChannelRepository
import com.livetv.app.data.Playlist

/**
 * Stream Player Plus settings: the viewer's saved playlists, and adding one from a
 * link or from a file on the device.
 */
@Composable
fun PlaylistSettingsDialog(
    state: UiState,
    onSelect: (Playlist) -> Unit,
    onAdd: (name: String, source: String) -> Unit,
    onTryDemo: () -> Unit,
    onRemove: (Playlist) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val appVersion = remember {
        runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull()
    }
    var addingLink by rememberSaveable { mutableStateOf(false) }

    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            // Keeps access to the file after the app restarts.
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            onAdd(fileName(context, uri) ?: nextPlaylistName(state.playlists), uri.toString())
        }
    }

    if (addingLink) {
        AddLinkDialog(
            suggestedName = nextPlaylistName(state.playlists),
            onDismiss = { addingLink = false },
            onAdd = { name, url ->
                addingLink = false
                onAdd(name, url)
            },
        )
        return
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text("Settings")
                if (appVersion != null) {
                    Text(
                        "Version $appVersion",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                }
            }
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                Text("Playlists", fontWeight = FontWeight.Bold)
                if (state.playlists.isEmpty()) {
                    Text("No playlists yet. Add one below.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                PlaylistRows(
                    playlists = state.playlists,
                    currentSource = state.playlistSource,
                    onSelect = onSelect,
                    onRemove = onRemove,
                )
                OutlinedButton(
                    onClick = { addingLink = true },
                    modifier = Modifier.fillMaxWidth().focusGlow(),
                ) { Text("＋ Add playlist link") }
                OutlinedButton(
                    onClick = {
                        try {
                            pickFile.launch(arrayOf("*/*"))
                        } catch (e: ActivityNotFoundException) {
                            // Many TVs have no file browser.
                            Toast.makeText(context, "This device can't open files. Add a playlist link instead.", Toast.LENGTH_LONG).show()
                        }
                    },
                    modifier = Modifier.fillMaxWidth().focusGlow(),
                ) { Text("＋ Open playlist file") }
                if (state.playlists.none { it.source == ChannelRepository.SOURCE_SAMPLE }) {
                    OutlinedButton(
                        onClick = onTryDemo,
                        modifier = Modifier.fillMaxWidth().focusGlow(),
                    ) { Text("Try demo channels") }
                }

                HorizontalDivider()
                Text(
                    "${Edition.APP_NAME} is a player only. It doesn't include or sell any channels or " +
                        "playlists. Only add playlists you have the right to watch.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Close") }
        },
    )
}

/** The picked file's name without its extension, e.g. "My channels" for "My channels.m3u". */
private fun fileName(context: Context, uri: Uri): String? = runCatching {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst()) c.getString(0)?.substringBeforeLast('.')?.takeIf { it.isNotBlank() } else null
    }
}.getOrNull()
