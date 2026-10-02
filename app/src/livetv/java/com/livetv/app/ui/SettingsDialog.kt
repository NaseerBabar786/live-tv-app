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
import com.livetv.app.data.IptvOrg
import com.livetv.app.data.Playlist

/**
 * Lets the user choose which channels to show: Pakistani, Indian, Canadian, UK and USA,
 * every country, or a single country.
 */
@Composable
fun SettingsDialog(
    currentSource: String,
    provider: String,
    onProviderChange: (String) -> Unit,
    playlists: List<Playlist>,
    onSelectPlaylist: (Playlist) -> Unit,
    onAddPlaylist: (name: String, url: String) -> Unit,
    onRemovePlaylist: (Playlist) -> Unit,
    loadCatalogue: suspend () -> Result<List<IptvOrg.Listing>>,
    countries: List<Famelack.Country>,
    languages: List<String>,
    selectedLanguages: Set<String>,
    onLanguagesChange: (Set<String>) -> Unit,
    showMta: Boolean,
    onShowMtaChange: (Boolean) -> Unit,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    val context = LocalContext.current
    val appVersion = remember {
        runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull()
    }
    var pickingCountries by rememberSaveable { mutableStateOf(false) }
    var pickingLanguages by rememberSaveable { mutableStateOf(false) }
    var showingAppBazaar by rememberSaveable { mutableStateOf(false) }
    var findingPlaylists by rememberSaveable { mutableStateOf(false) }
    var addingLink by rememberSaveable { mutableStateOf(false) }

    if (findingPlaylists) {
        FindPlaylistsDialog(
            saved = playlists,
            load = loadCatalogue,
            onAdd = { name, url -> onAddPlaylist("$name (iptv-org)", url) },
            onDismiss = { findingPlaylists = false },
        )
        return
    }

    if (addingLink) {
        AddLinkDialog(
            suggestedName = nextPlaylistName(playlists),
            onDismiss = { addingLink = false },
            onAdd = onAddPlaylist,
        )
        return
    }

    if (showingAppBazaar) {
        AppBazaarDialog(onDismiss = { showingAppBazaar = false })
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
    // The starting mix (Pakistani, Indian, Canadian, UK and USA) shows as those five countries picked.
    val allCountries = currentSource == Famelack.SOURCE_ALL
    val picked = Famelack.pickedCountries(currentSource)
        ?: Famelack.MIX.map { it.country }.takeIf { currentSource == Famelack.SOURCE_MIX }
        ?: countries.map { it.code }.takeIf { allCountries }

    if (pickingCountries) {
        MultiCountryPicker(
            countries = countries,
            initial = picked ?: Famelack.MIX.map { it.country },
            onDismiss = { pickingCountries = false },
            onDone = {
                onSave(if (it.size == countries.size) Famelack.SOURCE_ALL else Famelack.pickSource(it))
            },
        )
        return
    }


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
                SourceButton("Working channels only (checked daily)", provider == ChannelRepository.PROVIDER_CHECKED) {
                    onProviderChange(ChannelRepository.PROVIDER_CHECKED)
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
                SourceButton(
                    label = when {
                        countries.isEmpty() -> "Loading countries…"
                        allCountries -> "All countries"
                        picked != null -> "Your countries (${picked.size})"
                        else -> "Choose countries…"
                    },
                    selected = picked != null,
                    enabled = countries.isNotEmpty(),
                ) { pickingCountries = true }

                HorizontalDivider()
                Text("MTA (Ahmadiyya)", fontWeight = FontWeight.Bold)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .focusGlow(ChipShape)
                        .clickable { onShowMtaChange(!showMta) }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = showMta, onCheckedChange = null)
                    Column(Modifier.padding(start = 8.dp)) {
                        Text("Show MTA channels and programmes")
                        Text(
                            "Muslim Television Ahmadiyya: 8 live channels and its programmes in the Library.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.secondary,
                        )
                    }
                }

                HorizontalDivider()
                Text("My playlists", fontWeight = FontWeight.Bold)
                PlaylistRows(
                    playlists = playlists,
                    currentSource = currentSource,
                    onSelect = onSelectPlaylist,
                    onRemove = onRemovePlaylist,
                )
                OutlinedButton(
                    onClick = { findingPlaylists = true },
                    modifier = Modifier.fillMaxWidth().focusGlow(),
                ) { Text("🔍 Find playlists online") }
                OutlinedButton(
                    onClick = { addingLink = true },
                    modifier = Modifier.fillMaxWidth().focusGlow(),
                ) { Text("＋ Add playlist link") }

                HorizontalDivider()
                OutlinedButton(
                    onClick = { showingAppBazaar = true },
                    modifier = Modifier.fillMaxWidth().focusGlow(),
                ) { Text("More free apps: App Bazaar") }

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
    val all = countries.isNotEmpty() && chosen.size == countries.size
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
                    if (query.isBlank()) {
                        item(key = "all") {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .focusGlow(ChipShape)
                                    .clickable { chosen = if (all) emptyList() else countries.map { it.code } }
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(checked = all, onCheckedChange = null)
                                Text(
                                    "All countries",
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.weight(1f).padding(start = 8.dp),
                                )
                                Text(
                                    "${countries.sumOf { it.channelCount }}",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(end = 8.dp),
                                )
                            }
                        }
                    }
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
            ) {
                Text(
                    when {
                        chosen.isEmpty() -> "Tick a country"
                        all -> "Show all countries"
                        else -> "Show ${chosen.size} countries"
                    }
                )
            }
        },
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

private const val APP_BAZAAR = "apps.bulkbazaar.ca"

/**
 * Our app store, App Bazaar: its address and a QR code to scan with a phone (TVs often have no
 * web browser), plus a button to open it where there is one.
 */
@Composable
private fun AppBazaarDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    val intent = remember {
        Intent(Intent.ACTION_VIEW, Uri.parse("https://$APP_BAZAAR")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val hasBrowser = remember { intent.resolveActivity(context.packageManager) != null }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("More free apps: App Bazaar") },
        text = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
            ) {
                Text("Visit our app store, App Bazaar, for more free and useful apps.")
                Text(APP_BAZAAR, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Image(
                    painter = painterResource(R.drawable.app_bazaar_qr),
                    contentDescription = "QR code for $APP_BAZAAR",
                    modifier = Modifier.heightIn(max = 180.dp).aspectRatio(1f),
                )
                Text("Scan the code with your phone's camera.", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            if (hasBrowser) {
                TextButton(
                    onClick = {
                        try {
                            context.startActivity(intent)
                        } catch (e: ActivityNotFoundException) {
                            Toast.makeText(context, "Visit $APP_BAZAAR", Toast.LENGTH_LONG).show()
                        }
                    },
                    modifier = Modifier.focusGlow(),
                ) { Text("Open") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Back") } },
    )
}
