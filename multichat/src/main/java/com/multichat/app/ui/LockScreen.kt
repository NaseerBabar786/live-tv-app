package com.multichat.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.multichat.app.R
import com.multichat.app.data.Lock
import kotlinx.coroutines.delay

/** Covers everything until the PIN or a fingerprint unlocks Multi Chat. */
@Composable
fun LockScreen(fingerprint: Boolean, onFingerprint: () -> Unit) {
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var wrong by remember { mutableIntStateOf(0) }
    var blockedUntil by remember { mutableLongStateOf(0L) }
    val focus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        if (fingerprint) onFingerprint() else runCatching { focus.requestFocus() }
    }
    BackHandler { /* stays locked */ }

    fun submit() {
        val now = System.currentTimeMillis()
        if (now < blockedUntil) {
            error = "Too many tries. Wait ${(blockedUntil - now) / 1000 + 1} seconds."
            return
        }
        if (Lock.tryPin(pin)) return
        pin = ""
        wrong++
        if (wrong >= 5) {
            wrong = 0
            blockedUntil = now + 30_000
            error = "Too many tries. Wait 30 seconds."
        } else {
            error = "Wrong PIN. Try again."
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Bg)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
            .systemBarsPadding()
            .imePadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Image(
            painter = painterResource(R.drawable.ic_launcher_foreground),
            contentDescription = null,
            modifier = Modifier.size(84.dp).clip(RoundedCornerShape(22.dp)).background(Color(0xFF0F7A6E)),
        )
        Spacer(Modifier.height(14.dp))
        Text("Multi Chat is locked", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = Ink)
        Spacer(Modifier.height(18.dp))
        OutlinedTextField(
            value = pin,
            onValueChange = { v -> pin = v.filter { it.isDigit() }.take(8); error = "" },
            label = { Text("PIN") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { submit() }),
            modifier = Modifier.width(220.dp).focusRequester(focus),
        )
        Text(error, color = Danger, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
        Spacer(Modifier.height(8.dp))
        Button(onClick = { submit() }, enabled = pin.length >= 4) { Text("Unlock") }
        if (fingerprint) {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onFingerprint) {
                Icon(Icons.Filled.Fingerprint, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Use fingerprint")
            }
        }
    }

    LaunchedEffect(blockedUntil) {
        if (blockedUntil > 0) {
            delay(30_000)
            error = ""
        }
    }
}
