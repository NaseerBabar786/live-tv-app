package com.livetv.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

/**
 * Our YouTube channels and Bazaar Hits full screen (1.9.51): the locked page in a plain WebView that
 * is the whole window, with nothing of Compose's around it. Inside the Compose screen a Chromecast
 * played the sound but kept the picture black (TVs draw the video under the window and the page
 * only leaves a see-through hole in it, which any layer or background in between covers).
 * Back closes it; when the page gives up on YouTube (livetv://fallback) it closes with [RESULT_FALLBACK].
 */
class WebChannelActivity : Activity() {

    private var webView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val url = intent.getStringExtra(EXTRA_URL) ?: return finish()
        val view = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            // Always the newest page, not a copy the TV kept from an earlier version.
            settings.cacheMode = WebSettings.LOAD_NO_CACHE
            // No background and no layer of its own, so the hole for the video goes right through to it.
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.scheme != "livetv") return false
                    if (request.url.host == "fallback") {
                        setResult(RESULT_FALLBACK)
                        finish()
                    }
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
        setContentView(view)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        view.loadUrl(url)
        view.requestFocus()
        webView = view
    }

    override fun onPause() {
        super.onPause()
        // Leaving the channel (Home, another app) stops it, like the other channels.
        if (isFinishing) webView?.loadUrl("about:blank")
    }

    override fun onDestroy() {
        webView?.destroy()
        webView = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_URL = "url"
        const val RESULT_FALLBACK = RESULT_FIRST_USER + 1

        fun intent(context: Context, url: String) = Intent(context, WebChannelActivity::class.java).putExtra(EXTRA_URL, url)
    }
}
