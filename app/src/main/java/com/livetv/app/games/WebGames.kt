package com.livetv.app.games

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView

/**
 * A modern game (Block Burst, Color Pour): its page from assets/games fills the screen. The remote's
 * arrows and OK, touch and a mouse all go straight to the page. The page tells us its record through
 * `CableGames.record(id, value)`; Back (the screen's BackHandler) or the page's own exit closes it.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebGamePlay(info: WebGameInfo, scores: GameScores, onExit: () -> Unit) {
    val context = LocalContext.current
    val exitNow = rememberUpdatedState(onExit)
    val web = remember(info.id) {
        WebView(context).apply {
            setBackgroundColor(AndroidColor.BLACK)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // Sound effects start on the first key press, which a TV remote doesn't count as a "gesture".
            settings.mediaPlaybackRequiresUserGesture = false
            isFocusable = true
            isFocusableInTouchMode = true
            val main = Handler(Looper.getMainLooper())
            addJavascriptInterface(object {
                @JavascriptInterface
                fun record(id: String, value: Int) {
                    if (id == info.id) main.post { scores.recordWeb(id, value) }
                }

                @JavascriptInterface
                fun exit() {
                    main.post { exitNow.value() }
                }
            }, "CableGames")
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String?) {
                    view.requestFocus()
                }

                // A TV short of memory may stop the page's process; without this the whole app would close.
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    main.post { exitNow.value() }
                    return true
                }
            }
            loadUrl("file:///android_asset/games/${info.page}")
        }
    }
    DisposableEffect(web) {
        web.requestFocus()
        onDispose {
            web.stopLoading()
            web.destroy()
        }
    }
    AndroidView(factory = { web }, modifier = Modifier.fillMaxSize())
}
