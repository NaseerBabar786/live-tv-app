package com.livetv.app.ui

import com.livetv.app.data.YouTube
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
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.saveable.rememberSaveable
import com.livetv.app.BuildConfig
import androidx.compose.runtime.compositionLocalOf
import com.livetv.app.WebChannelActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Plays a Library video from YouTube inside NextGen Cable (1.9.99): our film page (docs/channel/film.html) with
 * YouTube's embedded player under our own pause, back and forward buttons, in its own plain window
 * (WebChannelActivity), where TVs show YouTube's picture. Until 1.9.94 TVs handed it to the YouTube app,
 * which kept the viewer there. Back (or the video's end) comes back here, to the Library. A video its owner
 * won't let others play just says so and comes back: nothing of ours ever opens YouTube (owner's rule
 * 2026-10-07: no YouTube screens anywhere in our app).
 */
@Composable
fun YouTubePlayer(videoId: String, title: String, onBack: () -> Unit, onEnded: () -> Unit = {}) {
    val context = LocalContext.current
    BackHandler(onBack = onBack)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == WebChannelActivity.RESULT_DONE) onEnded()
        if (result.resultCode == WebChannelActivity.RESULT_BLOCKED) {
            Toast.makeText(context, "This video can't play right now. Please pick another one.", Toast.LENGTH_LONG).show()
        }
        onBack()
    }
    // Once per video, also when this screen is rebuilt while it's open.
    var opened by rememberSaveable(videoId) { mutableStateOf(false) }
    LaunchedEffect(videoId) {
        if (!opened) {
            opened = true
            launcher.launch(WebChannelActivity.filmIntent(context, videoId, title, BuildConfig.VERSION_CODE))
        }
    }
    Box(Modifier.fillMaxSize().background(Color.Black))
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
                // Normal caching, so the player's scripts aren't downloaded again each time (1.10.24).
                settings.cacheMode = WebSettings.LOAD_DEFAULT
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        if (YouTube.blocksNavigation(request.url.scheme, request.url.host, request.isForMainFrame)) return true
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
 * How much of the screen's bottom edge the app's "advertise with us" band takes on this screen (0 where
 * there is none). A page shown inside it hides its own line (one ticker, never two on top of each other:
 * the owner's photo, 2026-10-08), and on a TV the page's window stays clear of the band.
 */
val LocalTickerBand = compositionLocalOf { 0.dp }

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
    // shows the playing video's own picture instead (1.9.60). [still] false: the moving video (every mode but
    // Browse, whose pictures scroll, since 1.9.84; 1+List since 1.9.79).
    val context = LocalContext.current
    val tv = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK) }
    val band = LocalTickerBand.current
    val page = remember(url, band) { (if (still && tv) "$url&still=1" else url) + if (band > 0.dp) "&noticker=1" else "" }
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
    // The WebView sits over everything in the window, so it stops above the app's ticker band.
    val band = with(LocalDensity.current) { LocalTickerBand.current.roundToPx() }
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
        val bottomLimit = if (band > 0) root.height - band else Int.MAX_VALUE
        val height = (minOf(b.height.toInt() - 2 * inset, bottomLimit - top)).coerceAtLeast(0)
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
        // Normal caching, so the player's scripts aren't downloaded again for every tile (1.10.24).
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (YouTube.blocksNavigation(request.url.scheme, request.url.host, request.isForMainFrame)) return true
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
