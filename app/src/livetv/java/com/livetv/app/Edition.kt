package com.livetv.app

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.livetv.app.account.Account
import com.livetv.app.account.FirebaseConfig
import com.livetv.app.ui.SignInScreen
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.livetv.app.ui.MainViewModel
import com.livetv.app.ui.SettingsDialog
import com.livetv.app.ui.SettingsTheme
import com.livetv.app.ui.SponsorBar
import com.livetv.app.ui.SponsorCard
import com.livetv.app.ui.SponsorScreen
import com.livetv.app.ui.SponsorStrip
import com.livetv.app.ui.SponsorTicker
import com.livetv.app.sponsor.Sponsor
import com.livetv.app.sponsor.SponsorViews
import com.livetv.app.sponsor.Sponsors
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.livetv.app.ui.UiState
import com.livetv.app.ui.UpdatePromptDialog
import com.livetv.app.ui.UpdateState
import com.livetv.app.ui.UpdateViewModel
import com.livetv.app.ui.VodViewModel
import com.livetv.app.ui.focusGlow

/** Live TV: built-in free channels, a sponsor screen at start, and self-updates from GitHub. */
object Edition {
    const val LIVE_TV = true
    const val APP_NAME = "Live TV"
    const val USER_AGENT = "LiveTV-Android/1.0"
    const val HAS_START_SCREEN = true
    const val HAS_WEATHER = true
    /** Movies & Series from the saved playlists (Live TV only). */
    const val HAS_VOD = true
}

/**
 * The sponsor screen. Meanwhile it checks for updates and loads the channels, then the
 * Library, so they are ready when the main screen opens.
 */
@Composable
fun EditionStartScreen(onDone: () -> Unit) {
    viewModel<UpdateViewModel>()
    val state by viewModel<MainViewModel>().state.collectAsStateWithLifecycle()
    // The Library's lists load next, once the channels are in, so they don't slow the channels down.
    val library = viewModel<VodViewModel>()
    LaunchedEffect(state.loading) { if (!state.loading) library.refreshIfChanged() }
    // Everyone signs in with Google once (when the owner's Firebase project is set up);
    // each start is then recorded so the owner can count users.
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val user by account.user.collectAsStateWithLifecycle()
    if (FirebaseConfig.configured && user == null) {
        SignInScreen(onSignedIn = {})
        return
    }
    LaunchedEffect(Unit) { if (FirebaseConfig.configured) account.recordOpen() }
    // A paying sponsor, in turn, from the saved list; the latest list arrives meanwhile for next time
    // (or for now, when there was none saved yet).
    var sponsor by remember { mutableStateOf<Sponsor?>(null) }
    LaunchedEffect(Unit) {
        SponsorViews.init(context)
        Sponsors.init(context)
        sponsor = Sponsors.next("start")
        Sponsors.refresh(account)
        if (sponsor == null) sponsor = Sponsors.next("start")
    }
    LaunchedEffect(sponsor?.id) { sponsor?.let { SponsorViews.count(it, "start") } }
    SponsorScreen(loading = state.loading, sponsor = sponsor, onDone = onDone)
}

/**
 * Asks to update when the start-up check found a newer version; quiet otherwise. Also shows the
 * sponsor card after a channel change and sends the viewing totals.
 */
@Composable
fun EditionOverlay() {
    // What's being watched is sent to Firebase every 10 minutes and whenever the app is left,
    // for the owner's stats page.
    if (FirebaseConfig.configured) {
        val context = LocalContext.current
        val account = remember { Account.get(context) }
        val scope = rememberCoroutineScope()
        val lifecycleOwner = LocalLifecycleOwner.current
        LaunchedEffect(Unit) {
            SponsorViews.init(context)
            Sponsors.init(context)
            var minutes = 0
            while (true) {
                delay(10 * 60_000L)
                account.reportViewing()
                // New or changed sponsors reach TVs that stay on for days.
                minutes += 10
                if (minutes % (6 * 60) == 0) Sponsors.refresh(account)
            }
        }
        DisposableEffect(lifecycleOwner) {
            val observer = LifecycleEventObserver { _, event ->
                if (event == Lifecycle.Event.ON_STOP) scope.launch { account.reportViewing() }
            }
            lifecycleOwner.lifecycle.addObserver(observer)
            onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
        }
    }
    // A sponsor's card after a channel change, now and then.
    val main by viewModel<MainViewModel>().state.collectAsStateWithLifecycle()
    SponsorCard(channelId = main.lastWatchedId)
    val updates = viewModel<UpdateViewModel>()
    val prompting by updates.prompting.collectAsStateWithLifecycle()
    val update by updates.update.collectAsStateWithLifecycle()
    if (!prompting) return
    when (val u = update) {
        is UpdateState.Available, is UpdateState.Downloading, is UpdateState.NeedsPermission ->
            UpdatePromptDialog(update = u, onInstall = updates::installUpdate, onLater = updates::dismissPrompt)
        is UpdateState.Failed -> if (updates.installStarted) {
            SettingsTheme {
                AlertDialog(
                    onDismissRequest = updates::dismissPrompt,
                    title = { Text("Update failed") },
                    text = { Text(u.message + " Live TV will offer the update again next time it starts.") },
                    confirmButton = {
                        TextButton(onClick = updates::dismissPrompt, modifier = Modifier.focusGlow()) { Text("OK") }
                    },
                )
            }
        } else {
            LaunchedEffect(Unit) { updates.dismissPrompt() }
        }
        UpdateState.UpToDate -> LaunchedEffect(Unit) { updates.dismissPrompt() }
        else -> Unit
    }
}

/** The paying sponsors' strip under the 1+List channel list. */
@Composable
fun EditionSponsorStrip(modifier: Modifier) = SponsorStrip(modifier)

/** The paying sponsors' bar under the two tiles of 1×2. */
@Composable
fun EditionSponsorBar(modifier: Modifier) = SponsorBar(modifier)

/** The "advertise with us" line: beside the channel count, or [big] in the band above the tiles. */
@Composable
fun EditionTicker(modifier: Modifier, big: Boolean = false) = SponsorTicker(modifier, big)

@Composable
fun EditionSettings(state: UiState, viewModel: MainViewModel, onDismiss: () -> Unit) {
    SettingsTheme {
        SettingsDialog(
            currentSource = state.playlistSource,
            provider = state.provider,
            onProviderChange = {
                onDismiss()
                viewModel.setProvider(it)
            },
            playlists = state.playlists,
            onSelectPlaylist = {
                onDismiss()
                viewModel.setPlaylistSource(it.source)
            },
            onAddPlaylist = { name, url ->
                onDismiss()
                viewModel.addPlaylist(name, url)
            },
            onRemovePlaylist = viewModel::removePlaylist,
            loadCatalogue = { viewModel.playlistCatalogue() },
            countries = state.countries,
            languages = state.allLanguages,
            selectedLanguages = state.languageFilter,
            onLanguagesChange = {
                onDismiss()
                viewModel.setLanguages(it)
            },
            showMta = state.showMta,
            onShowMtaChange = {
                onDismiss()
                viewModel.setShowMta(it)
            },
            onDismiss = onDismiss,
            onSave = {
                onDismiss()
                viewModel.setPlaylistSource(it)
            },
        )
    }
}
