package com.livetv.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.livetv.app.account.Account
import com.livetv.app.account.Conversation
import com.livetv.app.account.Message
import com.livetv.app.account.Messages
import com.livetv.app.account.User
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

/**
 * Messages, full screen. A viewer sees their private conversation with the Live TV team and can
 * write back; the owner sees everyone's conversations, newest first, and opens one to answer.
 */
@Composable
fun MessagesScreen(onClose: () -> Unit) {
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val messages = remember { Messages(account) }
    val me = account.user.value
    val admin = account.isAdmin
    val scope = rememberCoroutineScope()

    // The owner starts at the list; a viewer goes straight to their own conversation.
    var open by remember { mutableStateOf(if (admin) null else me?.uid) }
    var openName by remember { mutableStateOf("") }
    var convos by remember { mutableStateOf<List<Conversation>?>(null) }
    var thread by remember { mutableStateOf<List<Message>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var writing by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    // The owner picking a viewer to start a conversation with.
    var picking by remember { mutableStateOf(false) }

    LaunchedEffect(open, reload) {
        error = null
        try {
            val uid = open
            if (uid == null) {
                convos = null
                convos = messages.conversations()
            } else {
                thread = null
                val list = messages.messages(uid)
                thread = list
                if (list.isNotEmpty()) messages.markRead(uid)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = "Couldn't load: ${e.message ?: "check the internet connection"}"
        }
    }

    fun back() {
        if (admin && open != null) open = null else onClose()
    }

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BackHandler { back() }
        SettingsTheme {
            Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(24.dp)) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.widthIn(max = 900.dp).align(Alignment.TopCenter),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            if (admin && open != null) openName else "✉ Messages",
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        if (open == null && admin) {
                            Button(onClick = { picking = true }, modifier = Modifier.focusGlow()) { Text("＋ New message") }
                        }
                        if (open != null) {
                            Button(onClick = { writing = true }, modifier = Modifier.focusGlow()) {
                                Text(if (thread.isNullOrEmpty()) "＋ Write" else "＋ Reply")
                            }
                        }
                        OutlinedButton(onClick = { back() }, modifier = Modifier.focusGlow()) { Text("Back") }
                    }
                    if (open == null) {
                        Text(
                            "Private conversations with viewers. Choose ＋ New message to write to anyone, or ✉ Reply privately on a suggestion.",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    } else if (!admin) {
                        Text(
                            "Your private conversation with the Live TV team. Only you and the team can see it. " +
                                "Also on the website: tv.bulkbazaar.ca/suggestions",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    if (open == null) {
                        val list = convos
                        when {
                            list == null && error == null -> CircularProgressIndicator()
                            list != null && list.isEmpty() -> Text("No messages yet.", style = MaterialTheme.typography.bodyLarge)
                            list != null -> LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                items(list, key = { it.uid }) { c ->
                                    ConversationCard(c) {
                                        openName = c.name + if (c.email.isNotBlank()) " · ${c.email}" else ""
                                        open = c.uid
                                    }
                                }
                            }
                        }
                    } else {
                        val list = thread
                        val listState = rememberLazyListState()
                        LaunchedEffect(list) { if (!list.isNullOrEmpty()) listState.scrollToItem(list.size - 1) }
                        when {
                            list == null && error == null -> CircularProgressIndicator()
                            list != null && list.isEmpty() -> Text(
                                if (admin) "No messages yet." else "No messages yet. Choose ＋ Write to send the Live TV team a message, and we'll answer here.",
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            list != null -> LazyColumn(state = listState, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                items(list, key = { it.id }) { m -> Bubble(m, mine = m.fromAdmin == admin, admin = admin) }
                            }
                        }
                    }
                }
            }
            if (picking) {
                ViewerPicker(
                    load = { messages.viewers() },
                    onPick = { v ->
                        picking = false
                        openName = v.name + if (v.email.isNotBlank()) " · ${v.email}" else ""
                        open = v.uid
                    },
                    onDismiss = { picking = false },
                )
            }
            if (writing) {
                val uid = open
                WriteDialog(
                    title = if (admin) "Message to ${openName.substringBefore(" · ")}" else "Message to the Live TV team",
                    onDismiss = { writing = false },
                    onSend = { text ->
                        writing = false
                        if (uid != null) scope.launch {
                            try {
                                val (name, email) = openName.split(" · ").let { it[0] to it.getOrElse(1) { "" } }
                                messages.send(uid, text, toName = if (admin) name else "", toEmail = if (admin) email else "")
                                reload++
                            } catch (e: CancellationException) {
                                throw e
                            } catch (e: Exception) {
                                error = "Couldn't send: ${e.message ?: "check the internet connection"}"
                            }
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun ConversationCard(c: Conversation, onOpen: () -> Unit) {
    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .fillMaxWidth()
            .focusGlow(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
            .clickable(onClick = onOpen)
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(c.name, fontWeight = FontWeight.Bold)
            if (c.adminUnread) NewBadge()
            Box(Modifier.weight(1f))
            c.lastAt?.let { Text(formatWhen(it), style = MaterialTheme.typography.bodySmall) }
        }
        Text(
            (if (c.lastFromAdmin) "You: " else "") + c.lastText,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun Bubble(m: Message, mine: Boolean, admin: Boolean) {
    val ink = if (mine) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
    Box(Modifier.fillMaxWidth()) {
        Column(
            verticalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier
                .align(if (mine) Alignment.CenterEnd else Alignment.CenterStart)
                .widthIn(max = 620.dp)
                .focusGlow(RoundedCornerShape(16.dp))
                .focusable()
                .background(
                    if (mine) AccentBlue else MaterialTheme.colorScheme.surfaceVariant,
                    RoundedCornerShape(16.dp),
                )
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            Text(
                when {
                    mine -> "You"
                    m.fromAdmin -> "Live TV team"
                    else -> m.name.ifBlank { "Live TV viewer" }
                },
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.bodySmall,
                color = ink,
            )
            if (m.quote.isNotBlank()) {
                Text(
                    (if (admin) "Suggestion: " else "Your suggestion: ") + m.quote,
                    style = MaterialTheme.typography.bodySmall,
                    color = ink.copy(alpha = 0.75f),
                )
            }
            Text(m.text, style = MaterialTheme.typography.bodyLarge, color = ink)
            m.createdAt?.let { Text(formatWhen(it), style = MaterialTheme.typography.bodySmall, color = ink.copy(alpha = 0.75f)) }
        }
    }
}

/** The owner's list of viewers to write to, with a search box. */
@Composable
private fun ViewerPicker(load: suspend () -> List<User>, onPick: (User) -> Unit, onDismiss: () -> Unit) {
    var all by remember { mutableStateOf<List<User>?>(null) }
    var failed by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        try {
            all = load()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            failed = "Couldn't load viewers: ${e.message ?: "check the internet connection"}"
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New message to…") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Find by name or email") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                failed?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                val list = all
                if (list == null && failed == null) CircularProgressIndicator()
                if (list != null) {
                    val q = query.trim().lowercase()
                    val hits = list.filter { q.isEmpty() || "${it.name} ${it.email}".lowercase().contains(q) }
                    LazyColumn(Modifier.heightIn(max = 360.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(hits, key = { it.uid }) { v ->
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .focusGlow(RoundedCornerShape(10.dp))
                                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(10.dp))
                                    .clickable { onPick(v) }
                                    .padding(10.dp),
                            ) {
                                Text(v.name, fontWeight = FontWeight.Bold)
                                if (v.email.isNotBlank()) Text(v.email, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Cancel") } },
    )
}

/** A small red "New" label. */
@Composable
internal fun NewBadge() {
    Text(
        "New",
        color = Color.White,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.background(Color(0xFFE53935), RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

private fun formatWhen(d: Date): String = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(d)
