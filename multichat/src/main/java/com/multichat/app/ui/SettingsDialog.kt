package com.multichat.app.ui

import com.multichat.app.data.OwnerTest
import androidx.compose.foundation.clickable
import android.content.Intent
import android.provider.Settings as AndroidSettings
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.multichat.app.KeepAliveService
import com.multichat.app.MainActivity
import com.multichat.app.data.Rules
import com.multichat.app.data.Store
import com.multichat.app.web.WebPool

@Composable
fun SettingsDialog(activity: MainActivity, version: String, onDismiss: () -> Unit) {
    val s by Store.settings.collectAsState()
    var pinMode by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(Bg).systemBarsPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().background(Bar).padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onDismiss) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Ink)
                }
                Text("Settings", fontSize = 19.sp, fontWeight = FontWeight.SemiBold)
            }
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 8.dp)
                    .widthIn(max = 640.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Heading("Lock")
                if (pinMode) {
                    PinEditor(hasPin = s.hasPin, onDone = { pinMode = false })
                } else {
                    Text(
                        if (s.hasPin) "A PIN is set. Multi Chat asks for it when you open it."
                        else "Set a PIN so nobody else using this phone can open your chats.",
                        color = Muted,
                        fontSize = 14.sp,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { pinMode = true }) { Text(if (s.hasPin) "Change PIN" else "Set PIN") }
                        if (s.hasPin) {
                            OutlinedButton(onClick = { Store.update { it.copy(pinHash = null, pinSalt = null) } }) {
                                Text("Remove PIN")
                            }
                        }
                    }
                }
                SwitchRow(
                    "Unlock with fingerprint",
                    s.fingerprint && s.hasPin,
                    enabled = s.hasPin && activity.canUseFingerprint(),
                ) { v -> Store.update { it.copy(fingerprint = v) } }
                Text("Lock again after leaving the app for", color = if (s.hasPin) Ink else Muted, fontSize = 14.sp)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(0 to "Now", 1 to "1 min", 5 to "5 min", 15 to "15 min", 60 to "1 hour").forEach { (m, label) ->
                        FilterChip(
                            selected = s.autoLockMinutes == m,
                            enabled = s.hasPin,
                            onClick = { Store.update { it.copy(autoLockMinutes = m) } },
                            label = { Text(label) },
                        )
                    }
                }

                HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Line)
                Heading("Notifications")
                SwitchRow("Hide message text (show only the account name)", s.hidePreview) { v ->
                    Store.update { it.copy(hidePreview = v) }
                }
                SwitchRow("Stay connected in the background", s.keepRunning) { v ->
                    Store.update { it.copy(keepRunning = v) }
                    if (v) KeepAliveService.start(activity) else KeepAliveService.stop(activity)
                }
                Text(
                    "Keeps a small “Multi Chat is connected” notification so Android does not close your accounts. " +
                        "Without it, new message notifications can stop when the app is in the background.",
                    color = Muted,
                    fontSize = 13.sp,
                )
                TextButton(onClick = {
                    runCatching {
                        activity.startActivity(
                            Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS)
                                .putExtra(AndroidSettings.EXTRA_APP_PACKAGE, activity.packageName),
                        )
                    }
                }) { Text("Phone notification settings for Multi Chat") }
                Text("Each account's own settings (name, colour, photo, mute and quiet hours): hold its picture at the top.", color = Muted, fontSize = 13.sp)

                HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Line)
                Heading("Text size")
                var zoom by remember { mutableFloatStateOf(s.textZoom.toFloat()) }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Slider(
                        value = zoom,
                        onValueChange = { zoom = it },
                        onValueChangeFinished = {
                            val z = zoom.toInt()
                            Store.update { it.copy(textZoom = z) }
                            WebPool.setTextZoom(z)
                        },
                        valueRange = 70f..160f,
                        steps = 8,
                        modifier = Modifier.weight(1f),
                    )
                    Text("${zoom.toInt()}%", modifier = Modifier.padding(start = 10.dp))
                }
                Text("Pinch the page with two fingers to zoom in and out, and turn the phone sideways for more room.", color = Muted, fontSize = 13.sp)

                HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Line)
                Heading("Tips")
                Text(
                    "Samsung phones can also run a second copy of the real WhatsApp app: " +
                        "Settings > Advanced features > Dual Messenger.",
                    color = Muted,
                    fontSize = 13.sp,
                )
                Text(
                    "Multi Chat $version. Each account is the official WhatsApp Web in its own separate box, " +
                        "saved only on this phone. Multi Chat is not made by or connected with WhatsApp or Meta.",
                    color = Muted,
                    fontSize = 13.sp,
                    // 7 taps: owner's test updates
                    modifier = Modifier.padding(top = 6.dp, bottom = 24.dp).clickable { OwnerTest.tap(activity) },
                )
            }
        }
    }
}

@Composable
private fun Heading(text: String) {
    Text(text, color = Accent, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.padding(top = 8.dp))
}

@Composable
private fun PinEditor(hasPin: Boolean, onDone: () -> Unit) {
    var current by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var again by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }

    @Composable
    fun field(label: String, value: String, set: (String) -> Unit) = OutlinedTextField(
        value = value,
        onValueChange = { v -> set(v.filter { it.isDigit() }.take(8)); error = "" },
        label = { Text(label) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier.fillMaxWidth(),
    )

    if (hasPin) field("Current PIN", current) { current = it }
    field("New PIN (4 to 8 digits)", pin) { pin = it }
    field("New PIN again", again) { again = it }
    if (error.isNotEmpty()) Text(error, color = Danger, fontSize = 13.sp)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = {
            val s = Store.settings.value
            error = when {
                hasPin && !Rules.pinMatches(current, s.pinSalt ?: "", s.pinHash ?: "") -> "The current PIN is wrong."
                !Rules.isValidPin(pin) -> "Use 4 to 8 digits."
                pin != again -> "The two new PINs are not the same."
                else -> ""
            }
            if (error.isEmpty()) {
                val salt = Rules.newSalt()
                Store.update { it.copy(pinSalt = salt, pinHash = Rules.hashPin(pin, salt)) }
                onDone()
            }
        }) { Text("Save PIN") }
        TextButton(onClick = onDone) { Text("Cancel") }
    }
}
