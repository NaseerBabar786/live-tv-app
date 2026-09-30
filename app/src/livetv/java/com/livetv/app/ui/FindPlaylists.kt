package com.livetv.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.livetv.app.data.IptvOrg
import com.livetv.app.data.Playlist

/**
 * Browses the playlists iptv-org publishes (by country, language, category or region).
 * Picking one saves it under "My playlists" and shows it on its own; the viewer can
 * remove it later if they don't like it.
 */
@Composable
fun FindPlaylistsDialog(
    saved: List<Playlist>,
    load: suspend () -> Result<List<IptvOrg.Listing>>,
    onAdd: (name: String, url: String) -> Unit,
    onDismiss: () -> Unit,
) {
    var listings by remember { mutableStateOf<List<IptvOrg.Listing>?>(null) }
    var failed by remember { mutableStateOf(false) }
    var kind by rememberSaveable { mutableStateOf(IptvOrg.Kind.COUNTRY) }
    var query by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(Unit) {
        load().onSuccess { listings = it }.onFailure { failed = true }
    }

    val savedUrls = saved.map { it.source }.toSet()
    val shown = listings.orEmpty()
        .filter { it.kind == kind }
        .filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Find playlists online") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(IptvOrg.Kind.entries) { k ->
                        if (k == kind) {
                            AccentButton(onClick = {}, modifier = Modifier.focusGlow()) { Text(k.title) }
                        } else {
                            OutlinedButton(onClick = { kind = k }, modifier = Modifier.focusGlow()) { Text(k.title) }
                        }
                    }
                }
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Search") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                when {
                    failed -> Text("The list of playlists could not be loaded. Check the internet connection and try again.")
                    listings == null -> CircularProgressIndicator(Modifier.padding(16.dp).align(Alignment.CenterHorizontally))
                    else -> LazyColumn(Modifier.heightIn(max = 380.dp)) {
                        items(shown, key = { it.url }) { listing ->
                            val added = listing.url in savedUrls
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .focusGlow(ChipShape)
                                    .clickable { onAdd(listing.name, listing.url) }
                                    .padding(horizontal = 4.dp, vertical = 12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(if (added) "✓ ${listing.name}" else listing.name, modifier = Modifier.weight(1f))
                                listing.channels?.let {
                                    Text("$it", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
                Text(
                    "Pick one to try it. It's saved under My playlists, where you can remove it.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Back") } },
    )
}
