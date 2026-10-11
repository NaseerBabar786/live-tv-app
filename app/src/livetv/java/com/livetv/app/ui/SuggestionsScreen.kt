package com.livetv.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.livetv.app.account.Account
import com.livetv.app.account.Forum
import com.livetv.app.account.Messages
import com.livetv.app.account.Post
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.text.DateFormat

/**
 * The Suggestions forum, full screen: newest suggestions first; open one to read and add replies.
 * Viewers can delete their own posts, and the owner can delete any.
 */
@Composable
fun SuggestionsScreen(onClose: () -> Unit) {
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val forum = remember { Forum(account) }
    val me = account.user.value
    val scope = rememberCoroutineScope()

    var open by remember { mutableStateOf<Post?>(null) }
    var items by remember { mutableStateOf<List<Post>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var writing by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    var showingMessages by remember { mutableStateOf(false) }
    // The owner's private answer to a post: it lands in that viewer's Messages.
    var privateTo by remember { mutableStateOf<Post?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }

    if (showingMessages) {
        MessagesScreen(onClose = { showingMessages = false })
        return
    }

    LaunchedEffect(open, reload) {
        items = null
        error = null
        try {
            items = open?.let { forum.replies(it.id) } ?: forum.posts()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = "Couldn't load: ${e.message ?: "check the internet connection"}"
        }
    }

    fun delete(p: Post) {
        scope.launch {
            try {
                val parent = open
                if (parent == null) forum.delete(p.id) else forum.delete(parent.id, p.id)
                reload++
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = "Couldn't delete: ${e.message}"
            }
        }
    }

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BackHandler { if (open != null) open = null else onClose() }
        SettingsTheme {
            Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(24.dp)) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.widthIn(max = 900.dp).align(Alignment.TopCenter),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            if (open == null) "💬 Suggestions" else "Replies",
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f),
                        )
                        Button(onClick = { writing = true }, modifier = Modifier.focusGlow()) {
                            Text(if (open == null) "＋ New suggestion" else "＋ Reply")
                        }
                        if (open == null) {
                            OutlinedButton(onClick = { showingMessages = true }, modifier = Modifier.focusGlow()) {
                                Text("✉ Messages")
                            }
                        }
                        OutlinedButton(onClick = { if (open != null) open = null else onClose() }, modifier = Modifier.focusGlow()) {
                            Text("Back")
                        }
                    }
                    if (open == null) {
                        Text(
                            "Tell us what to improve or add to NextGen Cable, and reply to other viewers' ideas. " +
                                "Also on the website: tv.bulkbazaar.ca/suggestions",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    } else {
                        PostCard(
                            open!!,
                            canDelete = false,
                            onOpen = null,
                            onDelete = {},
                            onPrivate = if (account.isAdmin && open!!.uid != me?.uid) ({ privateTo = open }) else null,
                        )
                    }
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    notice?.let { Text(it, color = MaterialTheme.colorScheme.secondary) }
                    val list = items
                    when {
                        list == null && error == null -> CircularProgressIndicator()
                        list != null && list.isEmpty() -> Text(
                            if (open == null) "No suggestions yet. Be the first!" else "No replies yet.",
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        list != null -> LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            items(list, key = { it.id }) { p ->
                                PostCard(
                                    post = p,
                                    canDelete = p.uid == me?.uid || account.isAdmin,
                                    onOpen = if (open == null) ({ open = p }) else null,
                                    onDelete = { delete(p) },
                                    onPrivate = if (account.isAdmin && p.uid != me?.uid) ({ privateTo = p }) else null,
                                )
                            }
                        }
                    }
                }
            }
            privateTo?.let { p ->
                WriteDialog(
                    title = "Private message to ${p.name.ifBlank { "this viewer" }}",
                    onDismiss = { privateTo = null },
                    onSend = { text ->
                        privateTo = null
                        scope.launch {
                            try {
                                Messages(account).send(p.uid, text, toName = p.name, quote = p.text)
                                notice = "✓ Sent to ${p.name.ifBlank { "the viewer" }}'s Messages. Their answer will be in ✉ Messages."
                            } catch (e: CancellationException) {
                                throw e
                            } catch (e: Exception) {
                                error = "Couldn't send: ${e.message ?: "check the internet connection"}"
                            }
                        }
                    },
                )
            }
            if (writing) {
                WriteDialog(
                    title = if (open == null) "New suggestion" else "Reply",
                    onDismiss = { writing = false },
                    onSend = { text ->
                        writing = false
                        scope.launch {
                            try {
                                val parent = open
                                if (parent == null) forum.post(text) else forum.reply(parent.id, text)
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
private fun PostCard(
    post: Post,
    canDelete: Boolean,
    onOpen: (() -> Unit)?,
    onDelete: () -> Unit,
    onPrivate: (() -> Unit)? = null,
) {
    var confirming by remember { mutableStateOf(false) }
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier
            .fillMaxWidth()
            .focusGlow(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
            .then(if (onOpen != null) Modifier.clickable(onClick = onOpen) else Modifier)
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(post.name.ifBlank { "NextGen Cable viewer" }, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            post.createdAt?.let {
                Text(DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(it),
                    style = MaterialTheme.typography.bodySmall)
            }
        }
        Text(post.text, style = MaterialTheme.typography.bodyLarge)
        Row {
            if (onOpen != null) Text("Open to read and reply", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.secondary)
            Spacer(Modifier.weight(1f))
            if (onPrivate != null) TextButton(onClick = onPrivate, modifier = Modifier.focusGlow()) { Text("✉ Reply privately") }
            if (canDelete) TextButton(onClick = { confirming = true }, modifier = Modifier.focusGlow()) { Text("Delete") }
        }
    }
    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text("Delete this post?") },
            confirmButton = {
                TextButton(onClick = { confirming = false; onDelete() }, modifier = Modifier.focusGlow()) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }, modifier = Modifier.focusGlow()) { Text("Cancel") }
            },
        )
    }
}

@Composable
internal fun WriteDialog(title: String, onDismiss: () -> Unit, onSend: (String) -> Unit) {
    var text by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it.take(Forum.MAX_LENGTH) },
                placeholder = { Text("Type here") },
                modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp),
            )
        },
        confirmButton = {
            TextButton(onClick = { onSend(text) }, enabled = text.isNotBlank(), modifier = Modifier.focusGlow()) { Text("Send") }
        },
        dismissButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Cancel") } },
    )
}
