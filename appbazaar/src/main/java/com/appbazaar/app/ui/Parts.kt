package com.appbazaar.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.appbazaar.app.data.StoreApp

/** The app's icon picture, or its first letter on its colour when it has no picture. */
@Composable
fun AppIcon(app: StoreApp, size: Dp) {
    Box(
        Modifier.size(size).clip(RoundedCornerShape(size * 0.22f)).background(Color(app.iconColor)),
        contentAlignment = Alignment.Center,
    ) {
        if (app.iconUrl != null) {
            AsyncImage(app.iconUrl, contentDescription = null, modifier = Modifier.size(size), contentScale = ContentScale.Crop)
        } else {
            Text(app.iconLetter, color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.45f).sp)
        }
    }
}

fun actionLabel(action: Action): String = when (action) {
    Action.Install -> "Install"
    Action.Update -> "Update"
    Action.Open -> "Open"
    Action.Website -> "Open website"
    Action.Unavailable -> "Not on Android"
    is Action.Downloading ->
        if (action.progress < 0f) "Downloading…" else "Downloading ${(action.progress * 100).toInt()}%"
}

@Composable
fun DownloadBar(action: Action, modifier: Modifier = Modifier) {
    if (action !is Action.Downloading) return
    if (action.progress < 0f) LinearProgressIndicator(modifier, color = Accent)
    else LinearProgressIndicator({ action.progress }, modifier, color = Accent)
}

fun platformsLabel(app: StoreApp): String = when {
    app.forTv && app.forPhone -> "Phone + TV"
    app.forTv -> "TV"
    app.forPhone -> "Phone"
    else -> app.platforms.joinToString()
}
