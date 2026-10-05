package com.appbazaar.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.appbazaar.app.data.StoreApp

@Composable
fun StoreScreen(
    state: StoreState,
    isTv: Boolean,
    onSection: (Section) -> Unit,
    onOpen: (StoreApp) -> Unit,
    onAct: (StoreApp) -> Unit,
    onRefresh: () -> Unit,
    onHelp: () -> Unit,
) {
    val firstFocus = remember { FocusRequester() }
    LaunchedEffect(isTv) { if (isTv) runCatching { firstFocus.requestFocus() } }
    val list = state.visible()
    val pad = if (isTv) 48.dp else 16.dp

    LazyVerticalGrid(
        columns = GridCells.Adaptive(if (isTv) 270.dp else 300.dp),
        modifier = Modifier.fillMaxSize().background(Bg),
        contentPadding = PaddingValues(start = pad, end = pad, top = if (isTv) 28.dp else 12.dp, bottom = 32.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Header(state, isTv, onRefresh, onHelp)
        }
        state.selfUpdate?.let { self ->
            item(span = { GridItemSpan(maxLineSpan) }) {
                FocusSurface(onClick = { onAct(self) }, color = Color(0xFF173A3B)) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        AppIcon(self, 40.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text("A new App Bazaar is ready (${self.version})", fontWeight = FontWeight.Bold)
                            Text("Press to update the store itself.", color = Muted, fontSize = 13.sp)
                        }
                        Text(actionLabel(state.action(self)), color = Accent, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Section.entries.forEach { s ->
                    val selected = state.section == s
                    val count = if (s == Section.UPDATES) state.updates.size else 0
                    FocusSurface(
                        onClick = { onSection(s) },
                        modifier = if (s == state.section) Modifier.focusRequester(firstFocus) else Modifier,
                        shape = RoundedCornerShape(50),
                        color = if (selected) AccentDark else Panel,
                    ) {
                        Text(
                            if (count > 0) "${s.label} ($count)" else s.label,
                            Modifier.padding(horizontal = 18.dp, vertical = 10.dp),
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                        )
                    }
                }
            }
        }
        state.error?.let { msg ->
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column {
                    Text(msg, color = Color(0xFFFFB4A9))
                    if (state.apps.isEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        FocusButton(onClick = onRefresh) { Text("Try again") }
                    }
                }
            }
        }
        if (state.loading && state.apps.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Accent)
                }
            }
        }
        if (list.isEmpty() && state.apps.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    if (state.section == Section.UPDATES) "All your apps are up to date." else "No apps here yet.",
                    color = Muted, modifier = Modifier.padding(vertical = 24.dp),
                )
            }
        }
        items(list, key = { it.id }) { app ->
            AppCard(app, state.action(app), state.installed[app.id], onOpen = { onOpen(app) }, onAct = { onAct(app) })
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Text(
                "New apps added to apps.bulkbazaar.ca show up here by themselves.",
                color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

@Composable
private fun Header(state: StoreState, isTv: Boolean, onRefresh: () -> Unit, onHelp: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("App ", fontSize = 26.sp, fontWeight = FontWeight.Bold)
        Text("Bazaar", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Accent)
        Spacer(Modifier.weight(1f))
        if (state.loading && state.apps.isNotEmpty()) {
            CircularProgressIndicator(Modifier.size(22.dp), color = Accent, strokeWidth = 2.dp)
            Spacer(Modifier.width(12.dp))
        }
        FocusOutlinedButton(onClick = onRefresh) {
            Icon(Icons.Default.Refresh, contentDescription = "Refresh", modifier = Modifier.size(18.dp))
            if (isTv) {
                Spacer(Modifier.width(6.dp))
                Text("Refresh")
            }
        }
        Spacer(Modifier.width(10.dp))
        FocusOutlinedButton(onClick = onHelp) {
            Icon(Icons.Default.Info, contentDescription = "Help", modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(if (isTv) "How to install" else "Help")
        }
    }
}

@Composable
private fun AppCard(app: StoreApp, action: Action, installed: String?, onOpen: () -> Unit, onAct: () -> Unit) {
    FocusSurface(onClick = onOpen, modifier = Modifier.fillMaxWidth()) {
        Column {
            Box(Modifier.fillMaxWidth().aspectRatio(1024f / 500f).background(Color(app.iconColor))) {
                if (app.bannerUrl != null) {
                    AsyncImage(app.bannerUrl, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                }
            }
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AppIcon(app, 48.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(app.name, fontWeight = FontWeight.Bold, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            listOfNotNull(platformsLabel(app), app.category.ifBlank { null }, app.version.ifBlank { null }?.let { "v$it" })
                                .joinToString(" · "),
                            color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(app.tagline, color = Muted, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.height(40.dp))
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    FocusButton(
                        onClick = onAct,
                        enabled = action != Action.Unavailable && action !is Action.Downloading,
                        container = if (action == Action.Open) Color(0xFF2E3A46) else AccentDark,
                    ) { Text(actionLabel(action)) }
                    Spacer(Modifier.width(12.dp))
                    Text(
                        when {
                            action == Action.Update -> "You have $installed"
                            installed != null -> "Installed"
                            else -> ""
                        },
                        color = Muted, fontSize = 12.sp,
                    )
                }
                DownloadBar(action, Modifier.fillMaxWidth().padding(top = 10.dp).clip(RoundedCornerShape(4.dp)))
            }
        }
    }
}
