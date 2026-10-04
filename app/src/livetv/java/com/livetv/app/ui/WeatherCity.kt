package com.livetv.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.data.Location
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Settings: the city for the weather and prayer times, or automatic (the device's location). */
@Composable
fun WeatherCitySection(onPick: () -> Unit) {
    val manual by Location.manual.collectAsStateWithLifecycle()
    Text("Weather city", fontWeight = FontWeight.Bold)
    Text(
        manual?.let { "${it.label} (typed in)" } ?: "Automatic: where this device is",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.secondary,
    )
    OutlinedButton(onClick = onPick, modifier = Modifier.fillMaxWidth().focusGlow()) {
        Text(if (manual == null) "📍 Type your city" else "📍 Change city")
    }
}

/** Type a city, pick it from the matches; or go back to automatic. */
@Composable
fun WeatherCityPicker(onDismiss: () -> Unit) {
    val manual by Location.manual.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Location.Place>?>(null) }
    var searching by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    fun search() {
        if (query.isBlank() || searching) return
        searching = true
        scope.launch {
            results = withContext(Dispatchers.IO) { Location.search(query) }
            searching = false
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Weather city") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "Used for the weather and prayer times. Leave it on automatic to use where this device is.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("e.g. Mississauga") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { search() }),
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { search() }, modifier = Modifier.padding(start = 6.dp).focusGlow()) {
                        Text(if (searching) "…" else "Search")
                    }
                }
                when {
                    results?.isEmpty() == true -> Text("No city found. Check the spelling and try again.")
                    results != null -> LazyColumn(Modifier.heightIn(max = 320.dp)) {
                        items(results!!) { place ->
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .focusGlow(ChipShape)
                                    .clickable {
                                        Location.setManual(place)
                                        onDismiss()
                                    }
                                    .padding(vertical = 8.dp, horizontal = 4.dp),
                            ) {
                                Text(place.city, fontWeight = FontWeight.Bold)
                                if (place.region.isNotBlank()) {
                                    Text(place.region, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            if (manual != null) {
                TextButton(
                    onClick = {
                        Location.setManual(null)
                        onDismiss()
                    },
                    modifier = Modifier.focusGlow(),
                ) { Text("Use automatic") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Back") } },
    )
}
