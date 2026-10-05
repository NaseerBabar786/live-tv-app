package com.multichat.app.ui

import android.app.TimePickerDialog
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.multichat.app.data.Account
import com.multichat.app.data.Lock
import com.multichat.app.data.Rules
import com.multichat.app.data.Store
import com.multichat.app.web.WebPool
import java.io.File

/** Name, colour, photo, notifications and quiet hours for one account. */
@Composable
fun AccountEditor(
    account: Account,
    isNew: Boolean,
    canMoveLeft: Boolean,
    canMoveRight: Boolean,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    var name by remember(account.id) { mutableStateOf(account.name) }
    var color by remember(account.id) { mutableStateOf(account.color) }
    var photo by remember(account.id) { mutableStateOf(account.photo) }
    var muted by remember(account.id) { mutableStateOf(account.muted) }
    var quietOn by remember(account.id) { mutableStateOf(account.quietOn) }
    var quietFrom by remember(account.id) { mutableStateOf(account.quietFrom) }
    var quietTo by remember(account.id) { mutableStateOf(account.quietTo) }
    var confirmRemove by remember { mutableStateOf(false) }

    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        runCatching {
            val src = context.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it) }!!
            val side = minOf(src.width, src.height)
            val square = Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side)
            val small = Bitmap.createScaledBitmap(square, 256, 256, true)
            val file = Store.newPhotoFile(account.id)
            file.outputStream().use { small.compress(Bitmap.CompressFormat.JPEG, 88, it) }
            if (photo != null && photo != account.photo) File(photo!!).delete()
            photo = file.absolutePath
        }
    }

    fun pickTime(start: Int, set: (Int) -> Unit) {
        TimePickerDialog(context, { _, h, m -> set(h * 60 + m) }, start / 60, start % 60, true).show()
    }

    fun cancel() {
        if (photo != null && photo != account.photo) File(photo!!).delete()
        onDismiss()
    }

    AlertDialog(
        onDismissRequest = ::cancel,
        title = { Text(if (isNew) "New account" else "Edit account") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(account.copy(name = name.ifBlank { account.name }, color = color, photo = photo), 64.dp, ring = true)
                    Spacer(Modifier.width(14.dp))
                    Column {
                        OutlinedButton(onClick = {
                            Lock.openingOwnScreen()
                            pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        }) { Text("Choose photo") }
                        if (photo != null) TextButton(onClick = { photo = null }) { Text("Remove photo") }
                    }
                }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(40) },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Colour", color = Muted, fontSize = 13.sp)
                Store.COLORS.chunked(5).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        row.forEach { c ->
                            Box(
                                Modifier
                                    .size(32.dp)
                                    .border(2.dp, if (c == color) Color.White else Color.Transparent, CircleShape)
                                    .padding(3.dp)
                                    .background(Color(c), CircleShape)
                                    .clickable { color = c },
                            )
                        }
                    }
                }
                SwitchRow("Turn off notifications", muted) { muted = it }
                SwitchRow("Quiet hours (no notifications)", quietOn) { quietOn = it }
                if (quietOn) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("From", color = Muted)
                        OutlinedButton(onClick = { pickTime(quietFrom) { quietFrom = it } }) { Text(Rules.clock(quietFrom)) }
                        Text("to", color = Muted)
                        OutlinedButton(onClick = { pickTime(quietTo) { quietTo = it } }) { Text(Rules.clock(quietTo)) }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (canMoveLeft) TextButton(onClick = { Store.move(account.id, -1) }) { Text("Move left") }
                    if (canMoveRight) TextButton(onClick = { Store.move(account.id, 1) }) { Text("Move right") }
                    if (!isNew) TextButton(onClick = { WebPool.reload(account.id); onDismiss() }) { Text("Reload") }
                }
                TextButton(onClick = { confirmRemove = true }) { Text("Remove account", color = Danger) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = name.isNotBlank(),
                onClick = {
                    if (account.photo != null && account.photo != photo) File(account.photo).delete()
                    Store.saveAccount(
                        account.copy(
                            name = name.trim(),
                            color = color,
                            photo = photo,
                            muted = muted,
                            quietOn = quietOn,
                            quietFrom = quietFrom,
                            quietTo = quietTo,
                        ),
                    )
                    onDismiss()
                },
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = ::cancel) { Text("Cancel") } },
    )

    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text("Remove ${account.name}?") },
            text = {
                Text(
                    "This signs the account out of Multi Chat on this phone. Your chats stay in WhatsApp. " +
                        "Also remove it from WhatsApp > Linked devices on the phone that has the account.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (photo != null && photo != account.photo) File(photo!!).delete()
                    Store.removeAccount(account.id)
                    confirmRemove = false
                    onDismiss()
                }) { Text("Remove", color = Danger) }
            },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text("Cancel") } },
        )
    }
}

@Composable
fun SwitchRow(label: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = enabled) { onChange(!checked) }.padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f), color = if (enabled) Ink else Muted)
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}
