package com.livetv.app.ui

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.webkit.WebChromeClient
import android.widget.Toast
import android.webkit.WebView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.livetv.app.data.YouTube
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Plays a YouTube video in YouTube's own player, as YouTube's terms require. TVs hand it to
 * the YouTube app (it handles the remote); phones and tablets play it in YouTube's embedded
 * player, with a button to open the YouTube app for videos their channel won't let others embed.
 */
@Composable
fun YouTubePlayer(videoId: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val tv = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK) }
    var embedded by remember(videoId) { mutableStateOf(!tv) }
    BackHandler(onBack = onBack)

    if (!embedded) {
        LaunchedEffect(videoId) {
            if (openYouTubeApp(context, videoId)) onBack() else embedded = true
        }
        Box(Modifier.fillMaxSize().background(Color.Black))
        return
    }

    var webView by remember { mutableStateOf<WebView?>(null) }
    DisposableEffect(videoId) {
        onDispose { webView?.destroy() }
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx -> embedView(ctx, "https://www.youtube.com/embed/$videoId?autoplay=1&playsinline=1&rel=0").also { webView = it } },
        )
        Button(
            onClick = { if (openYouTubeApp(context, videoId)) onBack() },
            modifier = Modifier.align(Alignment.TopEnd).padding(12.dp).focusGlow(),
        ) { Text("Open in YouTube") }
    }
}

/**
 * Plays what a YouTube channel is streaming live now (a Pakistani news channel's 24/7 stream):
 * finds the current live video, then plays it like any YouTube video. When the video can't be
 * found, YouTube's embedded player is asked for the channel's live stream instead.
 */
@Composable
fun YouTubeLivePlayer(channelId: String, onBack: () -> Unit) {
    var video by remember(channelId) { mutableStateOf<String?>(null) }
    var looked by remember(channelId) { mutableStateOf(false) }
    LaunchedEffect(channelId) {
        video = withContext(Dispatchers.IO) { YouTube.currentLiveVideo(channelId) }
        looked = true
    }
    val found = video
    when {
        found != null -> YouTubePlayer(found, onBack)
        looked -> EmbedPlayer("https://www.youtube.com/embed/live_stream?channel=$channelId&autoplay=1&playsinline=1", onBack)
        else -> {
            BackHandler(onBack = onBack)
            Box(Modifier.fillMaxSize().background(Color.Black)) {
                Text("Opening the live stream…", color = Color.White, modifier = Modifier.align(Alignment.Center))
            }
        }
    }
}

/**
 * Plays a video in its site's own embedded player (Dailymotion, Vimeo), on phones and TVs alike.
 * Back closes it.
 */
@Composable
fun EmbedPlayer(src: String, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    var webView by remember { mutableStateOf<WebView?>(null) }
    DisposableEffect(src) {
        onDispose { webView?.destroy() }
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx -> embedView(ctx, src).also { webView = it } },
        )
    }
}

@SuppressLint("SetJavaScriptEnabled")
private fun embedView(context: Context, src: String): WebView = WebView(context).apply {
    setBackgroundColor(android.graphics.Color.BLACK)
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.mediaPlaybackRequiresUserGesture = false
    webChromeClient = WebChromeClient()
    // Embedded players refuse pages with no origin, so the page is given our site's.
    val html = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style>
        </head><body><iframe src="$src"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe></body></html>
    """.trimIndent()
    loadDataWithBaseURL("https://tv.bulkbazaar.ca/", html, "text/html", "utf-8", null)
}

/** Opens the video in the YouTube app (the TV app first on TVs); false when there's none. */
private fun openYouTubeApp(context: Context, videoId: String): Boolean {
    val uri = Uri.parse(YouTube.watchUrl(videoId))
    for (pkg in listOf("com.google.android.youtube.tv", "com.google.android.youtube", null)) {
        try {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, uri).apply {
                    if (pkg != null) setPackage(pkg)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                },
            )
            return true
        } catch (_: ActivityNotFoundException) {
        }
    }
    return false
}

/** Hands a link to the app that plays it (Bilibili's own app); says so when it isn't installed. */
@Composable
fun OpenInApp(url: String, appName: String, onDone: () -> Unit) {
    val context = LocalContext.current
    LaunchedEffect(url) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(context, "Install the $appName app to watch this.", Toast.LENGTH_LONG).show()
        }
        onDone()
    }
}
