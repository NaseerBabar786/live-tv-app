package com.multichat.app.web

import android.annotation.SuppressLint
import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.MutableContextWrapper
import android.graphics.Color
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.multichat.app.data.Account
import com.multichat.app.data.Rules
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

/**
 * Keeps one WebView per account alive for as long as the app runs, so every account stays
 * connected and its notifications arrive while another account is on screen. Each WebView
 * uses its own WebView profile ("acc_<id>") with separate cookies and storage, so each
 * account signs in to the official web.whatsapp.com with its own QR code.
 *
 * Nothing here reads chats or sends messages. The only script added to the page turns its
 * browser notifications into Android notifications labelled with the account's name
 * (WebView has no notifications of its own) and saves files the person chooses to download.
 */
object WebPool {

    const val ORIGIN = "https://web.whatsapp.com"
    private const val HOME = "$ORIGIN/"
    private const val PROFILE_PREFIX = "acc_"

    /** Things only the on-screen activity can do: pick files and ask for the microphone. */
    interface Host {
        fun chooseFiles(callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean
        fun requestMicrophone(request: PermissionRequest)
    }

    var host: Host? = null

    private lateinit var app: Application
    private lateinit var context: MutableContextWrapper
    private val views = LinkedHashMap<String, WebView>()
    private val main = Handler(Looper.getMainLooper())
    private var userAgent = ""
    private var textZoom = 100
    private var shown: String? = null

    /** The views live in this frame; the screen shows it and flips which one is visible. */
    lateinit var frame: FrameLayout
        private set

    private val _unread = MutableStateFlow<Map<String, Int>>(emptyMap())
    val unread: StateFlow<Map<String, Int>> = _unread.asStateFlow()

    /** Separate profiles need Android System WebView 110 or newer. */
    val supported: Boolean
        get() = WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)

    fun init(application: Application) {
        if (::app.isInitialized) return
        app = application
        context = MutableContextWrapper(application)
        frame = FrameLayout(context).apply { setBackgroundColor(Color.parseColor("#0B141A")) }
        userAgent = desktopUserAgent(application)
    }

    /** Lets page pop-ups (like the attachment menu's pickers) use the activity's theme and windows. */
    fun attach(activity: Context) {
        context.baseContext = activity
    }

    fun detach(activity: Context) {
        if (context.baseContext === activity) context.baseContext = app
        (frame.parent as? ViewGroup)?.removeView(frame)
    }

    /** Creates views for new accounts and removes the views and sign-ins of deleted ones. */
    fun sync(accounts: List<Account>) {
        if (!supported) return
        val ids = accounts.map { it.id }.toSet()
        for (id in views.keys.toList() - ids) {
            val wv = views.remove(id) ?: continue
            frame.removeView(wv)
            wv.destroy()
            _unread.value = _unread.value - id
            deleteProfileLater(id)
        }
        for (acc in accounts) if (acc.id !in views) create(acc.id)
        cleanOrphanProfiles(ids)
        show(shown)
    }

    fun show(id: String?) {
        shown = id
        views.forEach { (key, wv) -> wv.visibility = if (key == id) View.VISIBLE else View.INVISIBLE }
        views[id]?.requestFocus()
    }

    fun reload(id: String) {
        views[id]?.loadUrl(HOME)
    }

    fun setTextZoom(percent: Int) {
        textZoom = percent
        views.values.forEach { it.settings.textZoom = percent }
    }

    /**
     * Types [text] into the open account's message box, as if the person pasted it. Calls
     * back with false when no message box was found, so the screen can copy it instead.
     * It never presses Send.
     */
    fun insertText(id: String, text: String, done: (Boolean) -> Unit) {
        val wv = views[id] ?: return done(false)
        wv.requestFocus()
        val js = """
            (function(t){
              var el = document.activeElement;
              var editable = el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
              if (!editable) {
                el = document.querySelector('footer [contenteditable="true"]');
                if (el) el.focus();
              }
              if (!el) return false;
              return document.execCommand('insertText', false, t);
            })(${JSONObject.quote(text)})
        """.trimIndent()
        wv.evaluateJavascript(js) { result -> done(result == "true") }
    }

    /**
     * Inserts a quick reply once the sheet that offered it has closed and the page has focus
     * again. When there is no message box open, the text is copied for pasting instead.
     */
    fun insertTextSoon(id: String, text: String) {
        main.postDelayed({
            insertText(id, text) { ok ->
                if (!ok) {
                    val clipboard = app.getSystemService(android.content.ClipboardManager::class.java)
                    clipboard?.setPrimaryClip(android.content.ClipData.newPlainText("Quick reply", text))
                }
                Toast.makeText(
                    app,
                    if (ok) "Added. Check it and press Send." else "Copied. Open a chat, hold the message box and tap Paste.",
                    Toast.LENGTH_SHORT,
                ).show()
            }
        }, 400L)
    }

    @SuppressLint("SetJavaScriptEnabled", "RequiresFeature")
    private fun create(id: String) {
        val wv = WebView(context)
        // The profile must be set before anything else touches the WebView.
        ProfileStore.getInstance().getOrCreateProfile(PROFILE_PREFIX + id)
        WebViewCompat.setProfile(wv, PROFILE_PREFIX + id)

        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            userAgentString = userAgent
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            textZoom = this@WebPool.textZoom
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportMultipleWindows(false)
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)
        wv.setBackgroundColor(Color.parseColor("#0B141A"))

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(wv, "__multichat", setOf(ORIGIN)) { _, message, _, _, _ ->
                onPageMessage(id, message.data ?: return@addWebMessageListener)
            }
        }
        val earlyScript = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        if (earlyScript) WebViewCompat.addDocumentStartJavaScript(wv, PAGE_SCRIPT, setOf(ORIGIN))

        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.scheme == "https" && url.host == "web.whatsapp.com") return false
                openOutside(url)
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                if (!earlyScript && url.orEmpty().startsWith(ORIGIN)) view.evaluateJavascript(PAGE_SCRIPT, null)
            }

            // A crashed or reclaimed page must not close the whole app: rebuild just that account.
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                if (views[id] === view) {
                    views.remove(id)
                    frame.removeView(view)
                    view.destroy()
                    main.post { create(id); show(shown) }
                } else {
                    view.destroy()
                }
                return true
            }
        }
        wv.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(view: WebView, title: String?) {
                val n = Rules.unreadFromTitle(title)
                if (_unread.value[id] != n) _unread.value = _unread.value + (id to n)
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean = host?.chooseFiles(callback, params) ?: false

            override fun onPermissionRequest(request: PermissionRequest) {
                val fromWhatsApp = request.origin?.toString()?.startsWith(ORIGIN) == true
                val wantsMic = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                val h = host
                if (fromWhatsApp && wantsMic && h != null) h.requestMicrophone(request) else request.deny()
            }
        }
        wv.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
            if (url.startsWith("blob:")) {
                wv.evaluateJavascript("window.__multichatSave && __multichatSave(${JSONObject.quote(url)}, ${JSONObject.quote(name)})", null)
            } else if (url.startsWith("http")) {
                openOutside(Uri.parse(url))
            }
        }

        wv.visibility = if (id == shown) View.VISIBLE else View.INVISIBLE
        frame.addView(wv, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        views[id] = wv
        wv.loadUrl(HOME)
    }

    private fun onPageMessage(id: String, data: String) {
        val o = runCatching { JSONObject(data) }.getOrNull() ?: return
        when (o.optString("t")) {
            "n" -> Notifier.show(app, id, o.optString("title"), o.optString("body"))
            "file" -> Downloads.save(app, o.optString("name"), o.optString("mime"), o.optString("data"))
            "err" -> Toast.makeText(app, o.optString("msg", "The file could not be saved."), Toast.LENGTH_LONG).show()
        }
    }

    private fun openOutside(uri: Uri) {
        if (uri.scheme != "http" && uri.scheme != "https" && uri.scheme != "mailto" && uri.scheme != "tel") return
        runCatching {
            app.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    /** A profile can only be deleted once no WebView uses it; WebView frees it shortly after destroy. */
    @SuppressLint("RequiresFeature")
    private fun deleteProfileLater(id: String, attempt: Int = 0) {
        main.postDelayed({
            val ok = runCatching { ProfileStore.getInstance().deleteProfile(PROFILE_PREFIX + id) }.getOrDefault(false)
            if (!ok && attempt < 5) deleteProfileLater(id, attempt + 1)
        }, 1500L)
    }

    /** Removes sign-ins left behind by accounts that were deleted while a profile was still busy. */
    @SuppressLint("RequiresFeature")
    private fun cleanOrphanProfiles(ids: Set<String>) {
        runCatching {
            ProfileStore.getInstance().allProfileNames
                .filter { it.startsWith(PROFILE_PREFIX) && it.removePrefix(PROFILE_PREFIX) !in ids }
                .forEach { name -> deleteProfileLater(name.removePrefix(PROFILE_PREFIX)) }
        }
    }

    /** WhatsApp Web only opens in a desktop browser, so the pages get a desktop Chrome user agent. */
    private fun desktopUserAgent(context: Context): String {
        val chrome = runCatching { WebSettings.getDefaultUserAgent(context) }.getOrNull()
            ?.let { Regex("""Chrome/(\d+)""").find(it)?.groupValues?.get(1) } ?: "138"
        return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$chrome.0.0.0 Safari/537.36"
    }

    /**
     * Runs before WhatsApp Web's own scripts. Gives the page a Notification that forwards
     * the title and text to the app, and a helper to save a file the person downloads.
     */
    private val PAGE_SCRIPT = """
        (function () {
          if (window.__multichatShim) return;
          window.__multichatShim = true;
          var bridge = window.__multichat;
          if (!bridge) return;
          function send(o) { try { bridge.postMessage(JSON.stringify(o)); } catch (e) {} }
          function MultiChatNotification(title, options) {
            var o = options || {};
            this.title = String(title || '');
            this.body = String(o.body || '');
            this.tag = o.tag || '';
            this.data = o.data;
            this.onclick = null; this.onclose = null; this.onshow = null; this.onerror = null;
            send({ t: 'n', title: this.title, body: this.body });
          }
          MultiChatNotification.prototype.close = function () {};
          MultiChatNotification.prototype.addEventListener = function () {};
          MultiChatNotification.prototype.removeEventListener = function () {};
          Object.defineProperty(MultiChatNotification, 'permission', { get: function () { return 'granted'; } });
          MultiChatNotification.requestPermission = function (cb) {
            if (typeof cb === 'function') cb('granted');
            return Promise.resolve('granted');
          };
          window.Notification = MultiChatNotification;
          if (window.ServiceWorkerRegistration && ServiceWorkerRegistration.prototype) {
            ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
              send({ t: 'n', title: String(title || ''), body: String((options && options.body) || '') });
              return Promise.resolve();
            };
          }
          window.__multichatSave = function (url, name) {
            fetch(url).then(function (r) { return r.blob(); }).then(function (b) {
              if (b.size > 60 * 1024 * 1024) { send({ t: 'err', msg: 'This file is too big to save from here.' }); return; }
              var fr = new FileReader();
              fr.onload = function () {
                send({ t: 'file', name: name, mime: b.type, data: String(fr.result).split(',')[1] || '' });
              };
              fr.readAsDataURL(b);
            }).catch(function () { send({ t: 'err', msg: 'The file could not be saved.' }); });
          };
        })();
    """.trimIndent()
}
