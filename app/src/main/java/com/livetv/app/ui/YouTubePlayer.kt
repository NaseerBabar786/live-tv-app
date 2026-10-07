package com.livetv.app.ui

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.graphics.Bitmap
import android.view.View
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.widget.FrameLayout
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
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.livetv.app.data.YouTube

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

/**
 * A channel that is a page of ours playing videos in their site's own player one after another
 * (Bazaar Hits: YouTube's embedded player). Full screen; the remote's arrows go to the page; Back closes it.
 * When the page can't play (YouTube refuses every video) it opens livetv://fallback and [onFallback] runs.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebChannel(url: String, onBack: () -> Unit, onFallback: (() -> Unit)? = null) {
    BackHandler(onBack = onBack)
    var webView by remember { mutableStateOf<WebView?>(null) }
    DisposableEffect(url) {
        onDispose { webView?.destroy() }
    }
    AndroidView(
        modifier = Modifier.fillMaxSize().background(Color.Black),
        factory = { ctx ->
            WebView(ctx).apply {
                // The video is drawn by the TV's own decoder in a hardware layer; a software layer or
                // a painted view background left it black with only the sound on a Chromecast (1.9.41).
                setLayerType(View.LAYER_TYPE_HARDWARE, null)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                // Always the newest page, not a copy the TV kept from an earlier version.
                settings.cacheMode = WebSettings.LOAD_NO_CACHE
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        if (request.url.scheme != "livetv") return false
                        if (request.url.host == "fallback") onFallback?.invoke()
                        return true
                    }

                    // A web page that runs out of memory (YouTube on a small TV) loses its renderer; unhandled,
                    // that closes the whole app (1.9.58).
                    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                        (view.parent as? ViewGroup)?.removeView(view)
                        view.destroy()
                        if (webView === view) webView = null
                        onFallback?.invoke()
                        return true
                    }
                }
                webChromeClient = object : WebChromeClient() {
                    // No grey placeholder picture over the video while it starts.
                    override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
                }
                isFocusable = true
                loadUrl(url)
                requestFocus()
            }.also { webView = it }
        },
    )
}

/**
 * [url] (one of our YouTube pages) playing inside a small player, such as the 1+List picture, without
 * taking the remote: the arrows and OK stay with the screen around it. [onFallback] runs when the page
 * gives up on YouTube (livetv://fallback).
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebPreview(url: String, modifier: Modifier = Modifier, still: Boolean = true, onFallback: (() -> Unit)? = null) {
    var webView by remember { mutableStateOf<WebView?>(null) }
    // TVs play the sound here but leave YouTube's picture black (full screen is fine), so on a TV the page
    // shows the playing video's own picture instead (1.9.60). [still] false: the moving video (1+List).
    val context = LocalContext.current
    val tv = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK) }
    val page = remember(url) { if (still && tv) "$url&still=1" else url }
    // The moving video on a TV: the page goes in a plain WebView straight in the window, over this box,
    // like full screen (WebChannelActivity), where TVs do show the picture. Inside Compose they don't,
    // even in a square box (1.9.74 test) (1.9.78).
    val activity = remember { context.findActivity() }
    if (!still && tv && activity != null) {
        WindowWebPreview(activity, page, modifier, onFallback)
        return
    }
    DisposableEffect(Unit) {
        onDispose { webView?.destroy() }
    }
    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            previewWebView(ctx, page, onFallback) { if (webView === it) webView = null }.also { webView = it }
        },
    )
}

/** [page] in a plain WebView added to [activity]'s window and kept over the place [modifier] takes. */
@Composable
private fun WindowWebPreview(activity: Activity, page: String, modifier: Modifier, onFallback: (() -> Unit)?) {
    val root = remember { activity.findViewById<FrameLayout>(android.R.id.content) }
    // The box's focus border (3 dp) stays in view around it.
    val inset = with(LocalDensity.current) { 3.dp.roundToPx() }
    val view = remember(page) { previewWebView(activity, page, onFallback) {} }
    DisposableEffect(view) {
        root.addView(view, FrameLayout.LayoutParams(0, 0))
        onDispose {
            root.removeView(view)
            view.destroy()
        }
    }
    Box(modifier.onGloballyPositioned { c ->
        val b = c.boundsInWindow()
        val at = IntArray(2).also { root.getLocationInWindow(it) }
        val lp = view.layoutParams as? FrameLayout.LayoutParams ?: return@onGloballyPositioned
        val left = b.left.toInt() - at[0] + inset
        val top = b.top.toInt() - at[1] + inset
        val width = (b.width.toInt() - 2 * inset).coerceAtLeast(0)
        val height = (b.height.toInt() - 2 * inset).coerceAtLeast(0)
        if (lp.leftMargin != left || lp.topMargin != top || lp.width != width || lp.height != height) {
            lp.leftMargin = left
            lp.topMargin = top
            lp.width = width
            lp.height = height
            view.layoutParams = lp
        }
    })
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@SuppressLint("SetJavaScriptEnabled")
private fun previewWebView(ctx: Context, page: String, onFallback: (() -> Unit)?, onGone: (WebView) -> Unit): WebView =
    WebView(ctx).apply {
        // See-through, so the TV's video under the window shows through the page's hole (see WebChannelActivity).
        setBackgroundColor(android.graphics.Color.TRANSPARENT)
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.cacheMode = WebSettings.LOAD_NO_CACHE
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.scheme != "livetv") return false
                if (request.url.host == "fallback") onFallback?.invoke()
                return true
            }

            // A web page that runs out of memory (YouTube on a small TV) loses its renderer; unhandled,
            // that closes the whole app (1.9.58).
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
                onGone(view)
                onFallback?.invoke()
                return true
            }
        }
        webChromeClient = object : WebChromeClient() {
            override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        }
        isFocusable = false
        isFocusableInTouchMode = false
        // Taps go to the player box around it (OK opens the channel full screen).
        setOnTouchListener { _, _ -> true }
        loadUrl(page)
    }

@SuppressLint("SetJavaScriptEnabled")
private fun embedView(context: Context, src: String): WebView = WebView(context).apply {
    setBackgroundColor(android.graphics.Color.BLACK)
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.mediaPlaybackRequiresUserGesture = false
    webChromeClient = WebChromeClient()
    webViewClient = object : WebViewClient() {
        // Its renderer running out of memory must not close the whole app (1.9.58).
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            (view.parent as? ViewGroup)?.removeView(view)
            view.destroy()
            return true
        }
    }
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
