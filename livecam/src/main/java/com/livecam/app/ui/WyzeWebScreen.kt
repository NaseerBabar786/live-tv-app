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
    var gridInfo by remember { mutableStateOf<String?>(null) }
    // A camera shown full screen: the top bar hides so the camera gets the whole TV.
    var solo by remember { mutableStateOf(false) }
    val reloadFocus = remember { FocusRequester() }
    val appVersion = remember {
        runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "?"
    }
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
                    // Save the Wyze sign-in now, not only when the screen closes: an app
                    // update or the TV closing the app would otherwise lose it.
                    WyzeSignIn.save(context)
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    WyzeSignIn.save(context)
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
            WyzeSignIn.restore(context)
            loadUrl(WYZE_WEB_VIEW_URL)
        }
    }
    // Wyze's site changes pages without reloading, so re-read what the page shows every few seconds.
    LaunchedEffect(webView) {
        while (true) {
            delay(4_000)
            webView.evaluateJavascript(AUTO_LOGIN_JS, null)
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
            webView.evaluateJavascript(GRID_JS) { result ->
                gridInfo = result?.trim('"')?.takeIf { it.startsWith("grid") }
            }
        }
    }
    // Up at the top of the page moves to the Reload button; Down from the top bar goes back in.
    webView.onNavResult = { navInfo = it }
    webView.onSoloChanged = { on ->
        solo = on
        webView.evaluateJavascript(GRID_JS, null)
    }
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
            WyzeSignIn.save(context)
            webView.destroy()
        }
    }

    // Back leaves a full-screen camera first, then steps through Wyze's pages, then leaves.
    BackHandler {
        when {
            solo -> webView.exitSolo()
            webView.canGoBack() -> webView.goBack()
            else -> onBack()
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .safeDrawingPadding()
    ) {
        if (!solo) Row(
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
                        gridInfo,
                        "sign-in restored ${WyzeSignIn.lastRestored}".takeIf { WyzeSignIn.lastRestored > 0 },
                        pageInfo,
                        problem,
                        "Live Cam $appVersion, WebView $webViewVersion",
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
        runCatching { WebViewCompat.addDocumentStartJavaScript(webView, KEEP_SESSION_JS, setOf("https://*.wyze.com")) }
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
 * Finds the live camera videos and places each camera on screen ourselves: 2 across for up to
 * 4 cameras (3 across for up to 9), as large as the space below "Cameras" allows. Wyze's own
 * masonry layout kept stacking them in one column whatever its styles were changed to, so the
 * cameras are pinned to exact screen positions instead, and Wyze's layout no longer matters.
 */
private const val GRID_JS = """
(function () {
  var vids = [].slice.call(document.querySelectorAll('video')).filter(function (v) {
    var r = v.getBoundingClientRect(); return r.width > 40 && r.height > 20;
  });
  if (vids.length < 2) return 'few';
  var row = vids[0].parentElement;
  while (row && !vids.every(function (v) { return row.contains(v); })) row = row.parentElement;
  if (!row || row === document.body) return 'no row';
  var tiles = [].slice.call(row.children).filter(function (c) {
    return vids.some(function (v) { return c.contains(v); });
  });
  if (tiles.length < 2) return 'no tiles';
  function set(el, k, v) { if (el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v, 'important'); }
  if (!document.getElementById('__liveCamGridCss')) {
    var css = document.createElement('style');
    css.id = '__liveCamGridCss';
    css.textContent =
      '.__liveCamTile *{max-width:100% !important}' +
      '.__liveCamTile video{width:100% !important;height:auto !important;object-fit:contain !important}';
    (document.head || document.documentElement).appendChild(css);
  }
  var cols = tiles.length <= 4 ? 2 : tiles.length <= 9 ? 3 : 4;
  var rows = Math.ceil(tiles.length / cols);
  var gap = 8;
  // The space to fill: the content panel (the first ancestor at least half the screen wide),
  // from where the cameras start down to the bottom of the screen.
  var area = row.parentElement;
  while (area && area !== document.body && area.getBoundingClientRect().width < innerWidth * 0.5) area = area.parentElement;
  var ar = (area || document.body).getBoundingClientRect();
  var left = Math.max(0, ar.left) + 12, right = Math.min(innerWidth, ar.right) - 12;
  var top = Math.max(0, row.getBoundingClientRect().top);
  var availW = right - left, availH = innerHeight - top - 10;
  // Height per unit of width, from what Wyze drew (camera picture plus its title bar).
  var t0 = tiles[0], ratio = t0.offsetWidth > 0 ? t0.offsetHeight / t0.offsetWidth : 0;
  if (!(ratio > 0.3 && ratio < 1.5)) ratio = 0.6;
  var w = Math.floor(Math.min((availW - gap * (cols - 1)) / cols, ((availH - gap * (rows - 1)) / rows) / ratio));
  w = Math.max(160, w);
  var h = Math.round(w * ratio);
  var x0 = left + Math.max(0, (availW - (w * cols + gap * (cols - 1))) / 2);
  // A parent with a transform would move 'fixed' boxes; correct by what was measured last time.
  var dx = row.__liveCamDx || 0, dy = row.__liveCamDy || 0;
  // One camera chosen with OK goes full screen over a black backdrop; the rest stay behind it.
  var solo = window.__liveCamSolo;
  if (tiles.indexOf(solo) < 0) solo = window.__liveCamSolo = null;
  var shade = document.getElementById('__liveCamShade');
  if (solo && !shade) {
    shade = document.createElement('div');
    shade.id = '__liveCamShade';
    shade.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;background:#000;z-index:2147482000;pointer-events:none;';
    document.documentElement.appendChild(shade);
  } else if (!solo && shade) shade.remove();
  set(row, 'height', (h * rows + gap * (rows - 1)) + 'px');
  set(row, 'min-height', '0');
  tiles.forEach(function (t, i) {
    t.classList.add('__liveCamTile');
    set(t, 'position', 'fixed');
    set(t, 'box-sizing', 'border-box');
    var tw = w, tx = x0 + (i % cols) * (w + gap), ty = top + Math.floor(i / cols) * (h + gap);
    if (t === solo) {
      tw = Math.floor(Math.min(innerWidth, innerHeight / ratio));
      tx = (innerWidth - tw) / 2;
      ty = Math.max(0, (innerHeight - tw * ratio) / 2);
    }
    set(t, 'left', Math.round(tx + dx) + 'px');
    set(t, 'top', Math.round(ty + dy) + 'px');
    set(t, 'width', tw + 'px');
    set(t, 'max-width', tw + 'px');
    set(t, 'min-width', '0');
    set(t, 'height', 'auto');
    set(t, 'margin', '0');
    set(t, 'transform', 'none');
    set(t, 'z-index', t === solo ? '2147482001' : '1');
    set(t, 'display', 'block');
  });
  if (!solo) {
    var r0 = tiles[0].getBoundingClientRect();
    row.__liveCamDx = dx + Math.round(x0 - r0.left);
    row.__liveCamDy = dy + Math.round(top - r0.top);
  }
  var last = tiles[tiles.length - 1].getBoundingClientRect();
  if (solo) return 'grid ' + tiles.length + ', camera ' + (tiles.indexOf(solo) + 1) + ' full screen';
  return 'grid ' + tiles.length + ' as ' + cols + 'x' + rows + ' at ' + w + 'px, bottom ' + Math.round(last.bottom) + '/' + innerHeight;
})();
"""

/**
 * Wyze also keeps part of its sign-in in the page's session storage, which is wiped whenever the
 * WebView closes. Mirror it into local storage (which is kept) and put it back when a Wyze page
 * opens with an empty session storage, before Wyze's own scripts run.
 */
private const val KEEP_SESSION_JS = """
(function () {
  try {
    var KEY = '__liveCamSession';
    var ss = window.sessionStorage, ls = window.localStorage;
    var saved = ls.getItem(KEY);
    if (saved && ss.length === 0) {
      var o = JSON.parse(saved);
      for (var k in o) ss.setItem(k, o[k]);
    }
    var save = function () {
      try {
        var o = {};
        for (var i = 0; i < ss.length; i++) { var k = ss.key(i); o[k] = ss.getItem(k); }
        ls.setItem(KEY, JSON.stringify(o));
      } catch (e) {}
    };
    var P = Storage.prototype, set = P.setItem, rem = P.removeItem, clr = P.clear;
    P.setItem = function (k, v) { set.call(this, k, v); if (this === ss) save(); };
    P.removeItem = function (k) { rem.call(this, k); if (this === ss) save(); };
    P.clear = function () { clr.call(this); if (this === ss) save(); };
    window.addEventListener('pagehide', save);
    setInterval(save, 5000);
  } catch (e) {}
})();
"""

/**
 * When Wyze shows its signed-out welcome page, press its "Log in" button. Wyze's sign-in
 * service usually still remembers the account, so this goes straight back to the cameras
 * without typing the password. At most once a minute, so a real sign-in page isn't looped.
 */
private const val AUTO_LOGIN_JS = """
(function () {
  if (location.hostname !== 'my.wyze.com' || location.pathname.length > 1) return '';
  var last = +(localStorage.getItem('__liveCamAutoLogin') || 0);
  if (Date.now() - last < 60000) return '';
  var b = [].slice.call(document.querySelectorAll('a,button')).filter(function (e) {
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && /log\s*in/i.test(e.textContent || '');
  })[0];
  if (!b) return '';
  localStorage.setItem('__liveCamAutoLogin', String(Date.now()));
  b.click();
  return 'auto login';
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
