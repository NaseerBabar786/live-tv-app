package com.livetv.app.ui

import android.app.Activity
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import kotlin.math.abs

/*
 * Phones and tablets (1.9.90): Cable TV is one app for TVs and phones, so every mode built for the
 * remote also works with the finger. A tap does what OK does on the highlighted item, a long press
 * what holding OK does, and a swipe what the arrow keys do. Every new mode or layout gets the same.
 */

/** True on a TV (Android TV / Google TV), false on phones and tablets. */
fun isTv(context: Context): Boolean =
    context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)

/** True on a phone or tablet: a touch screen and no TV launcher. */
@Composable
fun rememberIsPhone(): Boolean {
    val context = LocalContext.current
    return remember { !isTv(context) }
}

/**
 * A tap (and long press) with no ripple over the picture, for tiles and players that a remote
 * highlights with its own yellow frame.
 */
@OptIn(ExperimentalFoundationApi::class)
fun Modifier.tap(onLongPress: (() -> Unit)? = null, onTap: () -> Unit): Modifier = composed {
    combinedClickable(
        interactionSource = remember { MutableInteractionSource() },
        indication = null,
        onLongClick = onLongPress,
        onClick = onTap,
    )
}

/**
 * Swipes on the finger: [onSwipe] gets the direction like the arrow key it stands for: a swipe up
 * (the finger moves up) is [Swipe.Up]. Short moves (under 48 dp) are ignored, so taps still work.
 */
fun Modifier.swipe(onSwipe: (Swipe) -> Unit): Modifier = composed {
    val current by rememberUpdatedState(onSwipe)
    val min = with(LocalDensity.current) { 48.dp.toPx() }
    pointerInput(Unit) {
        var dx = 0f
        var dy = 0f
        detectDragGestures(
            onDragStart = { dx = 0f; dy = 0f },
            onDrag = { change, amount ->
                change.consume()
                dx += amount.x
                dy += amount.y
            },
            onDragEnd = {
                when {
                    abs(dy) >= abs(dx) && abs(dy) >= min -> current(if (dy < 0) Swipe.Up else Swipe.Down)
                    abs(dx) > abs(dy) && abs(dx) >= min -> current(if (dx < 0) Swipe.Left else Swipe.Right)
                }
            },
        )
    }
}

enum class Swipe { Up, Down, Left, Right }

/**
 * On phones, keeps the screen sideways while this is on screen (full-screen channels and the
 * multi-channel modes, which are drawn for a wide screen). TVs are untouched.
 */
@Composable
fun LandscapeOnPhone(on: Boolean = true) {
    val context = LocalContext.current
    val activity = context as? Activity ?: return
    if (isTv(context)) return
    DisposableEffect(on) {
        if (!on) return@DisposableEffect onDispose { }
        val before = activity.requestedOrientation
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        onDispose { activity.requestedOrientation = before }
    }
}
