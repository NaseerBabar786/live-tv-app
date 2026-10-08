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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
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
 * Cable TV asks everyone to sign in once: with an email and password account they make here
 * (any email, no confirmation email), or with Google. For Google, TVs show a code to approve at
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
    var withGoogle by remember { mutableStateOf(false) }

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
                Text("Welcome to Cable TV", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground)
            }
            Text(
                "Sign in to start watching. It's free, and you only do it once.",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onBackground,
            )
            notice?.let {
                Text(it, color = FocusColor, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ChoiceButton("Email and password", selected = !withGoogle, enabled = !busy) { withGoogle = false; error = null }
                ChoiceButton("Google account", selected = withGoogle, enabled = !busy) { withGoogle = true; error = null }
            }
            if (!withGoogle) {
                EmailSignIn(
                    busy = busy,
                    onBusy = { busy = it },
                    onError = { error = it },
                    onSignedIn = onSignedIn,
                )
            } else if (isTv) {
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
                    "Cable TV and can let you post in Suggestions. Your password is stored scrambled: nobody can read it. " +
                    "Forgot it? Message us on WhatsApp at 437 602 6500 and we'll set a new one for you. " +
                    "Privacy policy: tv.bulkbazaar.ca/privacy",
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
            )
        }
    }
}

@Composable
private fun ChoiceButton(label: String, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    if (selected) {
        AccentButton(onClick = onClick, enabled = enabled, modifier = Modifier.focusGlow()) { Text("✓ $label") }
    } else {
        OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.focusGlow()) { Text(label) }
    }
}

/**
 * Sign in or create an account with any email and a password of 6 or more characters. "Show
 * password" lets the viewer see what they typed; "Forgot password" sends Firebase's reset email.
 */
@Composable
private fun EmailSignIn(busy: Boolean, onBusy: (Boolean) -> Unit, onError: (String?) -> Unit, onSignedIn: () -> Unit) {
    val context = LocalContext.current
    val account = remember { Account.get(context) }
    val scope = rememberCoroutineScope()
    var creating by rememberSaveable { mutableStateOf(false) }
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var info by remember { mutableStateOf<String?>(null) }
    val ready = email.contains('@') && password.length >= 6 && (!creating || name.isNotBlank())

    fun go() {
        if (!ready || busy) return
        scope.launch {
            onBusy(true); onError(null); info = null
            try {
                if (creating) account.signUpWithEmail(name, email, password) else account.signInWithEmail(email, password)
                onSignedIn()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onError(e.message ?: "Couldn't sign in. Check the internet connection.")
            } finally {
                onBusy(false)
            }
        }
    }

    fun forgot() {
        if (!email.contains('@')) { onError("Type your email first, then press Forgot password."); return }
        scope.launch {
            onBusy(true); onError(null); info = null
            try {
                account.sendPasswordReset(email)
                info = "We sent a link to $email to make a new password. No email? Message us on WhatsApp at " +
                    "437 602 6500 and we'll set a new password for you."
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onError((e.message ?: "Couldn't send the email.") + " You can also message us on WhatsApp at 437 602 6500.")
            } finally {
                onBusy(false)
            }
        }
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .widthIn(max = 520.dp)
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(16.dp))
            .padding(20.dp),
    ) {
        Text(
            if (creating) "Create your free account" else "Sign in",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (creating) {
            OutlinedTextField(
                value = name, onValueChange = { name = it }, singleLine = true,
                label = { Text("Your name") },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth().remoteTextField(),
            )
        }
        OutlinedTextField(
            value = email, onValueChange = { email = it.trim() }, singleLine = true,
            label = { Text("Email") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth().remoteTextField(),
        )
        OutlinedTextField(
            value = password, onValueChange = { password = it }, singleLine = true,
            label = { Text(if (creating) "Make a password (6 or more characters)" else "Password") },
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { go() }),
            modifier = Modifier.fillMaxWidth().remoteTextField(),
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { showPassword = !showPassword }, modifier = Modifier.focusGlow()) {
                Text(if (showPassword) "🙈 Hide password" else "👁 Show password")
            }
            if (!creating) {
                TextButton(onClick = ::forgot, enabled = !busy, modifier = Modifier.focusGlow()) { Text("Forgot password?") }
            }
        }
        AccentButton(onClick = ::go, enabled = ready && !busy, modifier = Modifier.fillMaxWidth().focusGlow()) {
            Text(if (creating) "Create account" else "Sign in", fontSize = 18.sp)
        }
        TextButton(
            onClick = { creating = !creating; onError(null); info = null },
            enabled = !busy,
            modifier = Modifier.focusGlow(),
        ) { Text(if (creating) "Already have an account? Sign in" else "New here? Create a free account") }
        info?.let {
            Text(it, color = FocusColor, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
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
