package com.sparkweather.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import com.livetv.app.ui.isTv

/**
 * A weather video, full screen, in Cable TV's locked film page (tv.bulkbazaar.ca/channel/film.html): YouTube's
 * embedded player under our own pause, back and forward buttons, with no YouTube screens (owner's rule). A
 * plain window of its own, as in Cable TV, because TVs draw the video underneath the window. Back closes it;
 * the page says when the video ended (livetv://done) or can't play here (livetv://blocked).
 */
class VideoActivity : Activity() {

    private var webView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // Phones: videos play sideways, filling the screen.
        if (!isTv(this)) requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        window.setFormat(PixelFormat.TRANSLUCENT)
        val url = intent.getStringExtra(EXTRA_URL) ?: return finish()
        val view = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val u = request.url
                    when (u.scheme?.lowercase()) {
                        "livetv" -> {
                            setResult(
                                when (u.host) {
                                    "done" -> RESULT_DONE
                                    "blocked" -> RESULT_BLOCKED
                                    else -> RESULT_OK
                                },
                            )
                            finish()
                            return true
                        }
                        // Nothing ever leaves for YouTube's own site or app.
                        "http", "https" -> return request.isForMainFrame && isYouTube(u.host)
                        else -> return true
                    }
                }

                // A page that runs out of memory loses its renderer; close the video instead of the app.
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    (view.parent as? ViewGroup)?.removeView(view)
                    view.destroy()
                    webView = null
                    finish()
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
            }
            isFocusable = true
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }
        setContentView(FrameLayout(this).apply { addView(view) })
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        view.loadUrl(url)
        view.requestFocus()
        webView = view
    }

    /** The remote's media keys go to the page's own buttons. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val key = when (event.keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> "playpause"
            KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
            KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_MEDIA_STOP -> "pause"
            KeyEvent.KEYCODE_MEDIA_REWIND, KeyEvent.KEYCODE_MEDIA_PREVIOUS, KeyEvent.KEYCODE_MEDIA_SKIP_BACKWARD -> "rewind"
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.KEYCODE_MEDIA_SKIP_FORWARD -> "fastforward"
            else -> return super.dispatchKeyEvent(event)
        }
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) webView?.evaluateJavascript("window.filmKey && filmKey('$key')", null)
        return true
    }

    override fun onDestroy() {
        webView?.destroy()
        webView = null
        super.onDestroy()
    }

    companion object {
        const val RESULT_DONE = RESULT_FIRST_USER + 4
        const val RESULT_BLOCKED = RESULT_FIRST_USER + 5
        private const val EXTRA_URL = "url"

        fun intent(context: Context, videoId: String, title: String): Intent =
            Intent(context, VideoActivity::class.java).putExtra(
                EXTRA_URL,
                "https://tv.bulkbazaar.ca/channel/film.html?app=1&v=$videoId&t=${Uri.encode(title)}&b=${BuildConfig.VERSION_CODE}",
            )

        private fun isYouTube(host: String?): Boolean {
            val h = host?.lowercase()?.removePrefix("www.")?.removePrefix("m.") ?: return false
            return h == "youtu.be" || listOf("youtube.com", "youtube-nocookie.com").any { h == it || h.endsWith(".$it") }
        }
    }
}
