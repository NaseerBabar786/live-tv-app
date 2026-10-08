package com.livetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.livetv.app.account.Account
import com.livetv.app.account.Subscription
import com.livetv.app.account.Welcome
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Uses the WELCOME promo code in one press. [using] while it's being saved; [result] is what to
 * tell the viewer afterwards (starts with "Done" when it worked).
 */
private class WelcomeUse {
    var using by mutableStateOf(false)
    var result by mutableStateOf<String?>(null)
}

@Composable
private fun rememberWelcomeUse(): Pair<WelcomeUse, () -> Unit> {
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val scope = rememberCoroutineScope()
    val use = remember { WelcomeUse() }
    return use to {
        if (!use.using) scope.launch {
            use.using = true
            use.result = try {
                Subscription.redeem(context, account, Welcome.CODE)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                "Couldn't use the code: ${e.message ?: "check the internet connection"}"
            }
            use.using = false
        }
    }
}

/** The invitation as it pops up: Use code WELCOME, or Later (it stays in Messages). */
@Composable
fun WelcomeDialog(onDismiss: () -> Unit) {
    val (use, press) = rememberWelcomeUse()
    SettingsTheme {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text(Welcome.TITLE) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(Welcome.TEXT)
                    use.result?.let { Text(it, fontWeight = FontWeight.Bold, color = AccentBlue) }
                }
            },
            confirmButton = {
                if (use.result?.startsWith("Done") == true) {
                    TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("OK") }
                } else {
                    TextButton(onClick = press, enabled = !use.using, modifier = Modifier.focusGlow()) {
                        Text(if (use.using) "Please wait…" else "Use code ${Welcome.CODE}")
                    }
                }
            },
            dismissButton = {
                if (use.result?.startsWith("Done") != true) {
                    TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Later") }
                }
            },
        )
    }
}

/** The invitation at the top of a viewer's Messages, from the Cable TV team, with the button while the code still works. */
@Composable
fun WelcomeCard(state: Welcome.State) {
    val (use, press) = rememberWelcomeUse()
    val ink = MaterialTheme.colorScheme.onSurfaceVariant
    Box(Modifier.fillMaxWidth()) {
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .align(Alignment.CenterStart)
                .widthIn(max = 620.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(16.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            Text("Cable TV team", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall, color = ink)
            Text(Welcome.TITLE, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = ink)
            Text(Welcome.TEXT, style = MaterialTheme.typography.bodyLarge, color = ink)
            use.result?.let { Text(it, fontWeight = FontWeight.Bold, color = AccentBlue) }
            if (state.canUse && use.result?.startsWith("Done") != true) {
                Row {
                    Button(onClick = press, enabled = !use.using, modifier = Modifier.focusGlow()) {
                        Text(if (use.using) "Please wait…" else "🎁 Use code ${Welcome.CODE}")
                    }
                }
            }
        }
    }
}
