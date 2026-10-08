package com.livetv.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.livetv.app.account.Account
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Settings › Change password, for viewers who signed in with an email and password. */
@Composable
fun ChangePasswordDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf("") }
    var new by remember { mutableStateOf("") }
    var show by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf(false) }
    val visual = if (show) VisualTransformation.None else PasswordVisualTransformation()

    SettingsTheme {
        AlertDialog(
            onDismissRequest = { if (!busy) onDismiss() },
            title = { Text(if (done) "Password changed" else "Change password") },
            text = {
                if (done) {
                    Text("Your new password is saved. Use it the next time you sign in.")
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = current, onValueChange = { current = it }, singleLine = true,
                            label = { Text("Current password") }, visualTransformation = visual,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            modifier = Modifier.fillMaxWidth().remoteTextField(),
                        )
                        OutlinedTextField(
                            value = new, onValueChange = { new = it }, singleLine = true,
                            label = { Text("New password (6 or more characters)") }, visualTransformation = visual,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            modifier = Modifier.fillMaxWidth().remoteTextField(),
                        )
                        TextButton(onClick = { show = !show }, modifier = Modifier.focusGlow()) {
                            Text(if (show) "🙈 Hide passwords" else "👁 Show passwords")
                        }
                        if (busy) CircularProgressIndicator()
                        error?.let { Text(it, color = Color(0xFFFF8A80)) }
                        Text("Forgot your current password? Message us on WhatsApp at 437 602 6500 and we'll set a new one for you.")
                    }
                }
            },
            confirmButton = {
                if (done) {
                    TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("OK") }
                } else {
                    AccentButton(
                        onClick = {
                            scope.launch {
                                busy = true; error = null
                                try {
                                    account.changePassword(current, new)
                                    done = true
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    error = e.message ?: "Couldn't change the password. Check the internet connection."
                                } finally {
                                    busy = false
                                }
                            }
                        },
                        enabled = !busy && current.isNotEmpty() && new.length >= 6,
                        modifier = Modifier.focusGlow(),
                    ) { Text("Save") }
                }
            },
            dismissButton = {
                if (!done) TextButton(onClick = onDismiss, enabled = !busy, modifier = Modifier.focusGlow()) { Text("Cancel") }
            },
        )
    }
}
