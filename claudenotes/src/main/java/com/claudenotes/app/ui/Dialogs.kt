@file:OptIn(ExperimentalMaterial3Api::class)

package com.claudenotes.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.claudenotes.app.data.Kind
import com.claudenotes.app.data.Note
import com.claudenotes.app.data.Outgoing
import com.claudenotes.app.data.Topic

/** Change a note's words, kind or topic, or delete it. */
@Composable
fun EditNoteDialog(
    note: Note,
    topics: List<String>,
    onSave: (Note) -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    var text by remember { mutableStateOf(note.text) }
    var kind by remember { mutableStateOf(note.kind) }
    var topic by remember { mutableStateOf(note.topic) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit note") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(text, { text = it }, Modifier.fillMaxWidth(), minLines = 3, maxLines = 10)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    Kind.entries.forEachIndexed { i, k ->
                        SegmentedButton(
                            selected = kind == k,
                            onClick = { kind = k },
                            shape = SegmentedButtonDefaults.itemShape(i, Kind.entries.size),
                        ) { Text(k.label) }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Topic", Modifier.padding(end = 12.dp))
                    TopicPicker(topic, (topics + note.topic).distinct()) { topic = it }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(note.copy(text = text.trim(), kind = kind, topic = topic)) }, enabled = text.isNotBlank()) {
                Text("Save")
            }
        },
        dismissButton = {
            Row {
                TextButton(onClick = onDelete) { Text("Delete", color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}

private val LANGUAGES = listOf(
    "" to "Phone's language",
    "en-US" to "English",
    "ur-PK" to "Urdu (اردو)",
    "hi-IN" to "Hindi (हिन्दी)",
    "pa-IN" to "Punjabi (ਪੰਜਾਬੀ)",
)

/**
 * Topics, the Claude project chat each topic goes to, and the voice language.
 * A topic without its own link goes to the main project link.
 */
@Composable
fun SettingsDialog(
    topics: List<Topic>,
    defaultLink: String,
    language: String,
    onSave: (renames: List<Pair<String, String>>, topics: List<Topic>, defaultLink: String, language: String) -> Unit,
    onDismiss: () -> Unit,
) {
    // Each row keeps the topic's original name so a rename can move its notes.
    val rows = remember { mutableStateListOf(*topics.map { Triple(it.name, it.name, it.link) }.toTypedArray()) }
    var main by remember { mutableStateOf(defaultLink) }
    var lang by remember { mutableStateOf(language) }
    var adding by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Topics and settings") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Main Claude project link", style = MaterialTheme.typography.titleSmall)
                Text(
                    "Optional. Open your project chat in Claude, copy its link and paste it here. Send then copies " +
                        "your notes and opens that chat, so you only paste and send. Without a link, notes are " +
                        "shared to the Claude app.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(main, { main = it }, Modifier.fillMaxWidth(), singleLine = true,
                    placeholder = { Text("https://claude.ai/…") })

                HorizontalDivider()
                Text("Topics", style = MaterialTheme.typography.titleSmall)
                Text(
                    "Notes are grouped by topic. A topic can have its own project link, so its notes go to that project.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                rows.forEachIndexed { i, (original, name, link) ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(name, { rows[i] = Triple(original, it, link) }, Modifier.weight(1f),
                                singleLine = true, label = { Text("Topic") })
                            IconButton(onClick = { rows.removeAt(i) }, enabled = rows.size > 1) {
                                Icon(Icons.Default.Delete, "Remove topic")
                            }
                        }
                        OutlinedTextField(link, { rows[i] = Triple(original, name, it) }, Modifier.fillMaxWidth(),
                            singleLine = true, label = { Text("Project link (optional)") })
                    }
                    Spacer(Modifier.height(4.dp))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(adding, { adding = it }, Modifier.weight(1f), singleLine = true,
                        placeholder = { Text("New topic") })
                    IconButton(onClick = {
                        val n = adding.trim()
                        if (n.isNotEmpty() && rows.none { it.second.trim() == n }) rows.add(Triple(n, n, ""))
                        adding = ""
                    }) { Icon(Icons.Default.Add, "Add topic") }
                }

                HorizontalDivider()
                Text("Voice language", style = MaterialTheme.typography.titleSmall)
                LANGUAGES.forEach { (code, label) ->
                    Row(
                        Modifier.fillMaxWidth().selectable(selected = lang == code, onClick = { lang = code }),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = lang == code, onClick = { lang = code })
                        Text(label)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val renames = rows.filter { it.first != it.second.trim() }.map { it.first to it.second }
                onSave(renames, rows.map { Topic(it.second, it.third) }, main, lang)
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** When notes go to more than one project chat: one Send button per project. */
@Composable
fun SendChoiceDialog(outgoing: List<Outgoing>, onSend: (Outgoing) -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Send to each project") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "Your notes go to ${outgoing.size} different project chats. Send each one; " +
                        "the notes are copied, so in Claude just paste and send.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                outgoing.forEach { o ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(o.topics.joinToString(", "), style = MaterialTheme.typography.titleSmall)
                            Text(
                                (if (o.link.isEmpty()) "Claude app" else o.link.removePrefix("https://")) +
                                    " · ${o.noteIds.size} note${if (o.noteIds.size == 1) "" else "s"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Button(onClick = { onSend(o) }) {
                            Icon(Icons.AutoMirrored.Filled.Send, null)
                            Text("Send", Modifier.padding(start = 6.dp))
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
    )
}
