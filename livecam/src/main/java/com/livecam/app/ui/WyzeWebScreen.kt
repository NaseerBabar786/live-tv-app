package com.livecam.app.ui

import android.annotation.SuppressLint
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.UserAgentMetadata
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Wyze's own browser live view (moved from view.wyze.com to my.wyze.com in 2026).
 * Signing in here uses the same account as the Wyze app.
 */
const val WYZE_WEB_VIEW_URL = "https://my.wyze.com/live"

/**
 * Wyze cameras have no public stream API, so Live Cam shows Wyze Web View, Wyze's official
 * browser viewer, inside the app. The sign-in is kept in the WebView's cookies, so it is
 * only needed once per device. Which cameras play live depends on the Wyze plan
 * (free accounts get one camera per month, Cam Plus each licensed camera).
 * On a TV the arrow keys move a pointer over the page and OK clicks (see [CursorWebView]).
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WyzeWebScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    var progress by remember { mutableIntStateOf(0) }
    // One-line diagnostics under the title: which Wyze page is open and the last problem it reported.
    var pageUrl by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf<String?>(null) }
    // What the page actually drew, e.g. "0 words, 12 elements", to tell a blank page from a slow one.
    var pageInfo by remember { mutableStateOf<String?>(null) }
    val reloadFocus = remember { FocusRequester() }
    val webViewVersion = remember { runCatching { WebView.getCurrentWebViewPackage()?.versionName }.getOrNull() ?: "?" }
    val webView = remember {
        CursorWebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            // Wyze Web View is built for desktop browsers; ask for that layout and scale it to fit.
            settings.userAgentString = DESKTOP_USER_AGENT
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            settings.builtInZoomControls = true
            settings.displayZoomControls = false
            presentAsDesktop(this)
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            webViewClient = object : WebViewClient() {
                override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                    pageUrl = url.orEmpty()
                    if (!isReload) problem = null
                    pageInfo = null
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    view.postDelayed({
                        view.evaluateJavascript(PAGE_INFO_JS) { result ->
                            pageInfo = result?.trim('"')?.takeIf { it.isNotBlank() && it != "null" }
                        }
                    }, 5_000)
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) problem = "Page error: ${error.description}"
                }

                override fun onReceivedHttpError(
                    view: WebView,
                    request: WebResourceRequest,
                    response: WebResourceResponse,
                ) {
                    val url = request.url.toString()
                    if (request.isForMainFrame || "wyze" in url) {
                        problem = "HTTP ${response.statusCode}: ${url.substringBefore('?').takeLast(80)}"
                    }
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView, newProgress: Int) {
                    progress = newProgress
                }

                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    when (message.messageLevel()) {
                        ConsoleMessage.MessageLevel.ERROR ->
                            problem = "Page script error: ${message.message().take(160)}"
                        ConsoleMessage.MessageLevel.WARNING ->
                            if (problem == null) problem = "Page warning: ${message.message().take(160)}"
                        else -> Unit
                    }
                    return false
                }

                override fun onPermissionRequest(request: PermissionRequest) {
                    problem = "Page asked for: ${request.resources.joinToString()}"
                    request.deny()
                }
            }
            loadUrl(WYZE_WEB_VIEW_URL)
        }
    }
    // Up at the top of the page moves to the Reload button; Down from the top bar goes back in.
    webView.onExitTop = { runCatching { reloadFocus.requestFocus() } }
    val backIntoPage = Modifier.onPreviewKeyEvent { e ->
        if (e.key == Key.DirectionDown && e.type == KeyEventType.KeyDown) {
            webView.requestFocus()
            true
        } else {
            false
        }
    }

    DisposableEffect(webView) {
        onDispose {
            CookieManager.getInstance().flush()
            webView.destroy()
        }
    }

    // Back steps through Wyze's pages first, then leaves.
    BackHandler {
        if (webView.canGoBack()) webView.goBack() else onBack()
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .safeDrawingPadding()
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .then(backIntoPage)
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack, modifier = Modifier.focusRing(CircleShape)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            Spacer(Modifier.width(6.dp))
            Column(Modifier.weight(1f)) {
                Text("Wyze cameras", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    listOfNotNull(
                        pageUrl.removePrefix("https://").substringBefore('?').ifEmpty { null },
                        pageInfo,
                        problem,
                        "WebView $webViewVersion",
                    ).joinToString("  ·  "),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (problem != null) LiveRed else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            IconButton(
                onClick = { webView.loadUrl(WYZE_WEB_VIEW_URL) },
                modifier = Modifier.focusRing(CircleShape),
            ) {
                Icon(Icons.Default.Videocam, contentDescription = "Live view")
            }
            IconButton(
                onClick = { webView.reload() },
                modifier = Modifier.focusRequester(reloadFocus).focusRing(CircleShape),
            ) {
                Icon(Icons.Default.Refresh, contentDescription = "Reload")
            }
        }
        if (progress in 1..99) {
            LinearProgressIndicator(progress = { progress / 100f }, modifier = Modifier.fillMaxWidth())
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            AndroidView(factory = { webView }, modifier = Modifier.fillMaxSize())
        }
    }
}

/**
 * Wyze's site is made for desktop browsers. Besides the user agent string, Chrome also reports
 * "Android, mobile" through client hints and touch support, so make those look like a desktop too.
 */
private fun presentAsDesktop(webView: WebView) {
    if (WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) {
        runCatching {
            val brands = listOf(
                UserAgentMetadata.BrandVersion.Builder()
                    .setBrand("Google Chrome").setMajorVersion("139").setFullVersion("139.0.0.0").build(),
                UserAgentMetadata.BrandVersion.Builder()
                    .setBrand("Chromium").setMajorVersion("139").setFullVersion("139.0.0.0").build(),
                UserAgentMetadata.BrandVersion.Builder()
                    .setBrand("Not;A=Brand").setMajorVersion("99").setFullVersion("99.0.0.0").build(),
            )
            WebSettingsCompat.setUserAgentMetadata(
                webView.settings,
                UserAgentMetadata.Builder()
                    .setBrandVersionList(brands)
                    .setFullVersion("139.0.0.0")
                    .setPlatform("Linux")
                    .setPlatformVersion("6.0.0")
                    .setArchitecture("x86")
                    .setBitness(64)
                    .setMobile(false)
                    .setModel("")
                    .build(),
            )
        }
    }
    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
        runCatching { WebViewCompat.addDocumentStartJavaScript(webView, DESKTOP_JS, setOf("*")) }
    }
}

private const val DESKTOP_JS = """
(function () {
  try {
    Object.defineProperty(Navigator.prototype, 'platform', { get: function () { return 'Linux x86_64'; } });
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: function () { return 0; } });
  } catch (e) {}
})();
"""

private const val PAGE_INFO_JS = """
(function () {
  var b = document.body;
  if (!b) return 'no page body';
  var words = (b.innerText || '').split(/\s+/).filter(Boolean).length;
  return words + ' words, ' + document.getElementsByTagName('*').length + ' elements, ' + window.innerWidth + 'px wide';
})()
"""

private const val DESKTOP_USER_AGENT =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
