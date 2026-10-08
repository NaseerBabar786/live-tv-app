package com.livetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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
    // While the circle turns, the TV's web engine starts up and fetches the video player's code once,
    // so our own channels (1-15, web pages) open quickly afterwards instead of starting it all
    // from scratch (owner, 1.10.24: our channels were slow at startup). Nothing shows or plays.
    val context = LocalContext.current
    DisposableEffect(Unit) {
        val warm = runCatching {
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.cacheMode = WebSettings.LOAD_DEFAULT
                loadDataWithBaseURL(
                    "https://tv.bulkbazaar.ca/channel/",
                    "<html><head><link rel=\"preconnect\" href=\"https://www.youtube.com\">" +
                        "<link rel=\"preconnect\" href=\"https://i.ytimg.com\">" +
                        "<script src=\"https://www.youtube.com/iframe_api\"></script>" +
                        "<script src=\"keepplaying.js\"></script><script type=\"module\" src=\"ytorder.js\"></script>" +
                        "</head><body></body></html>",
                    "text/html", "utf-8", null,
                )
            }
        }.getOrNull()
        onDispose { warm?.run { stopLoading(); destroy() } }
    }
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
