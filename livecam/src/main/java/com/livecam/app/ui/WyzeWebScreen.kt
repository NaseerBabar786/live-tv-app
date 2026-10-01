package com.livecam.app.ui

import android.annotation.SuppressLint
import android.view.ViewGroup
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
import androidx.compose.material.icons.filled.Mouse
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
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
import kotlinx.coroutines.delay
import org.json.JSONArray

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
    var pointerMode by remember { mutableStateOf(false) }
    var navInfo by remember { mutableStateOf<String?>(null) }
    val reloadFocus = remember { FocusRequester() }
    val webViewVersion = remember { runCatching { WebView.getCurrentWebViewPackage()?.versionName }.getOrNull() ?: "?" }
    val webView = remember {
        CursorWebView(context).apply {
            // AndroidView otherwise gives the WebView wrap_content height, and then the page sees a
            // zero-height window: Wyze's layout (sized to 100vh) collapses and nothing is drawn.
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
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
                    // Save the Wyze sign-in to disk now, not only when the screen closes: an app
                    // update or the TV closing the app would otherwise lose it.
                    CookieManager.getInstance().flush()
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    CookieManager.getInstance().flush()
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
                    // Wyze's ad and analytics tags fail harmlessly; don't report them.
                    val text = message.message()
                    if (THIRD_PARTY.any { it in text } || THIRD_PARTY.any { it in message.sourceId().orEmpty() }) return false
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
    // Wyze's site changes pages without reloading, so re-read what the page shows every few seconds.
    LaunchedEffect(webView) {
        while (true) {
            delay(4_000)
            webView.evaluateJavascript(PAGE_INFO_JS) { result ->
                pageInfo = runCatching { JSONArray("[$result]").optString(0) }.getOrNull()
                    ?.takeIf { it.isNotBlank() && it != "null" }
            }
        }
    }
    // Wyze puts the chosen cameras in one row that runs off the right edge; keep them in a grid.
    LaunchedEffect(webView) {
        while (true) {
            delay(1_500)
            webView.evaluateJavascript(GRID_JS, null)
        }
    }
    // Up at the top of the page moves to the Reload button; Down from the top bar goes back in.
    webView.onNavResult = { navInfo = it }
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
                        navInfo,
                        pageInfo,
                        problem,
                        "WebView $webViewVersion",
                    ).joinToString("  ·  "),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (problem != null) LiveRed else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            // Arrow keys either jump between buttons (default) or move a free pointer.
            IconButton(
                onClick = {
                    pointerMode = !pointerMode
                    webView.pointerMode = pointerMode
                },
                modifier = Modifier.focusRing(CircleShape),
            ) {
                Icon(
                    if (pointerMode) Icons.Default.GridView else Icons.Default.Mouse,
                    contentDescription = if (pointerMode) "Use arrow keys to jump between buttons" else "Use a pointer",
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

/**
 * Runs before Wyze's own scripts: report a desktop platform with no touch screen, and lay the
 * page out 1600px wide (a TV's 960px counts as a tablet) so it gets the desktop layout.
 */
private const val DESKTOP_JS = """
(function () {
  try {
    Object.defineProperty(Navigator.prototype, 'platform', { get: function () { return 'Linux x86_64'; } });
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: function () { return 0; } });
  } catch (e) {}
  if (window.top !== window) return;
  var WIDE = 'width=1600';
  function widen() {
    var metas = document.querySelectorAll('meta[name="viewport"]');
    if (!metas.length && document.head) {
      var m = document.createElement('meta');
      m.name = 'viewport';
      m.content = WIDE;
      document.head.appendChild(m);
      return;
    }
    for (var i = 0; i < metas.length; i++) if (metas[i].content !== WIDE) metas[i].content = WIDE;
  }
  new MutationObserver(widen).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
  widen();
})();
"""

/**
 * Finds the row holding the live camera videos and turns it into a grid (2 across for up to
 * 4 cameras, 3 across for up to 9), sized so every camera fits on screen without scrolling.
 */
private const val GRID_JS = """
(function () {
  var vids = [].slice.call(document.querySelectorAll('video')).filter(function (v) {
    var r = v.getBoundingClientRect(); return r.width > 80 && r.height > 45;
  });
  if (vids.length < 2) return 'few';
  var row = vids[0].parentElement;
  while (row && !vids.every(function (v) { return row.contains(v); })) row = row.parentElement;
  if (!row || row === document.body) return 'no row';
  var tiles = [].slice.call(row.children).filter(function (c) {
    return vids.some(function (v) { return c.contains(v); });
  });
  if (tiles.length < 2) return 'no tiles';
  if (!document.getElementById('__liveCamGridCss')) {
    var css = document.createElement('style');
    css.id = '__liveCamGridCss';
    css.textContent =
      '.__liveCamGrid{display:grid !important;gap:8px !important;transform:none !important;' +
      'flex-wrap:wrap !important;overflow:visible !important;justify-content:center !important;width:100% !important}' +
      '.__liveCamGrid>*{width:auto !important;min-width:0 !important;max-width:100% !important;' +
      'flex:none !important;margin:0 !important;height:auto !important}' +
      '.__liveCamGrid>* *{max-width:100% !important}' +
      '.__liveCamGrid video{width:100% !important;height:auto !important;object-fit:contain !important}';
    (document.head || document.documentElement).appendChild(css);
  }
  row.classList.add('__liveCamGrid');
  var cols = tiles.length <= 4 ? 2 : tiles.length <= 9 ? 3 : 4;
  var rows = Math.ceil(tiles.length / cols);
  var top = Math.max(0, row.getBoundingClientRect().top + window.scrollY);
  var space = window.innerHeight - top - 16;
  var tileH = (space - 8 * (rows - 1)) / rows;
  var width = Math.max(160, Math.floor(tileH * 16 / 9));
  var tpl = 'repeat(' + cols + ', minmax(0, ' + width + 'px))';
  if (row.style.gridTemplateColumns !== tpl) row.style.setProperty('grid-template-columns', tpl, 'important');
  for (var p = row.parentElement; p && p !== document.body; p = p.parentElement) {
    var o = getComputedStyle(p).overflowX;
    if (o === 'auto' || o === 'scroll') p.scrollLeft = 0;
  }
  return 'grid ' + tiles.length;
})();
"""

private const val PAGE_INFO_JS = """
(function () {
  var b = document.body;
  if (!b) return 'no page body';
  var text = (b.innerText || '').replace(/\s+/g, ' ').trim();
  var words = text ? text.split(' ').length : 0;
  var info = words + ' words, ' + document.getElementsByTagName('*').length + ' elements, ' + window.innerWidth + 'x' + window.innerHeight + ' window';
  if (text) info += ', text "' + text.slice(0, 40) + '"';
  var el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  if (el) {
    var cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    var r = el.getBoundingClientRect();
    info += ', middle: ' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls.slice(0, 30) : '') +
      ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' ' + getComputedStyle(el).backgroundColor;
  }
  var media = document.querySelectorAll('video, canvas, iframe').length;
  if (media) info += ', ' + media + ' video/canvas/frames';
  return info;
})()
"""

private val THIRD_PARTY = listOf("google", "doubleclick", "gtm", "facebook")

private const val DESKTOP_USER_AGENT =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
