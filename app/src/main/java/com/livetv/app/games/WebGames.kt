package com.livetv.app.games

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext

/**
 * A modern web game (Snake Rush, Block Burst, Gem Swap, ...) opens in [WebGameActivity]; when it closes, the Games menu
 * is back (with the new record on its card).
 */
@Composable
fun WebGamePlay(info: WebGameInfo, onExit: () -> Unit) {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { onExit() }
    LaunchedEffect(info.id) { launcher.launch(WebGameActivity.intent(context, info)) }
}

/**
 * A modern game's page from assets/games, in a plain opaque window of its own. Inside the Compose
 * screen (1.10.3) a VIZIO TV showed only blue: the main window is see-through for the TV's video
 * plane, and the page's picture never reached the screen (as with YouTube, 1.9.51). The remote's
 * arrows and OK, touch and a mouse go straight to the page; Back, or the page's own exit, closes it.
 * The page reports its record through `CableGames.record(id, value)`.
 */
class WebGameActivity : Activity() {

    private var webView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val id = intent.getStringExtra(EXTRA_ID)
        val info = WEB_GAMES.firstOrNull { it.id == id } ?: return finish()
        val scores = GameScores(this)
        val view = WebView(this).apply {
            setBackgroundColor(android.graphics.Color.BLACK)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // Sound effects start on the first key press, which a TV remote doesn't count as a "gesture".
            settings.mediaPlaybackRequiresUserGesture = false
            isFocusable = true
            isFocusableInTouchMode = true
            addJavascriptInterface(object {
                @JavascriptInterface
                fun record(game: String, value: Int) {
                    if (game == info.id) runOnUiThread { scores.recordWeb(game, value) }
                }

                @JavascriptInterface
                fun exit() {
                    runOnUiThread { finish() }
                }
            }, "CableGames")
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String?) {
                    view.requestFocus()
                }

                // A TV short of memory may stop the page's process; without this the whole app would close.
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    webView = null
                    finish()
                    return true
                }
            }
        }
        webView = view
        setContentView(view)
        view.requestFocus()
        view.loadUrl("file:///android_asset/games/${info.page}")
    }

    override fun onPause() {
        super.onPause()
        webView?.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
    }

    override fun onDestroy() {
        webView?.apply {
            stopLoading()
            destroy()
        }
        webView = null
        super.onDestroy()
    }

    companion object {
        private const val EXTRA_ID = "game"

        fun intent(context: Context, info: WebGameInfo): Intent =
            Intent(context, WebGameActivity::class.java).putExtra(EXTRA_ID, info.id)
    }
}
