@file:OptIn(ExperimentalMaterial3Api::class)

package com.claudenotes.app.ui

import com.claudenotes.app.data.OwnerTest
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.claudenotes.app.data.Kind
import com.claudenotes.app.data.Note
import com.claudenotes.app.data.NoteStore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Which list is showing. [kind] null means every kind; [sent] shows what already went to Claude. */
private enum class View(val label: String, val kind: Kind?, val sent: Boolean = false) {
    ALL("All", null), WORK("Work", Kind.TASK), IDEAS("Ideas", Kind.IDEA), VOICE("Voice", Kind.VOICE),
    SENT("Sent", null, sent = true),
}

private const val ALL_TOPICS = ""

fun Kind.icon(): ImageVector = when (this) {
    Kind.TASK -> Icons.Default.Checklist
    Kind.IDEA -> Icons.Default.Lightbulb
    Kind.VOICE -> Icons.Default.Mic
}

/**
 * The one screen: lists on top, a box to write or speak a note at the bottom and the
 * "Send to Claude" button under it.
 */
@Composable
fun NotesScreen(
    state: NoteStore.Saved,
    voice: VoiceInput,
    snackbar: SnackbarHostState,
    draft: String,
    onDraft: (String) -> Unit,
    onAdd: (Kind, String, String) -> Unit,
    onToggle: (Long) -> Unit,
    onEdit: (Note) -> Unit,
    onRestore: (Long) -> Unit,
    onClearSent: () -> Unit,
    onMic: (topic: String) -> Unit,
    onSend: () -> Unit,
    onSettings: () -> Unit,
    version: String,
) {
    var view by rememberSaveable { mutableStateOf(View.ALL) }
    var topicFilter by rememberSaveable { mutableStateOf(ALL_TOPICS) }
    var kind by rememberSaveable { mutableStateOf(Kind.TASK) }
    var newTopic by rememberSaveable { mutableStateOf(state.topics.first().name) }
    // A topic picked in the filter row is also where new notes go.
    val composeTopic = if (topicFilter != ALL_TOPICS) topicFilter else newTopic

    val ready = state.notes.count { it.sentAt == null && it.selected }
    val shown = state.notes
        .filter { if (view.sent) it.sentAt != null else it.sentAt == null }
        .filter { view.kind == null || it.kind == view.kind }
        .filter { topicFilter == ALL_TOPICS || it.topic == topicFilter }
        .sortedWith(if (view.sent) compareByDescending<Note> { it.sentAt } else compareByDescending<Note> { it.created })

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Notes for Claude", fontWeight = FontWeight.SemiBold)
                        Text(
                            if (ready == 0) "Nothing waiting to send" else "$ready ready to send",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onSettings) { Icon(Icons.Default.Settings, "Topics and settings") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            Composer(
                voice = voice,
                draft = draft,
                onDraft = onDraft,
                kind = kind,
                onKind = { kind = it },
                topic = composeTopic,
                topics = state.topics.map { it.name },
                onTopic = { if (topicFilter != ALL_TOPICS) topicFilter = it; newTopic = it },
                onAdd = { onAdd(kind, draft, composeTopic); onDraft("") },
                onMic = { onMic(composeTopic) },
                ready = ready,
                onSend = onSend,
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            ChipRow(View.entries.map { v ->
                val n = state.notes.count { n ->
                    (if (v.sent) n.sentAt != null else n.sentAt == null) && (v.kind == null || n.kind == v.kind) &&
                        (topicFilter == ALL_TOPICS || n.topic == topicFilter)
                }
                Triple(v.name, if (n > 0) "${v.label} $n" else v.label, view == v)
            }) { name -> view = View.valueOf(name) }
            ChipRow(
                listOf(Triple(ALL_TOPICS, "All topics", topicFilter == ALL_TOPICS)) +
                    state.topics.map { Triple(it.name, it.name, topicFilter == it.name) }
            ) { topicFilter = it }

            if (shown.isEmpty()) {
                Empty(view.sent, Modifier.weight(1f))
            } else {
                LazyColumn(
                    Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (view.sent) {
                        item {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "Tap ↺ to send a note again.",
                                    Modifier.weight(1f),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                TextButton(onClick = onClearSent) { Text("Clear sent") }
                            }
                        }
                    }
                    items(shown, key = { it.id }) { note ->
                        NoteCard(note, onToggle = { onToggle(note.id) }, onOpen = { onEdit(note) }, onRestore = { onRestore(note.id) })
                    }
                    item {
                        val context = LocalContext.current
                        Text(
                            "Version $version",
                            // 7 taps: owner's test updates
                            Modifier.fillMaxWidth().padding(top = 8.dp).clickable { OwnerTest.tap(context) },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChipRow(chips: List<Triple<String, String, Boolean>>, onPick: (String) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(chips, key = { it.first }) { (key, label, on) ->
            FilterChip(selected = on, onClick = { onPick(key) }, label = { Text(label) })
        }
    }
}

@Composable
private fun Empty(sent: Boolean, modifier: Modifier) {
    Box(modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(
            if (sent) {
                "Notes you send to Claude show up here."
            } else {
                "Write a task or an idea below, or tap the microphone and speak.\n\n" +
                    "When your notes are ready, tap Send to Claude. They go as one tidy message, " +
                    "grouped by topic."
            },
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private val timeFormat = SimpleDateFormat("d MMM, HH:mm", Locale.getDefault())

@Composable
private fun NoteCard(note: Note, onToggle: () -> Unit, onOpen: () -> Unit, onRestore: () -> Unit) {
    val sent = note.sentAt != null
    Card(
        onClick = onOpen,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
        shape = RoundedCornerShape(14.dp),
    ) {
        Row(Modifier.padding(start = 4.dp, end = 12.dp, top = 6.dp, bottom = 10.dp), verticalAlignment = Alignment.Top) {
            if (sent) {
                IconButton(onClick = onRestore) { Icon(Icons.Default.Restore, "Send again") }
            } else {
                Checkbox(checked = note.selected, onCheckedChange = { onToggle() })
            }
            Column(Modifier.weight(1f).padding(top = 10.dp)) {
                Text(
                    note.text,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 8,
                    overflow = TextOverflow.Ellipsis,
                    color = if (!sent && !note.selected) MaterialTheme.colorScheme.onSurfaceVariant
                    else MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(note.kind.icon(), null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(4.dp))
                    Text(
                        "${note.kind.label} · ${note.topic} · " +
                            (if (sent) "sent ${timeFormat.format(Date(note.sentAt!!))}" else timeFormat.format(Date(note.created))),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun Composer(
    voice: VoiceInput,
    draft: String,
    onDraft: (String) -> Unit,
    kind: Kind,
    onKind: (Kind) -> Unit,
    topic: String,
    topics: List<String>,
    onTopic: (String) -> Unit,
    onAdd: () -> Unit,
    onMic: () -> Unit,
    ready: Int,
    onSend: () -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainer, shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)) {
        Column(
            Modifier.navigationBarsPadding().imePadding().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SingleChoiceSegmentedButtonRow(Modifier.weight(1f)) {
                    val kinds = listOf(Kind.TASK, Kind.IDEA)
                    kinds.forEachIndexed { i, k ->
                        SegmentedButton(
                            selected = kind == k,
                            onClick = { onKind(k) },
                            shape = SegmentedButtonDefaults.itemShape(i, kinds.size),
                            icon = { Icon(k.icon(), null, Modifier.size(16.dp)) },
                        ) { Text(if (k == Kind.TASK) "Work" else "Idea") }
                    }
                }
                Spacer(Modifier.width(8.dp))
                TopicPicker(topic, topics, onTopic)
            }

            if (voice.listening) {
                Row(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(14.dp))
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(10.dp).background(Recording, CircleShape))
                    Spacer(Modifier.width(10.dp))
                    Text(
                        voice.text.ifBlank { "Listening… speak now. Tap stop when you finish." },
                        Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Spacer(Modifier.width(8.dp))
                    IconButton(
                        onClick = onMic,
                        colors = IconButtonDefaults.filledIconButtonColors(containerColor = Recording),
                    ) { Icon(Icons.Default.Stop, "Stop and save the voice note") }
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = draft,
                        onValueChange = onDraft,
                        modifier = Modifier.weight(1f),
                        placeholder = { Text(if (kind == Kind.TASK) "Add work for Claude…" else "Add an idea…") },
                        maxLines = 5,
                        shape = RoundedCornerShape(14.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    if (draft.isBlank()) {
                        IconButton(
                            onClick = onMic,
                            colors = IconButtonDefaults.filledIconButtonColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer,
                                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            ),
                        ) { Icon(Icons.Default.Mic, "Record a voice note") }
                    } else {
                        IconButton(
                            onClick = onAdd,
                            colors = IconButtonDefaults.filledIconButtonColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer,
                                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            ),
                        ) { Icon(Icons.Default.Check, "Save note") }
                    }
                }
            }

            Button(onClick = onSend, enabled = ready > 0 && !voice.listening, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Icon(Icons.AutoMirrored.Filled.Send, null)
                Spacer(Modifier.width(10.dp))
                Text(if (ready > 0) "Send to Claude ($ready)" else "Send to Claude", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
fun TopicPicker(topic: String, topics: List<String>, onTopic: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(20.dp))
                .clickable { open = true }
                .padding(start = 12.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(topic, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(end = 2.dp).widthIn(max = 120.dp))
            Icon(Icons.Default.ArrowDropDown, "Choose topic")
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            topics.forEach { t ->
                DropdownMenuItem(text = { Text(t) }, onClick = { onTopic(t); open = false })
            }
        }
    }
}
