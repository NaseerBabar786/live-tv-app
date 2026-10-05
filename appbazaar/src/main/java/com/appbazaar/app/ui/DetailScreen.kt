package com.appbazaar.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.appbazaar.app.data.StoreApp

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DetailScreen(
    app: StoreApp,
    state: StoreState,
    isTv: Boolean,
    onBack: () -> Unit,
    onAct: () -> Unit,
    onUninstall: () -> Unit,
    onWeb: (String) -> Unit,
) {
    val action = state.action(app)
    val installed = state.installed[app.id]
    val mainFocus = remember { FocusRequester() }
    LaunchedEffect(app.id) { runCatching { mainFocus.requestFocus() } }
    val pad = if (isTv) 48.dp else 16.dp

    Column(
        Modifier.fillMaxSize().background(Bg).verticalScroll(rememberScrollState())
            .padding(horizontal = pad, vertical = if (isTv) 28.dp else 12.dp),
    ) {
        FocusOutlinedButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
            Spacer(Modifier.width(6.dp))
            Text("All apps")
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AppIcon(app, if (isTv) 96.dp else 72.dp)
                    Spacer(Modifier.width(16.dp))
                    Column {
                        Text(app.name, fontSize = if (isTv) 32.sp else 26.sp, fontWeight = FontWeight.Medium, color = Ink)
                        Text("App Bazaar", color = Green, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text(app.tagline, color = Muted, fontSize = 15.sp)
                    }
                }
                Spacer(Modifier.height(18.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    FocusButton(
                        onClick = onAct,
                        modifier = Modifier.focusRequester(mainFocus).widthIn(min = 160.dp),
                        enabled = action != Action.Unavailable && action !is Action.Downloading,
                    ) { Text(actionLabel(action), fontSize = 16.sp) }
                    if (installed != null && app.packageName != null) {
                        FocusOutlinedButton(onClick = onUninstall) { Text("Uninstall") }
                    }
                    if (app.webUrl != null && app.apkUrl != null) {
                        FocusOutlinedButton(onClick = { onWeb(app.webUrl) }) { Text("Website") }
                    }
                }
                DownloadBar(action, Modifier.widthIn(max = 420.dp).fillMaxWidth().padding(top = 12.dp).clip(RoundedCornerShape(4.dp)))
                Spacer(Modifier.height(16.dp))
                Facts(app, installed)
            }
            if (isTv && app.bannerUrl != null) {
                AsyncImage(
                    app.bannerUrl, null,
                    Modifier.weight(1f).aspectRatio(1024f / 500f).clip(RoundedCornerShape(16.dp)),
                    contentScale = ContentScale.Crop,
                )
            }
        }
        if (!isTv && app.bannerUrl != null) {
            Spacer(Modifier.height(16.dp))
            Box(Modifier.fillMaxWidth().aspectRatio(1024f / 500f).clip(RoundedCornerShape(16.dp)).background(Color(app.iconColor))) {
                AsyncImage(app.bannerUrl, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            }
        }
        Block("About this app", app.description)
        if (app.whatsNew.isNotBlank()) Block("What's new", app.whatsNew)
        if (app.tvCode != null) {
            Block(
                "Install on another TV",
                "Open the Downloader app on the TV and type ${app.tvCode}, then press Go. " +
                    "Or install App Bazaar on that TV and pick ${app.name} from the list.",
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Facts(app: StoreApp, installed: String?) {
    val facts = listOfNotNull(
        "Newest version" to app.version.ifBlank { "?" },
        installed?.let { "On this device" to it },
        "Works on" to platformsLabel(app),
        app.category.takeIf { it.isNotBlank() }?.let { "Category" to it },
        app.updated.takeIf { it.isNotBlank() }?.let { "Updated" to it },
    )
    FlowRow(
        Modifier.clip(RoundedCornerShape(12.dp)).background(Soft).padding(horizontal = 18.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(28.dp), verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        facts.forEach { (k, v) ->
            Column {
                Text(v, fontWeight = FontWeight.Medium, color = Ink)
                Text(k, color = Muted, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun Block(title: String, body: String) {
    if (body.isBlank()) return
    Spacer(Modifier.height(22.dp))
    Text(title, fontSize = 19.sp, fontWeight = FontWeight.Medium, color = Ink)
    Spacer(Modifier.height(6.dp))
    Text(body, color = Ink, fontSize = 15.sp, lineHeight = 22.sp, modifier = Modifier.widthIn(max = 900.dp))
}
