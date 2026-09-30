package com.livecam.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.livecam.app.data.Camera
import com.livecam.app.data.StreamUrls
import com.livecam.app.data.StreamUrls.Brand

/**
 * Add or edit a camera. Pick the brand and type the IP address and the RTSP address is
 * filled in; "Custom URL" takes any rtsp:// or http(s):// stream address as is.
 */
@Composable
fun CameraEditor(
    initial: Camera,
    isNew: Boolean,
    onSave: (Camera) -> Unit,
    onDelete: () -> Unit,
    onCancel: () -> Unit,
) {
    var name by remember { mutableStateOf(initial.name) }
    var brand by remember { mutableStateOf(if (isNew) Brand.HIKVISION else Brand.CUSTOM) }
    var host by remember { mutableStateOf("") }
    var channel by remember { mutableStateOf("1") }
    var url by remember { mutableStateOf(initial.url) }
    var previewUrl by remember { mutableStateOf(initial.previewUrl) }
    var username by remember { mutableStateOf(initial.username.ifEmpty { if (isNew) "admin" else "" }) }
    var password by remember { mutableStateOf(initial.password) }
    var tcp by remember { mutableStateOf(initial.rtspOverTcp) }
    var brandMenu by remember { mutableStateOf(false) }

    fun regenerate() {
        if (brand == Brand.CUSTOM || host.isBlank()) return
        val ch = channel.toIntOrNull() ?: 1
        url = StreamUrls.build(brand, host, ch, sub = false, name = name)
        previewUrl = StreamUrls.build(brand, host, ch, sub = true, name = name)
            .takeIf { brand != Brand.WYZE_BRIDGE }.orEmpty()
    }

    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(if (isNew) "Add camera" else "Edit camera") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it; if (brand == Brand.WYZE_BRIDGE) regenerate() },
                    label = { Text("Name (e.g. Front door)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))

                Box {
                    OutlinedButton(
                        onClick = { brandMenu = true },
                        modifier = Modifier.fillMaxWidth().focusRing(CircleShape),
                    ) {
                        Text("Brand: ${brand.label}", modifier = Modifier.weight(1f))
                        Icon(Icons.Default.ArrowDropDown, contentDescription = null)
                    }
                    DropdownMenu(expanded = brandMenu, onDismissRequest = { brandMenu = false }) {
                        Brand.entries.forEach { b ->
                            DropdownMenuItem(
                                text = { Text(b.label) },
                                onClick = { brand = b; brandMenu = false; regenerate() },
                            )
                        }
                    }
                }

                if (brand != Brand.CUSTOM) {
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = host,
                            onValueChange = { host = it.trim(); regenerate() },
                            label = { Text("IP address") },
                            placeholder = { Text("192.168.1.64") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(8.dp))
                        OutlinedTextField(
                            value = channel,
                            onValueChange = { channel = it.filter(Char::isDigit).take(3); regenerate() },
                            label = { Text("Channel") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.width(96.dp),
                        )
                    }
                }

                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("Stream address") },
                    placeholder = { Text("rtsp://192.168.1.64:554/…") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = previewUrl,
                    onValueChange = { previewUrl = it },
                    label = { Text("Grid preview address (optional substream)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Row {
                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it },
                        label = { Text("Username") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("RTSP over TCP")
                        Text(
                            "More reliable on Wi-Fi. Turn off only if the picture never loads.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(checked = tcp, onCheckedChange = { tcp = it })
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = url.isNotBlank(),
                onClick = {
                    onSave(
                        initial.copy(
                            name = name.trim().ifEmpty { "Camera" },
                            url = url.trim(),
                            previewUrl = previewUrl.trim(),
                            username = username.trim(),
                            password = password,
                            rtspOverTcp = tcp,
                        )
                    )
                },
                modifier = Modifier.focusRing(CircleShape),
            ) { Text("Save") }
        },
        dismissButton = {
            Row {
                if (!isNew) {
                    TextButton(onClick = onDelete, modifier = Modifier.focusRing(CircleShape)) {
                        Text("Delete", color = LiveRed)
                    }
                }
                TextButton(onClick = onCancel, modifier = Modifier.focusRing(CircleShape)) { Text("Cancel") }
            }
        },
    )
}
