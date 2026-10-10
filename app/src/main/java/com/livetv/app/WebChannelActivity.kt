package com.livetv.app

import com.livetv.app.data.YouTube
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Our YouTube channels and Bazaar Hits full screen (1.9.51): the locked page in a plain WebView that
 * is the whole window, with nothing of Compose's around it. Inside the Compose screen a Chromecast
 * played the sound but kept the picture black (TVs draw the video under the window and the page
 * only leaves a see-through hole in it, which any layer or background in between covers).
 * Back closes it; when the page gives up on YouTube (livetv://fallback) it closes with [RESULT_FALLBACK].
 * Library films ([film], 1.9.99) play here too, on our film page: there the remote's arrows, OK and number
 * buttons go to the page (pause, back and forward) instead of changing channel, and the media buttons with them.
 */
class WebChannelActivity : Activity() {

    private var webView: WebView? = null

    /** A Library film (film.html), not a channel. */
    private val film by lazy { intent.getBooleanExtra(EXTRA_FILM, false) }

    /** Number buttons typed so far; 2 seconds after the last one the app goes to that channel. */
    private var typed = ""
    private lateinit var typedView: TextView
    private val goToTyped = Runnable { finishWith(RESULT_NUMBER, Intent().putExtra(EXTRA_NUMBER, typed)) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // Phones: full screen is sideways, as on every other channel.
        if (!com.livetv.app.ui.isTv(this)) requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        // The video is drawn underneath the window; an opaque window keeps it black (1.9.55).
        window.setFormat(PixelFormat.TRANSLUCENT)
        val url = intent.getStringExtra(EXTRA_URL) ?: return finish()
        val view = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            // Normal caching (1.10.24): the player's big scripts no longer download again for every
            // channel, so our channels start much faster. The page stays fresh: its address carries the
            // app version, our site lets copies live only 10 minutes, and the lists are always fetched new.
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            // No background and no layer of its own, so the hole for the video goes right through to it.
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (YouTube.blocksNavigation(request.url.scheme, request.url.host, request.isForMainFrame)) return true
                    if (request.url.scheme != "livetv") return false
                    if (request.url.host == "fallback") {
                        setResult(RESULT_FALLBACK)
                        finish()
                    }
                    // A run of trailers on Bazaar TV is over: its own player goes on.
                    if (request.url.host == "done") {
                        setResult(RESULT_DONE)
                        finish()
                    }
                    // A Library video its owner won't let others play: the Library says so (never YouTube's app).
                    if (request.url.host == "blocked") {
                        setResult(RESULT_BLOCKED)
                        finish()
                    }
                    return true
                }

                // A page that runs out of memory (YouTube on a small TV) loses its renderer; unhandled, that
                // closed the whole app and it started again (1.9.58). Instead the channel's free films play.
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    (view.parent as? ViewGroup)?.removeView(view)
                    view.destroy()
                    webView = null
                    setResult(RESULT_FALLBACK)
                    finish()
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                // No grey placeholder picture over the video while it starts.
                override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
            }
            isFocusable = true
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }
        typedView = TextView(this).apply {
            textSize = 40f
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(0xCC101827.toInt())
            setPadding(32, 12, 32, 12)
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START)
                .apply { setMargins(48, 48, 0, 0) }
        }
        setContentView(FrameLayout(this).apply { addView(view); addView(typedView) })
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        view.loadUrl(url)
        view.requestFocus()
        webView = view
    }

    // Channel up/down and the arrows change channel, and number buttons type one, as on every other
    // channel (1.9.60); the app then opens the new channel.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (film) return filmKey(event) || super.dispatchKeyEvent(event)
        val step = when (event.keyCode) {
            KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP, KeyEvent.KEYCODE_DPAD_UP -> -1
            KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN, KeyEvent.KEYCODE_DPAD_DOWN -> 1
            else -> 0
        }
        if (step != 0) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) finishWith(RESULT_ZAP, Intent().putExtra(EXTRA_STEP, step))
            return true
        }
        if (event.keyCode in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0 && typed.length < 8) {
                typed += event.keyCode - KeyEvent.KEYCODE_0
                typedView.text = typed
                typedView.visibility = View.VISIBLE
                typedView.removeCallbacks(goToTyped)
                typedView.postDelayed(goToTyped, 2_000)
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    /** A Library film: the remote's media buttons go to the page as pause, play, rewind and fast forward. */
    private fun filmKey(event: KeyEvent): Boolean {
        val key = when (event.keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> "playpause"
            KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
            KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_MEDIA_STOP -> "pause"
            KeyEvent.KEYCODE_MEDIA_REWIND, KeyEvent.KEYCODE_MEDIA_PREVIOUS, KeyEvent.KEYCODE_MEDIA_SKIP_BACKWARD -> "rewind"
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.KEYCODE_MEDIA_SKIP_FORWARD -> "fastforward"
            else -> return false
        }
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) webView?.evaluateJavascript("window.filmKey && filmKey('$key')", null)
        return true
    }

    // Phones: a swipe up goes to the next channel and a swipe down to the one before, as on our other
    // full-screen channels; a tap still reaches the page (it shows the title). Measured from where the
    // finger went down to where it came up, whatever the page does with the touch (1.9.98).
    private var downX = 0f
    private var downY = 0f

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        // Films (Library) keep their own buttons; no channel changes there.
        if (!film) when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> { downX = ev.x; downY = ev.y }
            MotionEvent.ACTION_UP -> {
                val dx = ev.x - downX
                val dy = ev.y - downY
                if (Math.abs(dy) >= 48 * resources.displayMetrics.density && Math.abs(dy) > Math.abs(dx)) {
                    finishWith(RESULT_ZAP, Intent().putExtra(EXTRA_STEP, if (dy < 0) 1 else -1))
                    return true
                }
            }
        }
        return super.dispatchTouchEvent(ev)
    }

    private fun finishWith(code: Int, data: Intent) {
        if (isFinishing) return
        setResult(code, data)
        finish()
    }

    /** The Azan screen covers this channel: its sound pauses until the Azan is over. */
    private var pausedForAzan = false

    override fun onStop() {
        super.onStop()
        MessagePopup.webInFront = false
        if (QuranSection.azanShowing && !isFinishing) {
            pausedForAzan = true
            webView?.onPause()
        }
    }

    override fun onStart() {
        super.onStart()
        MessagePopup.webInFront = true
        if (pausedForAzan) {
            pausedForAzan = false
            webView?.onResume()
        }
    }

    // A Gold try on Free (full screen, or the Library for a film) closes this window when its minute is up.
    private val goldCheck = object : Runnable {
        override fun run() {
            showMessage()
            val t = Plans.trying.value
            if (t != null && System.currentTimeMillis() >= t.until) Plans.endTry()
            if (!Plans.canUse(if (film) Plans.Feature.Library else Plans.Feature.FullScreen)) finish()
            else window.decorView.postDelayed(this, 1000)
        }
    }

    override fun onResume() {
        super.onResume()
        window.decorView.post(goldCheck)
    }

    override fun onPause() {
        window.decorView.removeCallbacks(goldCheck)
        super.onPause()
        // Leaving the channel (Home, another app) stops it, like the other channels.
        if (isFinishing) webView?.loadUrl("about:blank")
    }

    override fun onDestroy() {
        messageDialog?.dismiss()
        messageDialog = null
        scope.cancel()
        webView?.destroy()
        webView = null
        super.onDestroy()
    }

    // A message from the NextGen Cable team pops up here too, over the playing channel (owner, 2026-10-09).
    private val scope = MainScope()
    private var messageDialog: android.app.AlertDialog? = null
    private var messageAt = 0L

    /** Shows the waiting message, or takes it away once it was answered or closed (here or on the main screen). */
    private fun showMessage() {
        val m = MessagePopup.shown.value
        if (m == null) {
            messageDialog?.dismiss()
            messageDialog = null
            messageAt = 0L
            return
        }
        if (m.at == messageAt && messageDialog != null) return
        messageDialog?.dismiss()
        messageAt = m.at
        messageDialog = messageDialog(m).also { it.show() }
    }

    private fun messageDialog(m: MessagePopup.Incoming): android.app.AlertDialog {
        val pad = (16 * resources.displayMetrics.density).toInt()
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad * 3 / 2, pad / 2, pad * 3 / 2, 0)
        }
        m.lines.forEach { line ->
            box.addView(TextView(this).apply {
                text = line
                textSize = 20f
                setPadding(0, 0, 0, pad / 2)
            })
        }
        val status = TextView(this).apply { textSize = 15f }
        val input = EditText(this).apply {
            hint = "Or type your answer here"
            maxLines = 4
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or
                android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
        }
        val quick = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        lateinit var dialog: android.app.AlertDialog
        fun send(text: String) {
            val reply = MessagePopup.sendReply ?: return
            status.text = "Sending…"
            scope.launch {
                try {
                    reply(text)
                    Toast.makeText(this@WebChannelActivity, "✓ Sent to the NextGen Cable team", Toast.LENGTH_SHORT).show()
                    MessagePopup.close()
                    dialog.dismiss()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    status.text = "Couldn't send. Check the internet and try again."
                }
            }
        }
        MessagePopup.QUICK_REPLIES.forEach { q ->
            quick.addView(Button(this).apply {
                text = q
                isAllCaps = false
                isFocusableInTouchMode = false
                setOnClickListener { send(q) }
            })
        }
        box.addView(quick)
        box.addView(input)
        box.addView(status)
        dialog = android.app.AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(MessagePopup.TITLE)
            .setView(ScrollView(this).apply { addView(box) })
            .setPositiveButton("Send", null)
            .setNegativeButton("Close", null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val t = input.text.toString().trim()
                if (t.isEmpty()) status.text = "Type your answer first, or choose one of the answers above." else send(t)
            }
            dialog.getButton(android.app.AlertDialog.BUTTON_NEGATIVE).setOnClickListener {
                dialog.dismiss()
                MessagePopup.closeRead()
            }
            // The remote starts on "👍 OK, got it", not in the typing box.
            quick.getChildAt(0)?.let { b -> b.post { b.requestFocus() } }
        }
        // Back closes it, like Close.
        dialog.setOnCancelListener { MessagePopup.closeRead() }
        return dialog
    }

    companion object {
        const val EXTRA_URL = "url"
        const val RESULT_FALLBACK = RESULT_FIRST_USER + 1
        const val RESULT_ZAP = RESULT_FIRST_USER + 2
        const val RESULT_NUMBER = RESULT_FIRST_USER + 3
        const val EXTRA_STEP = "step"
        const val EXTRA_NUMBER = "number"
        const val RESULT_DONE = RESULT_FIRST_USER + 4
        const val RESULT_BLOCKED = RESULT_FIRST_USER + 5
        const val EXTRA_FILM = "film"

        fun intent(context: Context, url: String) = Intent(context, WebChannelActivity::class.java).putExtra(EXTRA_URL, url)

        /** A Library video on our film page, with our own pause, back and forward. */
        fun filmIntent(context: Context, videoId: String, title: String, version: Int) = intent(
            context,
            "https://tv.bulkbazaar.ca/channel/film.html?app=1&v=$videoId&t=${android.net.Uri.encode(title)}&b=$version",
        ).putExtra(EXTRA_FILM, true)
    }
}
