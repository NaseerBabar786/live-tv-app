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
                                tier.label + (prices?.let { " · ${it.month}/month" } ?: " · free") +
                                    if (tier == current) "  ✓ yours" else "",
                                fontWeight = FontWeight.Bold,
                            )
                            Text(Subscription.describe(tier), style = MaterialTheme.typography.bodySmall)
                            if (prices != null) {
                                // Shortest first, like tv.bulkbazaar.ca/packages (owner, 2026-10-06); the year is the best value.
                                val lengths = listOf(
                                    "1 month" to prices.month,
                                    "3 months" to prices.threeMonths,
                                    "6 months" to prices.sixMonths,
                                    "1 year" to prices.year,
                                )
                                lengths.chunked(2).forEach { pair ->
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        pair.forEach { (length, price) ->
                                            OutlinedButton(onClick = { ask("${tier.label} package", length, price) }, modifier = Modifier.focusGlow()) {
                                                Text("$length $price")
                                            }
                                        }
                                    }
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
 * Says when the package (or the free trial) ends within 5 days, or has just ended, at most once a
 * day, with buttons to renew (the packages screen) or message the team.
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
    val text = when {
        s.until != null && s.until.time - now < 5 * day -> {
            val left = ((s.until.time - now + day - 1) / day).coerceAtLeast(0)
            val what = if (s.trial) "Your free trial" else "Your ${s.label} package"
            "$what ends on ${planDate(s.until)}" + when (left) {
                0L -> " (today)."
                1L -> " (tomorrow)."
                else -> ", in $left days."
            } + " Renew now to keep watching with everything you have, or message us."
        }
        s.endedTier != null && s.endedAt != null ->
            "Your ${s.endedTier.label} package ended on ${planDate(s.endedAt)}. You're on Free now. " +
                "Renew to get everything back, or message us."
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
