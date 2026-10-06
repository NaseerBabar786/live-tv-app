package com.claudenotes.app.ui

import android.widget.Toast
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.claudenotes.app.data.OwnerTest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Owner only: installs the newest test build from inside the app, so the owner can try it before anyone
 * else gets it. If it closes by itself, the next start offers the last good version and the crash report
 * is sent. Everyone else never sees this button.
 */
@Composable
fun TestVersionButton(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val owner by produceState(false) { value = withContext(Dispatchers.IO) { OwnerTest.isOwner(context) } }
    if (!owner) return
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }
    OutlinedButton(
        onClick = {
            if (busy != null) return@OutlinedButton
            busy = "Checking…"
            scope.launch {
                val message = OwnerTest.tryNewest(context) { p -> busy = "Downloading ${(p * 100).toInt()}%" }
                busy = null
                Toast.makeText(context, message, Toast.LENGTH_LONG).show()
            }
        },
        modifier = modifier,
    ) { Text(busy ?: "Try test version") }
}
