package com.appbazaar.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** The two install guides, the same steps as apps.bulkbazaar.ca/guides/. */
@Composable
fun HelpScreen(isTv: Boolean, onBack: () -> Unit, onPermission: () -> Unit) {
    val back = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { back.requestFocus() } }
    val pad = if (isTv) 48.dp else 16.dp
    Column(
        Modifier.fillMaxSize().background(Bg).verticalScroll(rememberScrollState())
            .padding(horizontal = pad, vertical = if (isTv) 28.dp else 12.dp),
    ) {
        FocusOutlinedButton(onClick = onBack, modifier = Modifier.focusRequester(back)) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
            Spacer(Modifier.width(6.dp))
            Text("All apps")
        }
        Spacer(Modifier.height(18.dp))
        Text("How to install apps", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(
            "Press Install on any app. App Bazaar downloads it and Android asks you to confirm. " +
                "The first time, Android asks you to allow App Bazaar to install apps: turn it on and come back.",
            color = Muted, fontSize = 15.sp, modifier = Modifier.widthIn(max = 900.dp),
        )
        Spacer(Modifier.height(12.dp))
        FocusButton(onClick = onPermission) { Text("Allow App Bazaar to install apps") }

        Guide(
            "On a TV (Google TV, Android TV, Fire TV)",
            listOf(
                "Get App Bazaar on the TV once: install the Downloader app (by AFTVnews) from the TV's app store, open it and type tv.bulkbazaar.ca/bazaar, then press Go.",
                "Allow Downloader to install apps: Settings > System > About, press OK on \"Android TV OS build\" 7 times; then Settings > Apps > Security & restrictions > Unknown sources and turn on Downloader. On Fire TV: Settings > My Fire TV > Developer options > Install unknown apps.",
                "Press Install when the download finishes. If Play Protect warns you, choose Install anyway, then Open.",
                "In App Bazaar, move to an app with the arrows on the remote and press OK on Install. Allow App Bazaar to install apps when asked, then press Install again on the next screen.",
                "Apps you install show Open. When a newer version is out they show Update, and the Updates tab lists them.",
            ),
        )
        Guide(
            "On an Android phone or tablet",
            listOf(
                "Get App Bazaar once: open apps.bulkbazaar.ca in Chrome on the phone and tap Install on App Bazaar.",
                "Open the downloaded file. If Chrome says it can't install apps, tap Settings, turn on Allow from this source and go back.",
                "Tap Install. If Play Protect warns you, tap More details > Install anyway, then Open.",
                "In App Bazaar, tap Install on any app. Allow App Bazaar to install apps the first time, then tap Install.",
                "Come back any time: Update shows on apps that have a newer version.",
            ),
        )
        Spacer(Modifier.height(18.dp))
        Text(
            "Full guides with pictures: apps.bulkbazaar.ca/guides/tv.html and apps.bulkbazaar.ca/guides/phone.html",
            color = Muted, fontSize = 13.sp,
        )
    }
}

@Composable
private fun Guide(title: String, steps: List<String>) {
    Spacer(Modifier.height(26.dp))
    Text(title, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Accent)
    steps.forEachIndexed { i, s ->
        Spacer(Modifier.height(10.dp))
        Row(Modifier.widthIn(max = 900.dp)) {
            Text("${i + 1}.", fontWeight = FontWeight.Bold, modifier = Modifier.width(28.dp))
            Text(s, color = Color(0xFFDCE3EA), fontSize = 15.sp, lineHeight = 22.sp)
        }
    }
}
