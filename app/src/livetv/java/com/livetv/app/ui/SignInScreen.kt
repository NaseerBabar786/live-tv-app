package com.livetv.app.ui

import android.content.Context
import android.content.ContextWrapper
import android.app.Activity
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.livetv.app.R
import com.livetv.app.account.Account
import com.livetv.app.account.DeviceAccountSignIn
import com.livetv.app.account.TvCode
import com.livetv.app.account.TvSignIn
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Live TV asks everyone to sign in with Google once. TVs show a code to approve at
 * google.com/device on a phone (and can try the TV's own Google account); phones use the
 * account picker.
 */
@Composable
fun SignInScreen(onSignedIn: () -> Unit) {
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val isTv = remember { context.packageManager.hasSystemFeature("android.software.leanback") }
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val notice by account.notice.collectAsState()

    fun finish(googleIdToken: String) {
        scope.launch {
            busy = true
            try {
                account.signInWithGoogleIdToken(googleIdToken)
                onSignedIn()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = "Couldn't sign in: ${e.message ?: "check the internet connection"}"
            } finally {
                busy = false
            }
        }
    }

    fun useDeviceAccount() {
        scope.launch {
            error = null
            try {
                finish(DeviceAccountSignIn.idToken(context.findActivity() ?: context))
            } catch (e: CancellationException) {
                throw e
            } catch (e: GetCredentialCancellationException) {
                // Closed the account picker: stay on this screen.
            } catch (e: Exception) {
                error = if (isTv) {
                    "This TV can't sign in with its own account. Use the code instead."
                } else {
                    "Couldn't sign in: ${e.message ?: "no Google account on this phone"}"
                }
            }
        }
    }

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.widthIn(max = 760.dp).verticalScroll(rememberScrollState()),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Image(painterResource(R.drawable.ic_launcher_foreground), contentDescription = null, modifier = Modifier.size(56.dp))
                Text("Welcome to Live TV", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground)
            }
            Text(
                "Sign in with your Google account to start watching. It's free, and you only do it once.",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onBackground,
            )
            notice?.let {
                Text(it, color = FocusColor, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge)
            }
            if (isTv) {
                TvCodePanel(onToken = ::finish, onError = { error = it }, busy = busy)
                OutlinedButton(onClick = ::useDeviceAccount, enabled = !busy, modifier = Modifier.focusGlow()) {
                    Text("Or use this TV's Google account")
                }
            } else {
                val focus = remember { FocusRequester() }
                Button(
                    onClick = ::useDeviceAccount,
                    enabled = !busy,
                    modifier = Modifier.focusRequester(focus).focusGlow(),
                ) { Text("Sign in with Google", fontSize = 18.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) }
                LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
            }
            if (busy) CircularProgressIndicator()
            error?.let {
                Text(it, color = Color(0xFFFF8A80), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
            }
            Text(
                "A free account works on one device at a time. We keep your name and email so we know who uses " +
                    "Live TV and can let you post in Suggestions. " +
                    "Privacy policy: tv.bulkbazaar.ca/privacy",
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
            )
        }
    }
}

/** The code to approve on a phone, with a QR code for the web address. Gets a new code when one runs out. */
@Composable
private fun TvCodePanel(onToken: (String) -> Unit, onError: (String?) -> Unit, busy: Boolean) {
    var code by remember { mutableStateOf<TvCode?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    LaunchedEffect(attempt) {
        code = null
        loading = true
        try {
            val c = TvSignIn.start()
            code = c
            loading = false
            onError(null)
            onToken(TvSignIn.await(c))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            onError(e.message ?: "Couldn't get a sign-in code. Check the internet connection.")
            code = null
            loading = false
        }
    }
    Row(
        horizontalArrangement = Arrangement.spacedBy(24.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(16.dp))
            .padding(20.dp),
    ) {
        Image(
            painterResource(R.drawable.google_device_qr),
            contentDescription = "QR code for google.com/device",
            modifier = Modifier.size(150.dp),
        )
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("1. On your phone, go to", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("google.com/device", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("   or scan the code with the camera.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("2. Enter this code:", color = MaterialTheme.colorScheme.onSurfaceVariant)
            val c = code
            if (c != null) {
                Text(c.userCode, fontSize = 36.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace,
                    color = FocusColor)
                Text("3. Pick your Google account and press Continue. The TV carries on by itself.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else if (loading) {
                Text("Getting a code…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                OutlinedButton(onClick = { attempt++ }, enabled = !busy, modifier = Modifier.focusGlow()) { Text("Get a code") }
            }
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
