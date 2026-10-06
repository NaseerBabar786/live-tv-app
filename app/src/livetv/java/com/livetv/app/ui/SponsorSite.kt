package com.livetv.app.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/**
 * A sponsor's website, full screen inside the app, because Google TV has no web browser. The
 * arrows move between links and scroll, OK opens a link. Back goes back a page, and from the
 * first page it closes the site, so the viewer is right where they were (the channel keeps
 * playing underneath).
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun SponsorSite(url: String, name: String, onClose: () -> Unit) {
    var web by remember { mutableStateOf<WebView?>(null) }
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        BackHandler {
            val w = web
            if (w != null && w.canGoBack()) w.goBack() else onClose()
        }
        Column(Modifier.fillMaxSize().background(Color.White)) {
            Row(
                Modifier.fillMaxWidth().background(Color(0xFF101828)).padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    name,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text("Back: return to Live TV", color = Color.White.copy(alpha = 0.75f), fontSize = 12.sp, maxLines = 1)
            }
            Box(Modifier.fillMaxWidth().weight(1f)) {
                if (failed) {
                    Text(
                        "This website can't be shown on this device. Press Back to return to Live TV.",
                        color = Color.Black,
                        fontSize = 16.sp,
                        modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    )
                } else {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { context ->
                            runCatching {
                                WebView(context).apply {
                                    settings.javaScriptEnabled = true
                                    settings.domStorageEnabled = true
                                    settings.loadWithOverviewMode = true
                                    settings.useWideViewPort = true
                                    settings.mediaPlaybackRequiresUserGesture = true
                                    isFocusable = true
                                    isFocusableInTouchMode = true
                                    webViewClient = object : WebViewClient() {
                                        // Links stay inside this view; "tel:", "mailto:" and app links are ignored.
                                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                            val scheme = request.url.scheme
                                            return scheme != "http" && scheme != "https"
                                        }
                                        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) { loading = true }
                                        override fun onPageFinished(view: WebView, url: String?) { loading = false }
                                        // Its renderer running out of memory must not close the whole app (1.9.58).
                                        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                                            (view.parent as? android.view.ViewGroup)?.removeView(view)
                                            view.destroy()
                                            if (web === view) web = null
                                            return true
                                        }
                                    }
                                    loadUrl(url)
                                    requestFocus()
                                    web = this
                                }
                            }.getOrElse {
                                // No WebView on this device (very rare): say so instead of crashing.
                                failed = true
                                android.view.View(context)
                            }
                        },
                        onRelease = { (it as? WebView)?.destroy() },
                    )
                    if (loading) CircularProgressIndicator(Modifier.align(Alignment.Center), color = Color(0xFF101828))
                }
            }
        }
    }
}
