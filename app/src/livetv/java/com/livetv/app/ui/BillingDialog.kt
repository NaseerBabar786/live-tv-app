package com.livetv.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.livetv.app.account.Account
import com.livetv.app.account.Billing
import com.livetv.app.account.BillingInfo
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Settings › My billing details: the viewer's phone number, the package and plan length they
 * want and how they'll pay. The owner sees the answers on tv.bulkbazaar.ca/users, and can ask
 * for them from there, which opens this form on the viewer's next start ([asked]).
 */
@Composable
fun BillingDialog(asked: Boolean = false, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val scope = rememberCoroutineScope()
    var loaded by remember { mutableStateOf(false) }
    var phone by remember { mutableStateOf("") }
    var whatsapp by remember { mutableStateOf("") }
    var pkg by remember { mutableStateOf("") }
    var length by remember { mutableStateOf("") }
    var method by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        runCatching { Billing.load(account) }.getOrNull()?.let {
            phone = it.phone; whatsapp = it.whatsapp; pkg = it.wantPackage
            length = it.wantLength; method = it.payMethod; note = it.note
        }
        loaded = true
    }
    val paid = pkg.isNotEmpty() && pkg != "Free"
    val ready = phone.count(Char::isDigit) >= 7 && pkg.isNotEmpty() && (!paid || (length.isNotEmpty() && method.isNotEmpty()))

    SettingsTheme {
        AlertDialog(
            onDismissRequest = { if (!busy) onDismiss() },
            title = { Text(if (done) "Thank you!" else "💳 My billing details") },
            text = {
                if (done) {
                    Text("Your details are sent to the Cable TV team. We'll message you with how to pay and turn your package on as soon as it's paid.")
                } else if (!loaded) {
                    CircularProgressIndicator()
                } else {
                    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            if (asked) "The free period has ended. To keep watching, please tell us how you'd like to pay. Only the Cable TV team sees this."
                            else "Tell us how you'd like to pay for Cable TV. Only the Cable TV team sees this.",
                        )
                        OutlinedTextField(
                            value = phone, onValueChange = { phone = it.take(30) }, singleLine = true,
                            label = { Text("Phone number") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = whatsapp, onValueChange = { whatsapp = it.take(30) }, singleLine = true,
                            label = { Text("WhatsApp number (if different)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Choices("Package", Billing.PACKAGES, pkg) { pkg = it }
                        if (paid) {
                            Choices("How often I'll pay", Billing.LENGTHS, length) { length = it }
                            Choices("How I'll pay", Billing.METHODS, method) { method = it }
                        }
                        OutlinedTextField(
                            value = note, onValueChange = { note = it.take(500) },
                            label = { Text("Anything else (optional)") },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        if (busy) CircularProgressIndicator()
                        error?.let { Text(it, color = Color(0xFFFF8A80)) }
                        Text("Questions? WhatsApp 437 602 6500.")
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
                                    Billing.save(account, BillingInfo(phone, whatsapp, pkg, if (paid) length else "", if (paid) method else "", note))
                                    done = true
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    error = "Couldn't send it. Check the internet connection and try again."
                                } finally {
                                    busy = false
                                }
                            }
                        },
                        enabled = loaded && !busy && ready,
                        modifier = Modifier.focusGlow(),
                    ) { Text("Send") }
                }
            },
            dismissButton = {
                if (!done) TextButton(onClick = onDismiss, enabled = !busy, modifier = Modifier.focusGlow()) { Text("Later") }
            },
        )
    }
}

/** A row of buttons, two to a line so they fit a phone; the chosen one is filled. */
@Composable
private fun Choices(title: String, options: List<String>, selected: String, onPick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, fontWeight = FontWeight.Bold)
        options.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                pair.forEach { o ->
                    val m = Modifier.weight(1f).focusGlow()
                    if (o == selected) AccentButton(onClick = { onPick(o) }, modifier = m) { Text("✓ $o") }
                    else OutlinedButton(onClick = { onPick(o) }, modifier = m) { Text(o) }
                }
            }
        }
    }
}
