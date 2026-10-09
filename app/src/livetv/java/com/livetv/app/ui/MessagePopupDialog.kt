package com.livetv.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.livetv.app.MessagePopup
import com.livetv.app.account.Forum
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The owner's message popping up over the channel (owner, 2026-10-09): the message, one-press answers
 * for the remote, a box to type an answer, and Close. The answer lands in the owner's Messages at once.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun MessagePopupDialog(message: MessagePopup.Incoming) {
    val scope = rememberCoroutineScope()
    var typed by remember(message.at) { mutableStateOf("") }
    var status by remember(message.at) { mutableStateOf("") }
    var sending by remember(message.at) { mutableStateOf(false) }
    val first = remember { FocusRequester() }
    // The remote starts on "👍 OK, got it". The dialog's window may not be ready at first, so try again a few times.
    LaunchedEffect(message.at) {
        repeat(5) {
            delay(200)
            if (runCatching { first.requestFocus() }.isSuccess) return@LaunchedEffect
        }
    }

    fun send(text: String) {
        val reply = MessagePopup.sendReply ?: return
        if (sending) return
        sending = true
        status = "Sending…"
        scope.launch {
            try {
                reply(text)
                status = "✓ Sent to the Cable TV team"
                delay(1_500)
                MessagePopup.close()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status = "Couldn't send. Check the internet and try again."
            } finally {
                sending = false
            }
        }
    }

    SettingsTheme {
        AlertDialog(
            onDismissRequest = { MessagePopup.closeRead() },
            properties = DialogProperties(usePlatformDefaultWidth = false),
            modifier = Modifier.widthIn(max = 720.dp).fillMaxWidth(0.9f),
            title = { Text(MessagePopup.TITLE) },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()),
                ) {
                    message.lines.forEach { Text(it, style = MaterialTheme.typography.titleMedium) }
                    Text("Answer with one press, or type your own:", style = MaterialTheme.typography.bodyMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        MessagePopup.QUICK_REPLIES.forEachIndexed { i, q ->
                            val m = Modifier.focusGlow()
                            OutlinedButton(
                                onClick = { send(q) },
                                enabled = !sending,
                                modifier = if (i == 0) m.focusRequester(first) else m,
                            ) { Text(q) }
                        }
                    }
                    OutlinedTextField(
                        value = typed,
                        onValueChange = { typed = it.take(Forum.MAX_LENGTH) },
                        placeholder = { Text("Type your answer here") },
                        modifier = Modifier.fillMaxWidth().focusGlow(),
                    )
                    if (status.isNotEmpty()) Text(status, style = MaterialTheme.typography.bodyMedium)
                }
            },
            confirmButton = {
                Button(
                    onClick = { send(typed.trim()) },
                    enabled = typed.isNotBlank() && !sending,
                    modifier = Modifier.focusGlow(),
                ) { Text("Send") }
            },
            dismissButton = {
                TextButton(onClick = { MessagePopup.closeRead() }, modifier = Modifier.focusGlow()) { Text("Close") }
            },
        )
    }
}
