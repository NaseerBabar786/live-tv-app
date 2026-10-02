package com.livetv.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.livetv.app.data.Playlist

/**
 * The viewer's saved playlists, one row each: the name (select to watch it; the one
 * showing is ticked) and a Remove button that asks before removing.
 */
@Composable
fun PlaylistRows(
    playlists: List<Playlist>,
    currentSource: String,
    onSelect: (Playlist) -> Unit,
    onRemove: (Playlist) -> Unit,
) {
    var removing by remember { mutableStateOf<Playlist?>(null) }
    playlists.forEach { playlist ->
        val selected = playlist.source == currentSource
        Row(verticalAlignment = Alignment.CenterVertically) {
            val label: @Composable () -> Unit = {
                Text(
                    if (selected) "✓ ${playlist.name}" else playlist.name,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            val rowModifier = Modifier.weight(1f).focusGlow()
            if (selected) {
                AccentButton(onClick = { onSelect(playlist) }, modifier = rowModifier) { label() }
            } else {
                OutlinedButton(onClick = { onSelect(playlist) }, modifier = rowModifier) { label() }
            }
            TextButton(onClick = { removing = playlist }, modifier = Modifier.focusGlow()) { Text("Remove") }
        }
    }
    removing?.let { playlist ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text("Remove playlist?") },
            text = { Text("\"${playlist.name}\" will be removed. You can add it again later.") },
            confirmButton = {
                AccentButton(
                    onClick = {
                        removing = null
                        onRemove(playlist)
                    },
                    modifier = Modifier.focusGlow(),
                ) { Text("Remove") }
            },
            dismissButton = {
                TextButton(onClick = { removing = null }, modifier = Modifier.focusGlow()) { Text("Cancel") }
            },
        )
    }
}

/** Asks for a playlist link (and an optional name) typed or pasted in. */
@Composable
fun AddLinkDialog(suggestedName: String, onDismiss: () -> Unit, onAdd: (name: String, url: String) -> Unit) {
    var url by rememberSaveable { mutableStateOf("") }
    var name by rememberSaveable { mutableStateOf("") }
    val valid = url.trim().let { it.startsWith("http://", true) || it.startsWith("https://", true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add playlist link") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("Playlist link (M3U)") },
                    placeholder = { Text("https://…/playlist.m3u") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name (optional)") },
                    placeholder = { Text(linkName(url) ?: suggestedName) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            AccentButton(
                onClick = { onAdd(name.ifBlank { linkName(url) ?: suggestedName }, url.trim()) },
                enabled = valid,
                modifier = Modifier.focusGlow(),
            ) { Text("Add") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Cancel") }
        },
    )
}

/** File names that say nothing about the playlist, so the site's name is used instead. */
private val genericNames = setOf("playlist", "index", "get", "list", "channels", "iptv", "tv", "live", "m3u", "download")

/**
 * A name for a playlist added by link: the file name without its extension
 * ("LiveTV" for https://example.com/LiveTV.m3u), or the site's name when the file
 * name is a generic one like playlist.m3u or get.php. Null when the link can't be read.
 */
fun linkName(url: String): String? {
    val uri = runCatching { java.net.URI(url.trim()) }.getOrNull() ?: return null
    val host = uri.host?.removePrefix("www.")?.takeIf { it.isNotBlank() } ?: return null
    val file = uri.path.orEmpty().trimEnd('/').substringAfterLast('/').substringBeforeLast('.').trim()
    return file.takeIf { it.isNotEmpty() && it.lowercase() !in genericNames } ?: host
}

/** "Playlist 1", "Playlist 2"… the first one not already used. */
fun nextPlaylistName(playlists: List<Playlist>): String {
    var n = playlists.size + 1
    while (playlists.any { it.name == "Playlist $n" }) n++
    return "Playlist $n"
}
