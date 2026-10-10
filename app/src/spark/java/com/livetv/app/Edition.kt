package com.livetv.app

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import com.livetv.app.ui.focusGlow
import androidx.compose.ui.platform.LocalContext
import com.livetv.app.billing.PlayBilling
import com.livetv.app.ui.MainViewModel
import com.livetv.app.ui.SettingsTheme
import com.livetv.app.ui.UiState

/**
 * Spark TV: the Google Play app of our Spark channels (the owner, 2026-10-09). Cable TV's look, clock and
 * weather, with only the channels whose every programme we own or may show: our news and ads,
 * public-domain films and free-licence music. No YouTube channels, no playlists, no sponsor pop-ups,
 * no outside links and no self-updates (Google Play updates it). Gold is a Google Play subscription.
 */
object Edition {
    const val LIVE_TV = false
    const val MAX = false
    const val APP_NAME = "Spark One"
    const val USER_AGENT = "SparkTV-Android/1.0"
    const val HAS_START_SCREEN = false
    const val HAS_WEATHER = true
    /** No outside app store in the Google Play editions. */
    const val HAS_APP_BAZAAR = false
    const val HAS_DEVICE_LOCATION = false
    const val HAS_VOD = false
    /** Only our own channels that may go on Google Play ([MyChannel.PLAY_STATIONS]). */
    const val PLAY_CHANNELS = true
    const val PREMIUM_NAME = "Gold"
    /** The Google Play subscription that unlocks Gold (create it in Play Console with this id). */
    const val PREMIUM_PRODUCT = "spark_gold"
}

/** No start screen ([Edition.HAS_START_SCREEN] is false), so this only hands straight on. */
@Composable
fun EditionStartScreen(onDone: () -> Unit) {
    LaunchedEffect(Unit) { onDone() }
}

/**
 * Starts Gold's Google Play billing (it restores a subscription bought on another device) and keeps our
 * channels' schedules fresh: at start, then every 10 minutes while the app is open.
 */
@Composable
fun EditionOverlay() {
    val context = LocalContext.current
    LaunchedEffect(Unit) {
        PlayBilling.start(context)
        SparkSync.seed(context)
        while (true) {
            SparkSync.refresh()
            kotlinx.coroutines.delay(10 * 60_000L)
        }
    }
}

/** No sponsors here. */
@Composable
fun EditionSponsorStrip(modifier: Modifier) = Unit

@Composable
fun EditionSponsorBar(modifier: Modifier) = Unit

@Composable
fun EditionSponsorBox(modifier: Modifier) = Unit

@Composable
fun EditionSponsorVideoBox(modifier: Modifier, allowVideo: Boolean, clickable: Boolean = false, onBack: (() -> Unit)? = null) = Unit

@Composable
fun editionHasSponsors(): Boolean = false

@Composable
fun EditionTicker(
    modifier: Modifier,
    big: Boolean = false,
    always: Boolean = false,
    everyMs: Long = 0L,
    skip: () -> Boolean = { false },
    band: Boolean = false,
    lift: androidx.compose.ui.unit.Dp = androidx.compose.ui.unit.Dp(0f),
) = Unit

@Composable
fun EditionAppBazaar(onDismiss: () -> Unit) = Unit

/** Spark TV has no playlists to set up: Settings tells where the programmes come from. */
@Composable
fun EditionSettings(state: UiState, viewModel: MainViewModel, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val version = remember { runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() }
    SettingsTheme {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("${Edition.APP_NAME} ${version ?: ""}".trim()) },
            text = {
                Text(
                    "Spark TV News: our own bulletins, read by AI voices from the news services named on screen.\n" +
                        "Spark Classics, Comedy, Sports and Travel Classics: public-domain films and shows from the Internet Archive (archive.org).\n" +
                        "Spark Music: free-licence recordings from Wikimedia Commons; each song's artist and licence show on screen.\n" +
                        "Spark Ads: our own ads and our sponsors'.\n\n" +
                        "${Edition.PREMIUM_NAME} unlocks the 1×2, 2×2 and 2×3 layouts through Google Play.",
                )
            },
            confirmButton = {
                TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Close") }
            },
        )
    }
}
