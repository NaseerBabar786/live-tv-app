package com.multichat.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.multichat.app.data.Store
import com.multichat.app.data.Template
import com.multichat.app.web.WebPool

/**
 * Saved quick replies. Tapping one types it into the open chat's message box; it is never
 * sent by itself, the person checks it and presses Send.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TemplatesSheet(activeAccount: String?, onDismiss: () -> Unit) {
    val templates by Store.templates.collectAsState()
    var query by remember { mutableStateOf("") }
    var editingId by remember { mutableStateOf<String?>(null) }
    var title by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    var adding by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 16.dp).navigationBarsPadding().imePadding()) {
            Text("Quick replies", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Text(
                "Tap a reply to type it into the open chat. You press Send.",
                color = Muted,
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 2.dp, bottom = 8.dp),
            )
            if (!adding) {
                if (templates.size > 5) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("Search replies") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    )
                }
                val list = templates.filter {
                    query.isBlank() || (it.title + " " + it.text).contains(query.trim(), ignoreCase = true)
                }
                LazyColumn(Modifier.heightIn(max = 380.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(list, key = { it.id }) { t ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .background(Panel, RoundedCornerShape(12.dp))
                                .clickable {
                                    if (activeAccount != null) WebPool.insertTextSoon(activeAccount, t.text)
                                    onDismiss()
                                }
                                .padding(start = 12.dp, top = 8.dp, bottom = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(t.title.ifBlank { t.text.take(30) }, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                Text(t.text, color = Muted, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                            IconButton(onClick = {
                                editingId = t.id; title = t.title; text = t.text; adding = true
                            }) { Icon(Icons.Filled.Edit, contentDescription = "Edit", tint = Muted) }
                            IconButton(onClick = {
                                Store.saveTemplates(templates.filterNot { it.id == t.id })
                            }) { Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = Muted) }
                        }
                    }
                }
                Button(
                    onClick = { editingId = null; title = ""; text = ""; adding = true },
                    modifier = Modifier.padding(vertical = 12.dp),
                ) { Text("New reply") }
            } else {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it.take(60) },
                    label = { Text("Short name, like Address") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it.take(4000) },
                    label = { Text("Message text") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                Row(Modifier.padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(enabled = text.isNotBlank(), onClick = {
                        val id = editingId
                        Store.saveTemplates(
                            if (id == null) templates + Template(Store.newId(), title.trim(), text.trim())
                            else templates.map { if (it.id == id) it.copy(title = title.trim(), text = text.trim()) else it },
                        )
                        adding = false
                    }) { Text("Save") }
                    TextButton(onClick = { adding = false }) { Text("Cancel") }
                }
            }
        }
    }
}
