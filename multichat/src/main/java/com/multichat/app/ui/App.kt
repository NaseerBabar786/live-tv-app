package com.multichat.app.ui

import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.Quickreply
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.multichat.app.MainActivity
import com.multichat.app.R
import com.multichat.app.data.Account
import com.multichat.app.data.Lock
import com.multichat.app.data.Rules
import com.multichat.app.data.Store
import com.multichat.app.web.Notifier
import com.multichat.app.web.WebPool

@Composable
fun App(activity: MainActivity, updates: UpdateViewModel) {
    val accounts by Store.accounts.collectAsState()
    val settings by Store.settings.collectAsState()
    val unread by WebPool.unread.collectAsState()
    val lockedNow by Lock.locked.collectAsState()
    val openAccount by activity.openAccount.collectAsState()
    val update by updates.update.collectAsStateWithLifecycle()
    val locked = lockedNow && settings.hasPin
    val context = LocalContext.current

    var editing by rememberSaveable { mutableStateOf<String?>(null) }
    var editingIsNew by rememberSaveable { mutableStateOf(false) }
    var showTemplates by rememberSaveable { mutableStateOf(false) }
    var showSettings by rememberSaveable { mutableStateOf(false) }

    val active = settings.active?.takeIf { id -> accounts.any { it.id == id } } ?: accounts.firstOrNull()?.id

    LaunchedEffect(accounts) { WebPool.sync(accounts) }
    LaunchedEffect(active, locked) {
        WebPool.show(if (locked) null else active)
        Notifier.onScreen = if (locked) null else active
        if (!locked && active != null) Notifier.clear(context, active)
    }
    LaunchedEffect(openAccount) {
        val id = openAccount ?: return@LaunchedEffect
        if (accounts.any { it.id == id }) Store.update { it.copy(active = id) }
        activity.accountOpened()
    }

    // Back leaves the app running, so the accounts stay connected.
    BackHandler(enabled = !locked) { activity.moveTaskToBack(true) }

    if (!WebPool.supported) {
        UnsupportedScreen()
        return
    }

    Box(Modifier.fillMaxSize().background(Bg)) {
        Column(Modifier.fillMaxSize().systemBarsPadding().imePadding()) {
            TopBar(
                accounts = accounts,
                active = active,
                unread = unread,
                hasPin = settings.hasPin,
                onSelect = { id -> Store.update { it.copy(active = id) } },
                onEdit = { id -> editingIsNew = false; editing = id },
                onAdd = {
                    val acc = Store.newAccount()
                    Store.update { it.copy(active = acc.id) }
                    editingIsNew = true
                    editing = acc.id
                },
                onTemplates = { showTemplates = true },
                onSettings = { showSettings = true },
                onLock = { Lock.lockNow() },
                onReload = { active?.let { WebPool.reload(it) } },
            )
            Box(Modifier.weight(1f).fillMaxWidth()) {
                AndroidView(
                    factory = {
                        (WebPool.frame.parent as? ViewGroup)?.removeView(WebPool.frame)
                        WebPool.frame
                    },
                    modifier = Modifier.fillMaxSize(),
                )
                if (accounts.isEmpty()) {
                    Welcome(onAdd = {
                        val acc = Store.newAccount()
                        Store.update { it.copy(active = acc.id) }
                        editingIsNew = true
                        editing = acc.id
                    })
                }
            }
        }

        if (locked) {
            LockScreen(
                fingerprint = settings.fingerprint && activity.canUseFingerprint(),
                onFingerprint = { activity.askFingerprint() },
            )
        }
    }

    if (!locked) {
        editing?.let { id ->
            Store.account(id)?.let { acc ->
                AccountEditor(
                    account = acc,
                    isNew = editingIsNew,
                    canMoveLeft = accounts.indexOfFirst { it.id == id } > 0,
                    canMoveRight = accounts.indexOfFirst { it.id == id } < accounts.size - 1,
                    onDismiss = { editing = null },
                )
            } ?: run { editing = null }
        }
        if (showTemplates) {
            TemplatesSheet(activeAccount = active, onDismiss = { showTemplates = false })
        }
        if (showSettings) {
            SettingsDialog(activity = activity, version = updates.installedVersion, onDismiss = { showSettings = false })
        }
        UpdateDialog(
            state = update,
            onInstall = { update.pendingRelease?.let { Lock.openingOwnScreen(); updates.install(it) } },
            onDismiss = updates::dismiss,
        )
    }
}

@Composable
private fun TopBar(
    accounts: List<Account>,
    active: String?,
    unread: Map<String, Int>,
    hasPin: Boolean,
    onSelect: (String) -> Unit,
    onEdit: (String) -> Unit,
    onAdd: () -> Unit,
    onTemplates: () -> Unit,
    onSettings: () -> Unit,
    onLock: () -> Unit,
    onReload: () -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().height(60.dp).background(Bar).padding(start = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LazyRow(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
            contentPadding = PaddingValues(horizontal = 2.dp),
        ) {
            items(accounts, key = { it.id }) { acc ->
                AccountChip(
                    account = acc,
                    selected = acc.id == active,
                    unread = unread[acc.id] ?: 0,
                    onClick = { if (acc.id == active) onEdit(acc.id) else onSelect(acc.id) },
                    onLongClick = { onEdit(acc.id) },
                )
            }
            item {
                IconButton(onClick = onAdd) {
                    Box(
                        Modifier.size(36.dp).border(1.5.dp, Line, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.Add, contentDescription = "Add an account", tint = Muted) }
                }
            }
        }
        if (accounts.isNotEmpty()) {
            IconButton(onClick = onTemplates) {
                Icon(Icons.Outlined.Quickreply, contentDescription = "Quick replies", tint = Ink)
            }
        }
        Box {
            IconButton(onClick = { menu = true }) {
                Icon(Icons.Filled.MoreVert, contentDescription = "Menu", tint = Ink)
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                if (active != null) {
                    DropdownMenuItem(text = { Text("Edit this account") }, onClick = { menu = false; onEdit(active) })
                    DropdownMenuItem(text = { Text("Reload this account") }, onClick = { menu = false; onReload() })
                }
                DropdownMenuItem(text = { Text("Add an account") }, onClick = { menu = false; onAdd() })
                if (hasPin) DropdownMenuItem(text = { Text("Lock now") }, onClick = { menu = false; onLock() })
                DropdownMenuItem(text = { Text("Settings") }, onClick = { menu = false; onSettings() })
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun AccountChip(account: Account, selected: Boolean, unread: Int, onClick: () -> Unit, onLongClick: () -> Unit) {
    val color = Color(account.color)
    Row(
        Modifier
            .clip(RoundedCornerShape(24.dp))
            .background(if (selected) color.copy(alpha = 0.22f) else Color.Transparent)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(start = 4.dp, end = if (selected) 12.dp else 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            Avatar(account, 40.dp, ring = true)
            if (unread > 0) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(start = 0.dp)
                        .background(Accent, RoundedCornerShape(10.dp))
                        .border(1.5.dp, Bar, RoundedCornerShape(10.dp))
                        .padding(horizontal = 5.dp, vertical = 0.dp),
                ) {
                    Text(if (unread > 99) "99+" else unread.toString(), color = Bg, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        if (selected) {
            Spacer(Modifier.size(8.dp))
            Text(
                account.name,
                color = Ink,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 140.dp),
            )
        }
    }
}

/** The account's photo in a circle, or its colour with initials. */
@Composable
fun Avatar(account: Account, size: Dp, ring: Boolean = false) {
    val color = Color(account.color)
    val photo = remember(account.photo) {
        account.photo?.let { runCatching { BitmapFactory.decodeFile(it)?.asImageBitmap() }.getOrNull() }
    }
    val base = Modifier
        .size(size)
        .then(if (ring) Modifier.border(2.dp, color, CircleShape).padding(3.dp) else Modifier)
        .clip(CircleShape)
    if (photo != null) {
        Image(photo, contentDescription = account.name, contentScale = ContentScale.Crop, modifier = base)
    } else {
        Box(base.background(color), contentAlignment = Alignment.Center) {
            Text(
                Rules.initials(account.name),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = (size.value * 0.36f).sp,
            )
        }
    }
}

@Composable
private fun Welcome(onAdd: () -> Unit) {
    Column(
        Modifier.fillMaxSize().background(Bg).verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Image(
            painter = androidx.compose.ui.res.painterResource(R.drawable.ic_launcher_foreground),
            contentDescription = null,
            modifier = Modifier.size(110.dp).clip(RoundedCornerShape(28.dp)).background(Color(0xFF0F7A6E)),
        )
        Spacer(Modifier.height(12.dp))
        Text("Welcome to Multi Chat", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = Ink)
        Spacer(Modifier.height(6.dp))
        Text(
            "Use several WhatsApp accounts in one app, each in its own separate box.",
            color = Muted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        Column(Modifier.widthIn(max = 520.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Step(1, "Tap Add account and give it a name and colour, like “Bulk Bazaar” or “Personal”.")
            Step(
                2,
                "If the account is on another phone, scan the QR code with it: WhatsApp > ⋮ > Linked devices > Link a device.",
            )
            Step(
                3,
                "If the account is on this phone, tap “Log in with phone number” on the WhatsApp page instead, " +
                    "then type the 8-letter code in WhatsApp > Linked devices > Link a device > Link with phone number.",
            )
            Step(4, "Repeat for each account. Every box stays signed in on its own.")
        }
        Spacer(Modifier.height(20.dp))
        Button(onClick = onAdd) { Text("Add account") }
        Spacer(Modifier.height(18.dp))
        Text(
            "Multi Chat opens the official WhatsApp Web for each account. It is not made by or connected with WhatsApp or Meta.",
            color = Muted,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = 420.dp),
        )
    }
}

@Composable
private fun Step(n: Int, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(Modifier.size(24.dp).background(Accent, CircleShape), contentAlignment = Alignment.Center) {
            Text(n.toString(), color = Bg, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
        Spacer(Modifier.size(10.dp))
        Text(text, color = Ink, fontSize = 14.sp)
    }
}

@Composable
private fun UnsupportedScreen() {
    val context = LocalContext.current
    Column(
        Modifier.fillMaxSize().background(Bg).systemBarsPadding().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Please update Android System WebView", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = Ink, textAlign = TextAlign.Center)
        Spacer(Modifier.height(10.dp))
        Text(
            "Multi Chat keeps each account separate with a feature of Android System WebView 110 or newer. " +
                "Update it from the Play Store, then open Multi Chat again.",
            color = Muted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(18.dp))
        Button(onClick = {
            runCatching {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.webview"))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
        }) { Text("Open Play Store") }
    }
}
