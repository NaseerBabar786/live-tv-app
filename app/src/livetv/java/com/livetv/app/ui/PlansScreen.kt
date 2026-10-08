package com.livetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.Plans
import com.livetv.app.account.Account
import com.livetv.app.account.Messages
import com.livetv.app.account.Subscription
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

/** "Oct 12, 2026". */
fun planDate(d: Date): String = DateFormat.getDateInstance(DateFormat.MEDIUM).format(d)

/**
 * Cable TV's packages: the viewer's package and when it ends, what each package adds and
 * costs, and an Ask button for each length that messages the owner, who replies with how to pay.
 */
@Composable
fun PlansScreen(feature: String, needed: Plans.Tier, onMessages: () -> Unit, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val scope = rememberCoroutineScope()
    val offer by Subscription.offer.collectAsStateWithLifecycle()
    val status by Subscription.status.collectAsStateWithLifecycle()
    val current by Plans.current.collectAsStateWithLifecycle()
    var sent by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var code by remember { mutableStateOf("") }
    var codeNote by remember { mutableStateOf<String?>(null) }
    var redeeming by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { Subscription.refresh(context, account) }

    fun ask(name: String, length: String, price: String) {
        val me = account.user.value ?: return
        scope.launch {
            error = null
            try {
                Messages(account).send(
                    me.uid,
                    "Hi! Please turn on the $name for $length ($price). How do I pay?",
                )
                sent = "Sent. We'll reply in Messages with how to pay, and turn it on as soon as it's paid."
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = "Couldn't send it. Check the internet connection, or WhatsApp 437 602 6500."
            }
        }
    }

    // A promo code from the owner (tv.bulkbazaar.ca/packages) turns a package on straight away, free.
    fun redeem() {
        if (redeeming) return
        scope.launch {
            redeeming = true
            codeNote = try {
                Subscription.redeem(context, account, code).also { if (it.startsWith("Done")) code = "" }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                "Couldn't check the code. Check the internet connection and try again."
            }
            redeeming = false
        }
    }

    SettingsTheme {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = {
                Text(if (feature.isNotBlank()) "$feature needs ${needed.label}" else "Packages")
            },
            text = {
                Column(
                    Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    val s = status
                    Text(
                        buildString {
                            append("Your package: ${s?.label ?: current.label}")
                            if (s?.trial == true) append(" (free trial)")
                            if (s?.until != null) append(", until ${planDate(s.until)}")
                            if (!offer.enforced) append(". Everything is free for now.")
                        },
                        fontWeight = FontWeight.Bold,
                    )
                    Text(offer.howToPay, style = MaterialTheme.typography.bodySmall)
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text("🎟 Have a promo code?", fontWeight = FontWeight.Bold)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = code,
                                onValueChange = { code = it.uppercase().take(20) },
                                singleLine = true,
                                placeholder = { Text("Promo code") },
                                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Done),
                                keyboardActions = KeyboardActions(onDone = { redeem() }),
                                modifier = Modifier.weight(1f).focusGlow(),
                            )
                            OutlinedButton(onClick = { redeem() }, enabled = !redeeming, modifier = Modifier.focusGlow()) {
                                Text(if (redeeming) "Checking…" else "Use code")
                            }
                        }
                        codeNote?.let { Text(it, color = if (it.startsWith("Done")) FocusColor else Color(0xFFFF8A80)) }
                    }
                    sent?.let { Text(it, color = FocusColor) }
                    error?.let { Text(it, color = Color(0xFFFF8A80)) }
                    // The owner's promotions on sale today (Christmas, Labour Day...), each with its own price and features.
                    offer.promos.filter { it.onSale() }.forEach { promo ->
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.tertiary.copy(alpha = 0.22f), RoundedCornerShape(12.dp))
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text("🎉 ${promo.name} · ${promo.price} for ${promo.length}", fontWeight = FontWeight.Bold)
                            if (promo.end.isNotBlank()) Text("On sale until ${promo.end}", style = MaterialTheme.typography.bodySmall)
                            Text(Subscription.describe(promo.features), style = MaterialTheme.typography.bodySmall)
                            OutlinedButton(onClick = { ask("${promo.name} promotion", promo.length, promo.price) }, modifier = Modifier.focusGlow()) {
                                Text("Ask for ${promo.name}")
                            }
                        }
                    }
                    // The Promo package itself is shown above as a promotion, not as a package for sale.
                    Plans.Tier.entries.filter { it != Plans.Tier.Promo }.forEach { tier ->
                        val prices = offer.prices[tier]
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .background(
                                    if (tier == current) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                                    else MaterialTheme.colorScheme.surfaceVariant,
                                    RoundedCornerShape(12.dp),
                                )
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(
                                tier.label + (prices?.let { " · ${it.month} a month" } ?: "") +
                                    if (tier == current) "  ✓ yours" else "",
                                fontWeight = FontWeight.Bold,
                            )
                            Text(Subscription.describe(tier), style = MaterialTheme.typography.bodySmall)
                            if (prices != null) {
                                // One choice: by the month (owner, 2026-10-07).
                                OutlinedButton(onClick = { ask("${tier.label} package", "1 month", prices.month) }, modifier = Modifier.focusGlow()) {
                                    Text("Get ${tier.label} · ${prices.month} a month")
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Close") }
            },
            dismissButton = {
                TextButton(onClick = onMessages, modifier = Modifier.focusGlow()) { Text("✉ Messages") }
            },
        )
    }
}

/**
 * Says when the package ends within 5 days, or has just ended, at most once a day, with buttons to
 * renew (the packages screen) or message the team. During the free trial (owner, 2026-10-08): on the
 * first start that it has begun, then once a day how many days are left ("6 days left" ... "last day").
 */
@Composable
fun PlanEndingNotice(onRenew: () -> Unit, onMessages: () -> Unit) {
    val context = LocalContext.current
    val status by Subscription.status.collectAsStateWithLifecycle()
    val offer by Subscription.offer.collectAsStateWithLifecycle()
    val prefs = remember { context.getSharedPreferences("subscription", android.content.Context.MODE_PRIVATE) }
    var dismissed by remember { mutableStateOf(false) }
    val s = status ?: return
    if (!offer.enforced || dismissed) return
    val now = System.currentTimeMillis()
    val day = 86_400_000L
    if (s.trial && s.until != null) {
        TrialNotice(s.until, prefs, onGold = onRenew, onDismissed = { dismissed = true })
        return
    }
    val text = when {
        s.until != null && s.until.time - now < 5 * day -> {
            val left = ((s.until.time - now + day - 1) / day).coerceAtLeast(0)
            val what = if (s.trial) "Your Gold trial" else "Your ${s.label} package"
            "$what ends on ${planDate(s.until)}" + when (left) {
                0L -> " (today)."
                1L -> " (tomorrow)."
                else -> ", in $left days."
            } + " Renew now to keep every mode and feature, or message us. The channels stay free."
        }
        s.endedTier != null && s.endedAt != null ->
            "Your ${s.endedTier.label} package ended on ${planDate(s.endedAt)}. You're on Free now: every channel, in 1+List. " +
                "Renew to get every mode and feature back, or message us."
        else -> return
    }
    // Once a day.
    val today = now / day
    if (prefs.getLong("warned_day", -1L) == today) return
    SettingsTheme {
        AlertDialog(
            onDismissRequest = { prefs.edit().putLong("warned_day", today).apply(); dismissed = true },
            title = { Text("⏰ Package ending") },
            text = { Text(text) },
            confirmButton = {
                TextButton(
                    onClick = { prefs.edit().putLong("warned_day", today).apply(); dismissed = true; onRenew() },
                    modifier = Modifier.focusGlow(),
                ) { Text("Renew") }
            },
            dismissButton = {
                Row {
                    TextButton(
                        onClick = { prefs.edit().putLong("warned_day", today).apply(); dismissed = true; onMessages() },
                        modifier = Modifier.focusGlow(),
                    ) { Text("✉ Message us") }
                    TextButton(
                        onClick = { prefs.edit().putLong("warned_day", today).apply(); dismissed = true },
                        modifier = Modifier.focusGlow(),
                    ) { Text("Later") }
                }
            },
        )
    }
}

/**
 * The Gold trial's daily line: "your 7-day Gold trial has started", then "N days left", once a day. The channels
 * are always free, so the trial is a trial of the features (owner, 2026-10-08).
 */
@Composable
private fun TrialNotice(until: Date, prefs: android.content.SharedPreferences, onGold: () -> Unit, onDismissed: () -> Unit) {
    val now = System.currentTimeMillis()
    val day = 86_400_000L
    // Days counted by the calendar on this device, so the number goes down by one each day.
    val zone = java.util.TimeZone.getDefault()
    fun localDay(ms: Long) = (ms + zone.getOffset(ms)) / day
    val today = localDay(now)
    if (prefs.getLong("trial_day", -1L) == today) return
    val left = (localDay(until.time) - today).coerceAtLeast(0)
    val trialDays = Subscription.offer.value.trialDays
    val first = !prefs.getBoolean("trial_started_shown", false)
    val title = if (first) "🎉 Your $trialDays-day Gold trial has started" else "⏳ Gold trial: " + when (left) {
        0L -> "last day"
        1L -> "1 day left"
        else -> "$left days left"
    }
    val text = (if (first) "Welcome to Cable TV! Every channel is free, always. For your first $trialDays days you also have Gold " +
        "free: every mode (Browse, 1+3, 2×2, News...), Movies & Dramas, Games, Iqra Quran, Weather and Themes. " else "") +
        "Your Gold trial ends on ${planDate(until)}" + when (left) {
            0L -> " (today)."
            1L -> " (tomorrow)."
            else -> ", in $left days."
        } + " After that you'll be on the Free package, every channel in 1+List, and we'll have a welcome gift for you."
    fun close() {
        prefs.edit().putLong("trial_day", today).putBoolean("trial_started_shown", true).apply()
        onDismissed()
    }
    SettingsTheme {
        AlertDialog(
            onDismissRequest = { close() },
            title = { Text(title) },
            text = { Text(text) },
            confirmButton = { TextButton(onClick = { close() }, modifier = Modifier.focusGlow()) { Text("OK") } },
            dismissButton = { TextButton(onClick = { close(); onGold() }, modifier = Modifier.focusGlow()) { Text("See packages") } },
        )
    }
}

/**
 * While Gold comes from a promo code (WELCOME and the like), a short line at the bottom every 30 minutes
 * says when it ends (owner, 2026-10-08), for about 12 seconds. It doesn't take the remote's focus.
 */
@Composable
fun CodeEndsReminder() {
    val status by Subscription.status.collectAsStateWithLifecycle()
    val s = status
    val until = s?.until
    val code = if (s != null && !s.trial) s.code else null
    val label = s?.label.orEmpty()
    var showing by remember { mutableStateOf(false) }
    LaunchedEffect(code, until) {
        showing = false
        if (code == null || until == null) return@LaunchedEffect
        kotlinx.coroutines.delay(60_000)
        while (until.after(Date())) {
            showing = true
            kotlinx.coroutines.delay(12_000)
            showing = false
            kotlinx.coroutines.delay(30 * 60_000L - 12_000)
        }
    }
    if (!showing || code == null || until == null) return
    androidx.compose.ui.window.Popup(
        alignment = androidx.compose.ui.Alignment.BottomCenter,
        properties = androidx.compose.ui.window.PopupProperties(focusable = false),
    ) {
        Text(
            "🎁 Your free $label (code $code) ends on ${planDate(until)}. Get Gold in Settings > Packages to keep every feature.",
            color = Color.White,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier
                .padding(bottom = 28.dp)
                .background(Color(0xE6000000), RoundedCornerShape(50))
                .padding(horizontal = 20.dp, vertical = 10.dp),
        )
    }
}
