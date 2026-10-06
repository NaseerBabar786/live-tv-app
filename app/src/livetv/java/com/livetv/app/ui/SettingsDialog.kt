package com.livetv.app.ui

import com.livetv.app.data.OwnerTest
import android.content.ActivityNotFoundException
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
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
import com.livetv.app.account.Account
import com.livetv.app.account.Subscription
import com.livetv.app.Edition
import com.livetv.app.Plans
import com.livetv.app.account.Messages
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Spacer
import androidx.compose.runtime.LaunchedEffect
import com.livetv.app.account.FirebaseConfig
import androidx.compose.runtime.collectAsState
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
    var showingSuggestions by rememberSaveable { mutableStateOf(false) }
    var showingMessages by rememberSaveable { mutableStateOf(false) }
    var changingPassword by rememberSaveable { mutableStateOf(false) }
    val account = remember { Account.get(context) }
    val signedIn by account.user.collectAsState()
    var findingPlaylists by rememberSaveable { mutableStateOf(false) }
    var addingLink by rememberSaveable { mutableStateOf(false) }
    var pickingCity by rememberSaveable { mutableStateOf(false) }
    var pickingTheme by rememberSaveable { mutableStateOf(false) }
    if (pickingTheme) {
        ThemePicker(onDismiss = { pickingTheme = false })
        return
    }

    if (pickingCity) {
        WeatherCityPicker(onDismiss = { pickingCity = false })
        return
    }

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

    if (showingSuggestions) {
        SuggestionsScreen(onClose = { showingSuggestions = false })
        return
    }

    if (changingPassword) {
        ChangePasswordDialog(onDismiss = { changingPassword = false })
        return
    }

    if (showingMessages) {
        MessagesScreen(onClose = { showingMessages = false })
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
                        modifier = Modifier.clickable { OwnerTest.tap(context) }, // 7 taps: owner's test updates
                    )
                }
            }
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                // Cable TV always uses the working channels (1.9.60); Live TV Max still offers the choice.
                if (Edition.MAX) {
                    Text("Channel list", fontWeight = FontWeight.Bold)
                    SourceButton("Main list", provider == ChannelRepository.PROVIDER_FAMELACK) {
                        onProviderChange(ChannelRepository.PROVIDER_FAMELACK)
                    }
                    SourceButton("Working channels only (checked daily)", provider == ChannelRepository.PROVIDER_CHECKED) {
                        onProviderChange(ChannelRepository.PROVIDER_CHECKED)
                    }

                    HorizontalDivider()
                }
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
                ThemeSection(onPick = { pickingTheme = true })
                HorizontalDivider()
                WeatherCitySection(onPick = { pickingCity = true })

                HorizontalDivider()
                Text("News, CP24 and My Screen", fontWeight = FontWeight.Bold)
                Text(
                    "To change what these screens show, open the screen and hold OK (or tap ⚙ on a phone).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary,
                )

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

                if (FirebaseConfig.configured && signedIn != null) {
                    HorizontalDivider()
                    OutlinedButton(
                        onClick = { showingSuggestions = true },
                        modifier = Modifier.fillMaxWidth().focusGlow(),
                    ) { Text("💬 Suggestions: tell us what to improve") }
                    var unread by remember { mutableStateOf(false) }
                    LaunchedEffect(Unit) { unread = runCatching { Messages(account).newest() != null }.getOrDefault(false) }
                    OutlinedButton(
                        onClick = { showingMessages = true },
                        modifier = Modifier.fillMaxWidth().focusGlow(),
                    ) {
                        Text(if (account.isAdmin) "✉ Messages from viewers" else "✉ Messages from the Cable TV team")
                        if (unread) {
                            Spacer(Modifier.width(8.dp))
                            NewBadge()
                        }
                    }
                    if (!Edition.MAX) {
                        val tier by Plans.current.collectAsState()
                        val offer by Subscription.offer.collectAsState()
                        OutlinedButton(
                            onClick = { onDismiss(); Plans.showPlans() },
                            modifier = Modifier.fillMaxWidth().focusGlow(),
                        ) { Text(if (offer.enforced) "⭐ My package: ${tier.label}" else "⭐ Packages") }
                    }
                    val u = signedIn!!
                    Text(
                        "Signed in as ${u.name.ifBlank { u.email }}" + if (u.name.isNotBlank()) " (${u.email})" else "",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    if (account.usesPassword) {
                        TextButton(onClick = { changingPassword = true }, modifier = Modifier.focusGlow()) {
                            Text("🔑 Change password")
                        }
                    }
                    TextButton(
                        onClick = {
                            account.signOut()
                            context.restartApp()
                        },
                        modifier = Modifier.focusGlow(),
                    ) { Text("Sign out") }
                }

                HorizontalDivider()
                OutlinedButton(
                    onClick = {
                        val open = context.appBazaarLaunchIntent()
                        if (open == null || runCatching { context.startActivity(open) }.isFailure) showingAppBazaar = true
                    },
                    modifier = Modifier.fillMaxWidth().focusGlow(),
                ) { Text("App Bazaar") }
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

private const val APP_BAZAAR = "apps.bulkbazaar.ca"
private const val APP_BAZAAR_PACKAGE = "com.naseerbabar.appbazaar"
private const val APP_BAZAAR_APK = "https://github.com/NaseerBabar786/live-tv-app/releases/download/app-bazaar/AppBazaar.apk"

/** The App Bazaar app's start screen (the TV one on TVs), or null when it isn't installed. */
private fun android.content.Context.appBazaarLaunchIntent(): Intent? {
    val pm = packageManager
    val tv = pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK)
    return (pm.getLeanbackLaunchIntentForPackage(APP_BAZAAR_PACKAGE)?.takeIf { tv }
        ?: pm.getLaunchIntentForPackage(APP_BAZAAR_PACKAGE)
        ?: pm.getLeanbackLaunchIntentForPackage(APP_BAZAAR_PACKAGE))
        ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}

/**
 * Our app store, App Bazaar. When the App Bazaar app is on the device, Open starts it (not the
 * website). Otherwise Install downloads the app and opens the installer; the address and a QR
 * code stay for phones without it.
 */
@Composable
private fun AppBazaarDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var bazaar by remember { mutableStateOf(context.appBazaarLaunchIntent()) }
    var progress by remember { mutableStateOf<Float?>(null) }
    // Coming back from the installer: switch Install to Open.
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    androidx.compose.runtime.DisposableEffect(lifecycle) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) bazaar = context.appBazaarLaunchIntent()
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("App Bazaar") },
        text = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
            ) {
                if (bazaar != null) {
                    Text("Open the App Bazaar app to install and update all our free apps.")
                } else {
                    Text("Get the App Bazaar app to install and update all our free apps on this device.")
                    progress?.let { Text("Downloading App Bazaar… ${(it * 100).toInt()}%") }
                    Text("Or visit $APP_BAZAAR", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Image(
                        painter = painterResource(R.drawable.app_bazaar_qr),
                        contentDescription = "QR code for $APP_BAZAAR",
                        modifier = Modifier.heightIn(max = 160.dp).aspectRatio(1f),
                    )
                    Text("Scan the code with your phone's camera.", style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            val open = bazaar
            if (open != null) {
                TextButton(
                    onClick = {
                        if (runCatching { context.startActivity(open) }.isSuccess) onDismiss()
                        else Toast.makeText(context, "App Bazaar didn't open. Please try again.", Toast.LENGTH_LONG).show()
                    },
                    modifier = Modifier.focusGlow(),
                ) { Text("Open App Bazaar") }
            } else {
                TextButton(
                    enabled = progress == null,
                    onClick = {
                        val updater = com.livetv.app.data.Updater(context)
                        if (!updater.ensureInstallAllowed()) {
                            Toast.makeText(context, "Allow Cable TV to install apps, then press Install again.", Toast.LENGTH_LONG).show()
                            return@TextButton
                        }
                        progress = 0f
                        scope.launch {
                            runCatching {
                                val apk = updater.download(
                                    com.livetv.app.data.Updater.Release("", APP_BAZAAR_APK, 0), "AppBazaar.apk",
                                ) { progress = it }
                                updater.install(apk)
                            }.onFailure {
                                Toast.makeText(context, "Couldn't download App Bazaar: ${it.message}", Toast.LENGTH_LONG).show()
                            }
                            progress = null
                        }
                    },
                    modifier = Modifier.focusGlow(),
                ) { Text("Install App Bazaar") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Back") } },
    )
}

/** Starts Cable TV again from the beginning (after signing out, so it asks to sign in). */
private fun android.content.Context.restartApp() {
    val intent = packageManager.getLaunchIntentForPackage(packageName)?.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK,
    ) ?: return
    startActivity(intent)
}
