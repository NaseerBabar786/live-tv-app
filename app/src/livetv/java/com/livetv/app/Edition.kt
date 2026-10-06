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
import com.livetv.app.account.Messages
import com.livetv.app.account.Subscription
import com.livetv.app.ui.PlanEndingNotice
import com.livetv.app.ui.PlansScreen
import com.livetv.app.ui.MessagesScreen
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
import com.livetv.app.ui.SponsorBox
import com.livetv.app.ui.SponsorVideoBox
import com.livetv.app.ui.SponsorStrip
import com.livetv.app.ui.SponsorTicker
import com.livetv.app.sponsor.Sponsor
import com.livetv.app.sponsor.SponsorViews
import com.livetv.app.sponsor.Sponsors
import com.livetv.app.sponsor.MyChannelSync
import com.livetv.app.data.MyChannel
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.livetv.app.ui.UiState
import com.livetv.app.ui.UpdatePromptDialog
import com.livetv.app.ui.UpdateState
import com.livetv.app.ui.UpdateViewModel
import com.livetv.app.ui.VodViewModel
import com.livetv.app.ui.focusGlow

/**
 * Free Live TV: built-in free channels, a sponsor screen at start, and self-updates from GitHub.
 * Live TV Max (the max flavor) is built from this same code; [MAX] tells them apart.
 */
object Edition {
    const val LIVE_TV = true
    /** Live TV Max: opens on the Browse home screen, with language rows, a now/next guide, movies and dramas. */
    const val MAX = BuildConfig.IS_MAX
    val APP_NAME = if (MAX) "Live TV Max" else "Free Live TV"
    const val USER_AGENT = "LiveTV-Android/1.0"
    const val HAS_START_SCREEN = true
    const val HAS_WEATHER = true
    /** Asks once for the device's approximate location, for the weather and prayer times. */
    const val HAS_DEVICE_LOCATION = true
    /** Movies & Series from the saved playlists (Free Live TV only). */
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
    // each start is then recorded so the owner can count users. Live TV Max doesn't ask:
    // one account works on one device at a time, so it would sign Free Live TV out on the same TV.
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val user by account.user.collectAsStateWithLifecycle()
    remember { Subscription.init(context) }
    if (FirebaseConfig.configured && user == null && !Edition.MAX) {
        SignInScreen(onSignedIn = {})
        return
    }
    LaunchedEffect(Unit) {
        if (FirebaseConfig.configured) {
            // The package first: Platinum lets the account stay signed in on a second device.
            Subscription.refresh(context, account)
            account.recordOpen()
        }
    }
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
    // The owner's own channel and its schedule (tv.bulkbazaar.ca/studio).
    LaunchedEffect(Unit) {
        MyChannel.init(context)
        MyChannelSync.refresh(account)
    }
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
                // A package bought or ended reaches TVs that stay on for days.
                if (minutes % 60 == 0) Subscription.refresh(context, account)
                // The owner's channel schedule changes more often.
                MyChannelSync.refresh(account)
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
    if (FirebaseConfig.configured) NewMessagePrompt()
    if (FirebaseConfig.configured && !Edition.MAX) PlanPrompts()
    // A sponsor's card after a channel change, now and then.
    val main by viewModel<MainViewModel>().state.collectAsStateWithLifecycle()
    SponsorCard(channelId = main.lastWatchedId, fullScreen = main.playing != null)
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
                    text = { Text(u.message + " ${Edition.APP_NAME} will offer the update again next time it starts.") },
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

/**
 * Free Live TV's packages: the packages screen when a mode or section needs a bigger package
 * (or from Settings), and the warning when a package is about to end.
 */
@Composable
private fun PlanPrompts() {
    val asking by Plans.asking.collectAsStateWithLifecycle()
    var messages by remember { mutableStateOf(false) }
    if (messages) {
        MessagesScreen(onClose = { messages = false })
        return
    }
    val a = asking
    if (a != null) {
        PlansScreen(
            feature = a.feature,
            needed = a.needed,
            onMessages = { Plans.closeAsk(); messages = true },
            onDismiss = Plans::closeAsk,
        )
        return
    }
    PlanEndingNotice(onRenew = Plans::showPlans, onMessages = { messages = true })
}

/**
 * Says when a private message has arrived (for a viewer, from the Free Live TV team; for the owner,
 * from a viewer): soon after start, then every 30 minutes. Each message is announced only once.
 */
@Composable
private fun NewMessagePrompt() {
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val user by account.user.collectAsStateWithLifecycle()
    val prefs = remember { context.getSharedPreferences("messages", android.content.Context.MODE_PRIVATE) }
    var preview by remember { mutableStateOf<String?>(null) }
    var reading by remember { mutableStateOf(false) }
    LaunchedEffect(user?.uid) {
        if (user == null) return@LaunchedEffect
        delay(15_000)
        while (true) {
            val newest = runCatching { Messages(account).newest() }.getOrNull()
            if (newest != null && newest.second.time > prefs.getLong("announced", 0L)) {
                prefs.edit().putLong("announced", newest.second.time).apply()
                preview = newest.first
            }
            delay(30 * 60_000L)
        }
    }
    if (reading) {
        MessagesScreen(onClose = { reading = false })
        return
    }
    val text = preview ?: return
    SettingsTheme {
        AlertDialog(
            onDismissRequest = { preview = null },
            title = { Text(if (account.isAdmin) "✉ New message from a viewer" else "✉ New message from the Free Live TV team") },
            text = { Text(text.take(200) + if (text.length > 200) "…" else "") },
            confirmButton = {
                TextButton(onClick = { preview = null; reading = true }, modifier = Modifier.focusGlow()) { Text("Read and reply") }
            },
            dismissButton = {
                TextButton(onClick = { preview = null }, modifier = Modifier.focusGlow()) { Text("Later") }
            },
        )
    }
}

/** The paying sponsors' strip under the 1+List channel list. */
@Composable
fun EditionSponsorStrip(modifier: Modifier) = SponsorStrip(modifier)

/** The paying sponsors' bar under the two tiles of 1×2. */
@Composable
fun EditionSponsorBar(modifier: Modifier) = SponsorBar(modifier)

/** A sponsor's 16:9 picture under the three side tiles of 1+3. */
@Composable
fun EditionSponsorBox(modifier: Modifier) = SponsorBox(modifier)

/** News mode's sponsor corner: a picture, or the sponsor's muted video while [allowVideo]. */
@Composable
fun EditionSponsorVideoBox(modifier: Modifier, allowVideo: Boolean, clickable: Boolean = false, onBack: (() -> Unit)? = null) =
    SponsorVideoBox(modifier, allowVideo, clickable, onBack)

/** Whether any sponsor shows today, so layouts keep room for one only when there is. */
@Composable
fun editionHasSponsors(): Boolean {
    val all by Sponsors.all.collectAsStateWithLifecycle()
    return remember(all) { Sponsors.current().isNotEmpty() }
}

/** The "advertise with us" line: beside the channel count, or [big] in the band above the tiles. */
@Composable
fun EditionTicker(modifier: Modifier, big: Boolean = false, always: Boolean = false) = SponsorTicker(modifier, big, always)

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
