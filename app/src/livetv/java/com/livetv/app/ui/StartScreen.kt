package com.livetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/** How long the start screen may wait for the channels before opening anyway. */
private const val MAX_WAIT_MS = 15_000L

/**
 * Shown when the app starts, while the channels load: only a loading circle in the middle
 * (owner, 2026-10-07: no sponsor or words on the start screen). It closes as soon as the
 * channels are in, or after [MAX_WAIT_MS] at most.
 */
@Composable
fun StartScreen(loading: Boolean, onDone: () -> Unit) {
    val stillLoading by rememberUpdatedState(loading)
    // No web-engine warm-up here (removed after test 1.11.0 test 62 closed on the owner's TV at start):
    // a background WebView with no render-process guard takes the whole app down with it when the TV
    // runs short of memory, before CrashGuard can report or offer Go back. Our channels' own pages
    // still cache the player code (WebChannelActivity, LOAD_DEFAULT).
    LaunchedEffect(Unit) {
        withTimeoutOrNull(MAX_WAIT_MS) { snapshotFlow { stillLoading }.first { !it } }
        onDone()
    }
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
    ) {
        CircularProgressIndicator(color = FocusColor, strokeWidth = 4.dp, modifier = Modifier.size(48.dp))
    }
}
