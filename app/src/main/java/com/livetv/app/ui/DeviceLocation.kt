package com.livetv.app.ui

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import com.livetv.app.Edition
import com.livetv.app.data.Location
import kotlinx.coroutines.launch

/**
 * Reads the device's location for the weather and prayer times each time it's shown, and asks
 * for permission the first time (once only, and not when a city was typed in Settings).
 */
@Composable
fun DeviceLocation(ask: Boolean = true) {
    if (!Edition.HAS_DEVICE_LOCATION) return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) scope.launch { Location.refreshDevice(context) }
    }
    LaunchedEffect(Unit) {
        when {
            Location.hasPermission(context) -> Location.refreshDevice(context)
            ask && !Location.asked() && Location.manual.value == null -> {
                Location.markAsked()
                runCatching { launcher.launch(Manifest.permission.ACCESS_COARSE_LOCATION) }
            }
        }
    }
}
