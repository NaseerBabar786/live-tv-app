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
import com.livetv.app.account.Billing
import com.livetv.app.ui.BillingDialog
import com.livetv.app.account.Subscription
import com.livetv.app.ui.PlanEndingNotice
import com.livetv.app.ui.CodeEndsReminder
import com.livetv.app.ui.PlansScreen
import com.livetv.app.ui.MessagesScreen
import com.livetv.app.ui.MessagePopupDialog
import com.livetv.app.ui.WelcomeDialog
import com.livetv.app.ui.GoldFeatureDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import com.livetv.app.account.Welcome
import com.livetv.app.ui.SignInScreen
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.livetv.app.ui.MainViewModel
import com.livetv.app.ui.SettingsDialog
import com.livetv.app.ui.SettingsTheme
import com.livetv.app.ui.SponsorBar
import com.livetv.app.ui.SponsorCard
import com.livetv.app.ui.LIBRARY_PREFIX
import com.livetv.app.player.LibraryAds
import com.livetv.app.player.ModeAds
import com.livetv.app.ui.StartScreen
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
import com.livetv.app.ui.appBazaarLaunchIntent

/**
 * NextGen Cable: built-in free channels, a sponsor screen at start, and self-updates from GitHub.
 * Live TV Max (the max flavor) is built from this same code; [MAX] tells them apart.
 */
object Edition {
    const val LIVE_TV = true
    /** Live TV Max: opens on the Browse home screen, with language rows, a now/next guide, movies and dramas. */
    const val MAX = BuildConfig.IS_MAX

    /** Every channel and every feature free for everyone, no packages or payments (owner, 2026-10-10). */
    const val FREE_FOR_ALL = true
    val APP_NAME = if (MAX) "Live TV Max" else "NextGen Cable"
    const val USER_AGENT = "LiveTV-Android/1.0"
    const val HAS_START_SCREEN = true
    /** A top-bar button for our app store, App Bazaar (owner, 2026-10-09). */
    const val HAS_APP_BAZAAR = true
    /** A top-bar button for the shop of home sellers, tv.bulkbazaar.ca/shop (owner's earn-from-home idea, 2026-10-10). NextGen Cable only. */
    val HAS_SHOP = !MAX
    const val HAS_WEATHER = true
    /** Asks once for the device's approximate location, for the weather and prayer times. */
    const val HAS_DEVICE_LOCATION = true
    /** Movies & Series from the saved playlists (NextGen Cable only). */
    const val HAS_VOD = true
    /** Spark TV (Google Play): only our own channels that may go on Google Play, no YouTube ones. */
    const val PLAY_CHANNELS = false
    /** What the paid features are called in this app. */
    const val PREMIUM_NAME = "Premium"
}

/**
 * The start screen: a loading circle while it checks for updates and loads the channels, then the
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
    // one account works on one device at a time, so it would sign NextGen Cable out on the same TV.
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
            // The package first: 2 devices lets the account stay signed in on a second device.
            Subscription.refresh(context, account)
            account.recordOpen()
        }
    }
    // The sponsors' latest list arrives meanwhile, for the pop-up ads after a channel change.
    LaunchedEffect(Unit) {
        SponsorViews.init(context)
        Sponsors.init(context)
        Sponsors.refresh(account)
    }
    // The owner's own channel and its schedule (tv.bulkbazaar.ca/studio).
    LaunchedEffect(Unit) {
        MyChannel.init(context)
        MyChannelSync.refresh(account)
    }
    StartScreen(loading = state.loading, onDone = onDone)
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
    MessagePopupShown()
    if (FirebaseConfig.configured && !Edition.MAX) WelcomePrompt()
    if (FirebaseConfig.configured && !Edition.MAX) PlanPrompts()
    if (FirebaseConfig.configured && !Edition.MAX) GoldTry()
    if (FirebaseConfig.configured && !Edition.MAX) CodeEndsReminder()
    if (FirebaseConfig.configured && !Edition.MAX) BillingPrompt()
    // A sponsor's card after a channel change, now and then.
    val main by viewModel<MainViewModel>().state.collectAsStateWithLifecycle()
    // Library movies and dramas get the full-screen ad breaks too (1.9.89); a video in YouTube's own
    // player only our own promo before it starts, no paid sponsor ads (YouTube's rules).
    val library by LibraryAds.now.collectAsStateWithLifecycle()
    val vod = library
    // Strip and Carousel's big picture gets the breaks too (A21).
    val inMode by ModeAds.now.collectAsStateWithLifecycle()
    SponsorCard(
        channelId = vod?.let { LIBRARY_PREFIX + it.id } ?: main.lastWatchedId,
        fullScreen = main.playing != null || (vod != null && (!vod.embed || vod.waiting)) || inMode != null,
        promosOnly = vod?.embed == true,
    )
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
 * NextGen Cable's packages: the packages screen when a mode or section needs a bigger package
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
 * A Free viewer trying a Gold feature (Plans.ask): a short line says it's free to try for a minute; when the
 * minute is up the feature closes (1+List comes back) and "This is a Gold feature" pops up.
 */
@Composable
private fun GoldTry() {
    val trying by Plans.trying.collectAsStateWithLifecycle()
    val over by Plans.tryOver.collectAsStateWithLifecycle()
    val until = trying?.until
    var hint by remember { mutableStateOf(false) }
    LaunchedEffect(until) {
        hint = false
        if (until == null) return@LaunchedEffect
        hint = true
        delay(minOf(8_000L, (until - System.currentTimeMillis()).coerceAtLeast(0)))
        hint = false
        delay((until - System.currentTimeMillis()).coerceAtLeast(0))
        Plans.endTry()
    }
    val t = trying
    if (hint && t != null) {
        androidx.compose.ui.window.Popup(
            alignment = androidx.compose.ui.Alignment.BottomCenter,
            properties = androidx.compose.ui.window.PopupProperties(focusable = false),
        ) {
            Text(
                "⭐ ${t.label} is a Gold feature. Try it free for 1 minute.",
                color = androidx.compose.ui.graphics.Color.White,
                style = androidx.compose.material3.MaterialTheme.typography.bodyLarge,
                modifier = Modifier
                    .padding(bottom = 28.dp)
                    .background(androidx.compose.ui.graphics.Color(0xE6000000), androidx.compose.foundation.shape.RoundedCornerShape(50))
                    .padding(horizontal = 20.dp, vertical = 10.dp),
            )
        }
    }
    over?.let { feature ->
        GoldFeatureDialog(
            feature = feature,
            onGetGold = { Plans.closeTryOver(); Plans.showPlans() },
            onDismiss = Plans::closeTryOver,
        )
    }
}

/**
 * Opens the billing details form when the owner asked for it on tv.bulkbazaar.ca/users and the
 * viewer hasn't answered yet: about a minute after start, once per start until they send it.
 */
@Composable
private fun BillingPrompt() {
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val user by account.user.collectAsStateWithLifecycle()
    var open by remember { mutableStateOf(false) }
    LaunchedEffect(user?.uid) {
        if (user == null || account.isAdmin) return@LaunchedEffect
        delay(60_000)
        // Everything is free (owner, 2026-10-10): no payment details to ask for.
        if (Edition.FREE_FOR_ALL) return@LaunchedEffect
        if (runCatching { Billing.load(account) }.getOrNull()?.waiting == true) open = true
    }
    if (open) BillingDialog(asked = true, onDismiss = { open = false })
}

/**
 * The welcome gift (owner, 2026-10-08): one more month of Gold free with promo code WELCOME, and
 * please leave us a good review. New viewers first get the 7-day free trial; the gift pops up once per
 * account 8 hours after the trial ends (checked at start and every hour), for every viewer who hasn't
 * used the code yet. It stays at the top of their Messages, and they can type the code any time.
 */
@Composable
private fun WelcomePrompt() {
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val user by account.user.collectAsStateWithLifecycle()
    var open by remember { mutableStateOf(false) }
    LaunchedEffect(user?.uid) {
        if (user == null || account.isAdmin) return@LaunchedEffect
        delay(25_000)
        while (true) {
            val state = runCatching { Welcome.state(account) }.getOrNull() ?: return@LaunchedEffect
            if (state.sentAt != null || !state.canUse) return@LaunchedEffect
            if (!state.offerAt.after(java.util.Date())) {
                Welcome.markSent(account)
                open = true
                return@LaunchedEffect
            }
            delay(60 * 60_000L)
        }
    }
    if (open) WelcomeDialog(onDismiss = { open = false })
}

/**
 * Private messages. A viewer gets the NextGen Cable team's message as a pop-up over whatever is playing,
 * within about a minute while the app is open, or a few seconds after the next start if the TV was off
 * (owner, 2026-10-09), and can answer it right there with one press of the remote. The owner gets
 * "New message from a viewer" soon after start and then every 30 minutes (their list costs more to check).
 * Each message pops up only once; it stays in ✉ Messages.
 */
@Composable
private fun NewMessagePrompt() {
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val user by account.user.collectAsStateWithLifecycle()
    val prefs = remember { context.getSharedPreferences("messages", android.content.Context.MODE_PRIVATE) }
    var preview by remember { mutableStateOf<String?>(null) }
    var reading by remember { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    // Coming back to the app checks at once.
    val kick = remember { kotlinx.coroutines.channels.Channel<Unit>(kotlinx.coroutines.channels.Channel.CONFLATED) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_START) kick.trySend(Unit) }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    val appScope = rememberCoroutineScope()
    LaunchedEffect(user?.uid) {
        val me = user ?: return@LaunchedEffect
        val messages = Messages(account)
        if (!account.isAdmin) {
            MessagePopup.sendReply = { text -> messages.send(me.uid, text) }
            MessagePopup.markRead = { appScope.launch { messages.markRead(me.uid) } }
        }
        delay(10_000)
        kick.tryReceive()
        while (true) {
            // Only while the app is on screen (or one of our channels full screen in front of it).
            val visible = lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED) || MessagePopup.webInFront
            if (visible) {
                val newest = runCatching { messages.newest() }.getOrNull()
                if (newest != null && newest.second.time > prefs.getLong("announced", 0L)) {
                    prefs.edit().putLong("announced", newest.second.time).apply()
                    if (account.isAdmin) {
                        preview = newest.first
                    } else {
                        val lines = runCatching { messages.unanswered(me.uid) }.getOrNull().orEmpty().ifEmpty { listOf(newest.first) }
                        MessagePopup.show(MessagePopup.Incoming(lines, newest.second.time))
                        messages.markSeen(me.uid, newest.second)
                    }
                }
            }
            val wait = if (account.isAdmin) 30 * 60_000L else CHECK_MESSAGES_MS
            kotlinx.coroutines.withTimeoutOrNull(wait) { kick.receive() }
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
            title = { Text("✉ New message from a viewer") },
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

/** The team's message over the main screen, while one is waiting (NewMessagePrompt fills it in). */
@Composable
private fun MessagePopupShown() {
    val popup by MessagePopup.shown.collectAsStateWithLifecycle()
    popup?.let { MessagePopupDialog(it) }
}

/** How often a viewer's app looks for a new message while it's open: one small read each time. */
private const val CHECK_MESSAGES_MS = 60_000L

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
fun EditionTicker(
    modifier: Modifier,
    big: Boolean = false,
    always: Boolean = false,
    everyMs: Long = 0L,
    skip: () -> Boolean = { false },
    band: Boolean = false,
    lift: androidx.compose.ui.unit.Dp = androidx.compose.ui.unit.Dp(0f),
) = SponsorTicker(modifier, big, always, everyMs, skip, band, lift)

/**
 * Our app store (the top-bar App Bazaar button; it left Settings, owner 2026-10-09): opens the
 * App Bazaar app at once when it's installed, else a dialog that installs it.
 */
@Composable
fun EditionAppBazaar(onDismiss: () -> Unit) {
    val context = LocalContext.current
    val opened = remember {
        val open = context.appBazaarLaunchIntent()
        open != null && runCatching { context.startActivity(open) }.isSuccess
    }
    if (opened) LaunchedEffect(Unit) { onDismiss() } else SettingsTheme { com.livetv.app.ui.AppBazaarDialog(onDismiss) }
}

/** The shop of home sellers (tv.bulkbazaar.ca/shop) in our in-app web page; on a TV each item shows a QR code to order by phone. */
@Composable
fun EditionShop(onDismiss: () -> Unit) {
    com.livetv.app.ui.SponsorSite("https://tv.bulkbazaar.ca/shop?tv=1", "Shop from home sellers", onClose = onDismiss)
}

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
            onResetDefaults = {
                onDismiss()
                viewModel.resetToDefaults()
            },
            onDismiss = onDismiss,
            onSave = {
                onDismiss()
                viewModel.setPlaylistSource(it)
            },
            onProfileChanged = {
                onDismiss()
                viewModel.profileChanged()
            },
        )
    }
}
