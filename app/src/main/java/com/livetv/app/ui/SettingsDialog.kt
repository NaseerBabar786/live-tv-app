package com.livetv.app.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.livetv.app.data.ChannelRepository
import com.livetv.app.data.Famelack

/**
 * Lets the user choose where channels come from: free channels for a country,
 * an M3U URL, an M3U file on the device, or the bundled sample playlist.
 */
@Composable
fun SettingsDialog(
    currentSource: String,
    countries: List<Famelack.Country>,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    val context = LocalContext.current
    var pickingCountry by rememberSaveable { mutableStateOf(false) }
    var url by rememberSaveable {
        mutableStateOf(if (currentSource.startsWith("http", ignoreCase = true)) currentSource else "")
    }

    if (pickingCountry) {
        CountryPicker(
            countries = countries,
            onDismiss = { pickingCountry = false },
            onPick = { onSave(Famelack.source(it.code)) },
        )
        return
    }

    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            onSave(uri.toString())
        }
    }

    val currentCountry = Famelack.countryCode(currentSource)
        ?.let { code -> countries.firstOrNull { it.code == code }?.name ?: code.uppercase() }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Channels") },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                Text("Free TV by country", fontWeight = FontWeight.Bold)
                Text(
                    "Free channels that broadcasters stream publicly, from the Famelack " +
                        "(TV Garden) list. Some channels only play inside their own country.",
                    style = MaterialTheme.typography.bodySmall,
                )
                val mixSelected = currentSource == Famelack.SOURCE_MIX
                val allSelected = currentSource == Famelack.SOURCE_ALL
                SourceButton("Pakistani, Indian & Canadian", mixSelected) { onSave(Famelack.SOURCE_MIX) }
                SourceButton("All countries", allSelected) { onSave(Famelack.SOURCE_ALL) }
                OutlinedButton(
                    onClick = { pickingCountry = true },
                    enabled = countries.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        when {
                            countries.isEmpty() -> "Loading countries…"
                            currentCountry != null && !mixSelected && !allSelected -> "✓ Country: $currentCountry"
                            else -> "One country…"
                        }
                    )
                }

                HorizontalDivider()

                Text("Your own playlist", fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("M3U playlist URL") },
                    placeholder = { Text("https://example.com/playlist.m3u") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedButton(
                    onClick = { pickFile.launch(arrayOf("*/*")) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Open playlist file") }
                TextButton(
                    onClick = { onSave(ChannelRepository.SOURCE_SAMPLE) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Use built-in test channels") }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(url) },
                enabled = url.trim().startsWith("http", ignoreCase = true),
            ) { Text("Load URL") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        },
    )
}

@Composable
private fun SourceButton(label: String, selected: Boolean, onClick: () -> Unit) {
    if (selected) {
        Button(onClick = onClick, modifier = Modifier.fillMaxWidth()) { Text("✓ $label") }
    } else {
        OutlinedButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) { Text(label) }
    }
}

@Composable
private fun CountryPicker(
    countries: List<Famelack.Country>,
    onDismiss: () -> Unit,
    onPick: (Famelack.Country) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    val shown = countries.filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Choose a country") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Search") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                LazyColumn(Modifier.heightIn(max = 420.dp)) {
                    items(shown, key = { it.code }) { country ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable { onPick(country) }
                                .padding(vertical = 12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(country.name)
                            Text(
                                "${country.channelCount}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Back") } },
    )
}
