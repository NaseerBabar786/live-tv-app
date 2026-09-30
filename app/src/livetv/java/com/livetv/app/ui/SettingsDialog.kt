package com.livetv.app.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.livetv.app.R
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.livetv.app.data.ChannelRepository
import com.livetv.app.data.Famelack

/**
 * Lets the user choose which channels to show: Pakistani, Indian, Canadian, UK and USA,
 * every country, or a single country.
 */
@Composable
fun SettingsDialog(
    currentSource: String,
    provider: String,
    onProviderChange: (String) -> Unit,
    countries: List<Famelack.Country>,
    languages: List<String>,
    selectedLanguages: Set<String>,
    onLanguagesChange: (Set<String>) -> Unit,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    val context = LocalContext.current
    val appVersion = remember {
        runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull()
    }
    var pickingCountry by rememberSaveable { mutableStateOf(false) }
    var pickingCountries by rememberSaveable { mutableStateOf(false) }
    var pickingLanguages by rememberSaveable { mutableStateOf(false) }
    var showingGuide by rememberSaveable { mutableStateOf(false) }

    if (showingGuide) {
        InstallGuideDialog(onDismiss = { showingGuide = false })
        return
    }

    if (pickingLanguages) {
        LanguagePicker(
            languages = languages,
            initial = selectedLanguages,
            onDismiss = { pickingLanguages = false },
            onDone = onLanguagesChange,
        )
        return
    }
    val picked = Famelack.pickedCountries(currentSource)

    if (pickingCountries) {
        MultiCountryPicker(
            countries = countries,
            initial = picked ?: Famelack.MIX.map { it.country },
            onDismiss = { pickingCountries = false },
            onDone = { onSave(Famelack.pickSource(it)) },
        )
        return
    }

    if (pickingCountry) {
        CountryPicker(
            countries = countries,
            onDismiss = { pickingCountry = false },
            onPick = { onSave(Famelack.source(it.code)) },
        )
        return
    }

    val currentCountry = Famelack.countryCode(currentSource)
        ?.let { code -> countries.firstOrNull { it.code == code }?.name ?: code.uppercase() }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text("Settings")
                if (appVersion != null) {
                    Text(
                        "Version $appVersion",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                }
            }
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                Text("Channel list", fontWeight = FontWeight.Bold)
                SourceButton("Main list", provider == ChannelRepository.PROVIDER_FAMELACK) {
                    onProviderChange(ChannelRepository.PROVIDER_FAMELACK)
                }
                SourceButton("iptv-org list (more channels)", provider == ChannelRepository.PROVIDER_IPTV_ORG) {
                    onProviderChange(ChannelRepository.PROVIDER_IPTV_ORG)
                }

                HorizontalDivider()
                Text("Languages", fontWeight = FontWeight.Bold)
                SourceButton(
                    label = when {
                        selectedLanguages.isEmpty() -> "All languages"
                        else -> selectedLanguages.sortedBy { languages.indexOf(it) }.joinToString(", ")
                    },
                    selected = selectedLanguages.isNotEmpty(),
                    enabled = languages.isNotEmpty(),
                ) { pickingLanguages = true }

                HorizontalDivider()
                Text("Countries", fontWeight = FontWeight.Bold)
                val mixSelected = currentSource == Famelack.SOURCE_MIX
                val allSelected = currentSource == Famelack.SOURCE_ALL
                SourceButton("Pakistani, Indian, Canadian, UK & USA", mixSelected) { onSave(Famelack.SOURCE_MIX) }
                SourceButton("All countries", allSelected) { onSave(Famelack.SOURCE_ALL) }
                SourceButton(
                    label = when {
                        countries.isEmpty() -> "Loading countries…"
                        picked != null -> "Your countries (${picked.size})"
                        else -> "Choose countries…"
                    },
                    selected = picked != null,
                    enabled = countries.isNotEmpty(),
                ) { pickingCountries = true }
                OutlinedButton(
                    onClick = { pickingCountry = true },
                    enabled = countries.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().focusGlow(),
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
                OutlinedButton(
                    onClick = { showingGuide = true },
                    modifier = Modifier.fillMaxWidth().focusGlow(),
                ) { Text(INSTALL_GUIDE_TITLE) }

                BulkBazaarBanner()
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Close") }
        },
    )
}

@Composable
private fun SourceButton(label: String, selected: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    if (selected) {
        AccentButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().focusGlow()) { Text("✓ $label") }
    } else {
        OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().focusGlow()) { Text(label) }
    }
}

/** Tick the languages to watch; none ticked shows every language. */
@Composable
private fun LanguagePicker(
    languages: List<String>,
    initial: Set<String>,
    onDismiss: () -> Unit,
    onDone: (Set<String>) -> Unit,
) {
    var chosen by remember { mutableStateOf(initial) }
    // Languages that were picked but aren't in the current channels stay listed so they can be unticked.
    val shown = languages + (initial - languages.toSet()).sorted()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Choose languages") },
        text = {
            LazyColumn(Modifier.heightIn(max = 460.dp)) {
                items(shown, key = { it }) { language ->
                    val checked = language in chosen
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .focusGlow(ChipShape)
                            .clickable { chosen = if (checked) chosen - language else chosen + language }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(checked = checked, onCheckedChange = null)
                        Text(language, modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        },
        confirmButton = {
            AccentButton(onClick = { onDone(chosen) }, modifier = Modifier.focusGlow()) {
                Text(if (chosen.isEmpty()) "Show all languages" else "Show ${chosen.size} languages")
            }
        },
        dismissButton = {
            TextButton(onClick = { chosen = emptySet() }, modifier = Modifier.focusGlow()) { Text("Clear") }
        },
    )
}

/** Tick any number of countries; the channel list then shows just those countries. */
@Composable
private fun MultiCountryPicker(
    countries: List<Famelack.Country>,
    initial: List<String>,
    onDismiss: () -> Unit,
    onDone: (List<String>) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var chosen by remember { mutableStateOf(initial) }
    // Ticked countries first, in the order they were ticked, then the rest A to Z.
    val byCode = countries.associateBy { it.code }
    val ordered = chosen.mapNotNull { byCode[it] } + countries.filter { it.code !in chosen }
    val shown = ordered.filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Choose countries") },
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
                        val checked = country.code in chosen
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .focusGlow(ChipShape)
                                .clickable {
                                    chosen = if (checked) chosen - country.code else chosen + country.code
                                }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Checkbox(checked = checked, onCheckedChange = null)
                            Text(country.name, modifier = Modifier.weight(1f).padding(start = 8.dp))
                            Text(
                                "${country.channelCount}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(end = 8.dp),
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            AccentButton(
                onClick = { onDone(chosen) },
                enabled = chosen.isNotEmpty(),
                modifier = Modifier.focusGlow(),
            ) { Text(if (chosen.isEmpty()) "Tick a country" else "Show ${chosen.size} countries") }
        },
        dismissButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Back") } },
    )
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
                                .focusGlow(ChipShape)
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
        dismissButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Back") } },
    )
}

/** Bulk Bazaar Inc.'s banner at 80% width; opens bulkbazaar.ca. Uses the wide banner when there is room. */
@Composable
private fun BulkBazaarBanner() {
    val context = LocalContext.current
    val shape = RoundedCornerShape(8.dp)
    BoxWithConstraints(Modifier.fillMaxWidth().padding(vertical = 14.dp), contentAlignment = Alignment.Center) {
        val wide = maxWidth >= 440.dp
        Image(
            painter = painterResource(if (wide) R.drawable.bulkbazaar_wide else R.drawable.bulkbazaar_phone),
            contentDescription = "Bulk Bazaar Inc.: wholesale T-shirt bags. Visit bulkbazaar.ca",
            contentScale = ContentScale.FillWidth,
            modifier = Modifier
                .fillMaxWidth(0.8f)
                .aspectRatio(if (wide) 728f / 90f else 320f / 100f)
                .focusGlow(shape)
                .clip(shape)
                .clickable {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.bulkbazaar.ca"))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    try {
                        context.startActivity(intent)
                    } catch (e: ActivityNotFoundException) {
                        // TVs often have no web browser.
                        Toast.makeText(context, "Visit www.bulkbazaar.ca", Toast.LENGTH_LONG).show()
                    }
                },
        )
    }
}
