package com.appbazaar.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.appbazaar.app.R
import com.appbazaar.app.data.Catalog
import com.appbazaar.app.data.StoreApp

private fun sectionTitle(s: Section) = when (s) {
    Section.ALL -> "All apps" to "Everything in App Bazaar"
    Section.TV -> "TV apps" to "Made for Google TV, Android TV and Fire TV remotes"
    Section.PHONE -> "Phone apps" to "For Android phones and tablets"
    Section.PC -> "PC apps" to "Programs for Windows computers. Open one to see the QR code and link for your PC."
    Section.UPDATES -> "Updates" to "Newer versions of apps on this device"
}

@Composable
fun StoreScreen(
    state: StoreState,
    isTv: Boolean,
    onSection: (Section) -> Unit,
    onOpen: (StoreApp) -> Unit,
    onAct: (StoreApp) -> Unit,
    onRefresh: () -> Unit,
    onHelp: () -> Unit,
    onUpdateAll: () -> Unit,
) {
    val firstFocus = remember { FocusRequester() }
    LaunchedEffect(isTv) { if (isTv) runCatching { firstFocus.requestFocus() } }
    val list = state.visible()
    val featured = if (state.section == Section.UPDATES) emptyList() else list.filter { it.featured }
    val pad = if (isTv) 48.dp else 16.dp

    Column(Modifier.fillMaxSize().background(Bg)) {
        TopBar(state, isTv, pad, onRefresh, onHelp, onUpdateAll)
        LazyVerticalGrid(
            columns = GridCells.Adaptive(if (isTv) 280.dp else 300.dp),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = pad, end = pad, top = 14.dp, bottom = 40.dp),
            horizontalArrangement = Arrangement.spacedBy(if (isTv) 24.dp else 16.dp),
            verticalArrangement = Arrangement.spacedBy(if (isTv) 24.dp else 16.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Chips(state, firstFocus, onSection)
            }
            state.selfUpdate?.let { self ->
                item(span = { GridItemSpan(maxLineSpan) }) {
                    FocusSurface(onClick = { onAct(self) }, color = GreenSoft, border = null, grow = false) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.SystemUpdate, null, tint = GreenDark, modifier = Modifier.size(28.dp))
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text("A new App Bazaar is ready (${self.version})", fontWeight = FontWeight.Medium, color = Ink)
                                Text("Press to update the store itself.", color = Muted, fontSize = 13.sp)
                            }
                            Text(actionLabel(state.action(self)), color = GreenDark, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            val updates = state.updates.filter { it.id != Catalog.SELF_ID } // App Bazaar has its own banner above
            if (updates.isNotEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Row(
                        Modifier.clip(RoundedCornerShape(12.dp)).background(GreenSoft).padding(horizontal = 16.dp, vertical = 12.dp).fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.SystemUpdate, null, tint = GreenDark, modifier = Modifier.size(26.dp))
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                if (updates.size == 1) "1 update ready" else "${updates.size} updates ready",
                                fontWeight = FontWeight.Medium, color = Ink,
                            )
                            Text(updates.joinToString { it.name }, color = Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Spacer(Modifier.width(12.dp))
                        FocusButton(onClick = onUpdateAll, enabled = updates.none { state.downloads[it.id] != null || state.installing == it.id }) {
                            Text("Update all")
                        }
                    }
                }
            }
            state.error?.let { msg ->
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Column(Modifier.clip(RoundedCornerShape(12.dp)).background(Color(0xFFFCE8E6)).padding(14.dp).fillMaxWidth()) {
                        Text(msg, color = Color(0xFFA50E0E))
                        if (state.apps.isEmpty()) {
                            Spacer(Modifier.height(10.dp))
                            FocusButton(onClick = onRefresh) { Text("Try again") }
                        }
                    }
                }
            }
            if (state.loading && state.apps.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Green)
                    }
                }
            }
            if (featured.isNotEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp), contentPadding = PaddingValues(vertical = 4.dp)) {
                        items(featured, key = { "hero-" + it.id }) { app ->
                            HeroCard(
                                app, if (state.section == Section.PC) Action.OnPc else state.action(app), isTv,
                                Modifier.then(if (isTv) Modifier.width(520.dp) else Modifier.fillParentMaxWidth(0.88f)),
                                onClick = { onOpen(app) },
                            )
                        }
                    }
                }
            }
            if (state.apps.isNotEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    val (title, sub) = sectionTitle(state.section)
                    Column(Modifier.padding(top = 6.dp)) {
                        Text(title, fontSize = 22.sp, fontWeight = FontWeight.Medium, color = Ink)
                        Text(sub, fontSize = 14.sp, color = Muted)
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
                // In the PC section every card's button leads to the app's page with the QR code for the computer.
                val pcView = state.section == Section.PC
                AppCard(
                    app, if (pcView) Action.OnPc else state.action(app), state.installed[app.id].takeUnless { pcView },
                    onOpen = { onOpen(app) },
                    onAct = { if (pcView || state.action(app) == Action.OnPc) onOpen(app) else onAct(app) },
                )
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
                    HorizontalDivider(color = Line)
                    Spacer(Modifier.height(14.dp))
                    Text("© 2026 App Bazaar · apps.bulkbazaar.ca", color = Muted, fontSize = 12.sp)
                    Text("New apps added to the website show up here by themselves.", color = Muted, fontSize = 12.sp)
                }
            }
        }
    }
}

/** The App Bazaar logo and name, like the website's header. */
@Composable
fun Logo(size: Int = 40, withName: Boolean = true) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Image(painterResource(R.drawable.ic_logo), contentDescription = "App Bazaar", modifier = Modifier.size(size.dp))
        if (!withName) return@Row
        Spacer(Modifier.width(10.dp))
        Text("App ", fontSize = (size * 0.58f).sp, fontWeight = FontWeight.Medium, color = LogoInk)
        Text("Bazaar", fontSize = (size * 0.58f).sp, fontWeight = FontWeight.Medium, color = Teal)
    }
}

@Composable
private fun TopBar(
    state: StoreState,
    isTv: Boolean,
    pad: androidx.compose.ui.unit.Dp,
    onRefresh: () -> Unit,
    onHelp: () -> Unit,
    onUpdateAll: () -> Unit,
) {
    // One-tap "Update all" lives here, on every screen; App Bazaar's own update has its own bar.
    val updates = state.updates.count { it.id != Catalog.SELF_ID }
    Surface(color = Bg, shadowElevation = 3.dp) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = pad, vertical = if (isTv) 16.dp else 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Narrow phones show just the logo, like the website on phones, so Update all fits beside it.
            Logo(if (isTv) 44 else 30, withName = isTv || LocalConfiguration.current.screenWidthDp >= 400)
            Spacer(Modifier.weight(1f))
            if (state.loading && state.apps.isNotEmpty()) {
                CircularProgressIndicator(Modifier.size(20.dp), color = Green, strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
            }
            if (updates > 0) {
                FocusButton(onClick = onUpdateAll) {
                    if (isTv) {
                        Icon(Icons.Default.SystemUpdate, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                    }
                    Text("Update all")
                    Spacer(Modifier.width(6.dp))
                    Box(Modifier.clip(RoundedCornerShape(50)).background(Color.White).padding(horizontal = 6.dp)) {
                        Text("$updates", color = GreenDark, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            } else {
                FocusOutlinedButton(onClick = onUpdateAll) {
                    if (isTv) {
                        Icon(Icons.Default.SystemUpdate, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                    }
                    Text("Update all")
                }
            }
            if (isTv) {
                // Phones refresh by themselves each time the store opens; TVs keep running, so they get a button.
                Spacer(Modifier.width(10.dp))
                FocusOutlinedButton(onClick = onRefresh) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh", modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Refresh")
                }
            }
            Spacer(Modifier.width(if (isTv) 10.dp else 6.dp))
            FocusOutlinedButton(onClick = onHelp) {
                Icon(Icons.AutoMirrored.Filled.HelpOutline, contentDescription = "Help", modifier = Modifier.size(18.dp))
                if (isTv) {
                    Spacer(Modifier.width(6.dp))
                    Text("How to install")
                }
            }
        }
    }
}

/** The website's outlined view chips: the chosen one turns soft green. */
@Composable
private fun Chips(state: StoreState, firstFocus: FocusRequester, onSection: (Section) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Section.entries.forEach { s ->
            val selected = state.section == s
            val count = if (s == Section.UPDATES) state.updates.size else 0
            FocusSurface(
                onClick = { onSection(s) },
                modifier = if (selected) Modifier.focusRequester(firstFocus) else Modifier,
                shape = RoundedCornerShape(8.dp),
                color = if (selected) GreenSoft else Bg,
                border = if (selected) null else Line,
                grow = false,
            ) {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(s.label, fontWeight = FontWeight.Medium, fontSize = 14.sp, color = if (selected) GreenDark else Muted)
                    if (count > 0) {
                        Spacer(Modifier.width(8.dp))
                        Box(Modifier.clip(RoundedCornerShape(50)).background(Green).padding(horizontal = 7.dp, vertical = 1.dp)) {
                            Text("$count", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

/** A big featured banner with the app's name over a dark fade, like the website's top row. */
@Composable
private fun HeroCard(app: StoreApp, action: Action, isTv: Boolean, modifier: Modifier, onClick: () -> Unit) {
    FocusSurface(onClick = onClick, modifier = modifier, shape = RoundedCornerShape(16.dp), border = null, color = Color(app.iconColor)) {
        Box(Modifier.fillMaxWidth().aspectRatio(1024f / 500f)) {
            if (app.bannerUrl != null) {
                AsyncImage(app.bannerUrl, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            }
            Box(
                Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xA6000000), Color(0xD9000000))))
                    .padding(start = 16.dp, end = 16.dp, top = 44.dp, bottom = 14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AppIcon(app, if (isTv) 52.dp else 44.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(app.name, color = Color.White, fontWeight = FontWeight.Medium, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            listOfNotNull(app.category.ifBlank { null }, platformsLabel(app)).joinToString(" · "),
                            color = Color(0xCCFFFFFF), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        actionLabel(action),
                        Modifier.clip(RoundedCornerShape(8.dp)).background(if (action == Action.Open) Color(0x33FFFFFF) else Green)
                            .padding(horizontal = 18.dp, vertical = 8.dp),
                        color = Color.White, fontWeight = FontWeight.Medium, fontSize = 14.sp,
                    )
                }
            }
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
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AppIcon(app, 48.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(app.name, fontWeight = FontWeight.Medium, fontSize = 17.sp, color = Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            listOfNotNull(app.category.ifBlank { null }, platformsLabel(app), app.version.ifBlank { null }?.let { "v$it" })
                                .joinToString(" · "),
                            color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                Text(app.tagline, color = Muted, fontSize = 14.sp, lineHeight = 20.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.height(40.dp))
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (action == Action.Open) {
                        FocusOutlinedButton(onClick = onAct) { Text(actionLabel(action)) }
                    } else {
                        FocusButton(onClick = onAct, enabled = action != Action.Unavailable && action !is Action.Downloading && action != Action.Installing) {
                            Text(actionLabel(action))
                        }
                    }
                    Spacer(Modifier.width(12.dp))
                    Text(
                        when {
                            action == Action.Update -> "You have $installed"
                            installed != null -> "✓ Installed"
                            else -> "Free"
                        },
                        color = if (installed != null && action != Action.Update) GreenDark else Muted, fontSize = 13.sp,
                    )
                }
                DownloadBar(action, Modifier.fillMaxWidth().padding(top = 12.dp).clip(RoundedCornerShape(4.dp)))
            }
        }
    }
}
