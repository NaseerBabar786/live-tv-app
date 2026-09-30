package com.livecam.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.livecam.app.data.Camera
import com.livecam.app.player.CameraVideo

/**
 * One camera full screen with sound. Swipe left/right on a phone, or press Up/Down or
 * Channel Up/Down on a TV remote, to go to the next camera.
 */
@Composable
fun LiveViewScreen(
    camera: Camera,
    position: String,
    onBack: () -> Unit,
    onStep: (Int) -> Unit,
    onEdit: () -> Unit,
) {
    BackHandler(onBack = onBack)
    var muted by rememberSaveable { mutableStateOf(false) }
    var status by remember(camera.id) { mutableStateOf<String?>(null) }
    val backFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { backFocus.requestFocus() } }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(Unit) {
                var dragged = 0f
                detectHorizontalDragGestures(
                    onDragStart = { dragged = 0f },
                    onDragEnd = {
                        if (dragged < -120f) onStep(1) else if (dragged > 120f) onStep(-1)
                    },
                ) { _, amount -> dragged += amount }
            }
    ) {
        key(camera.id) {
            CameraVideo(
                camera = camera,
                preview = false,
                muted = muted,
                onStatus = { status = it },
                modifier = Modifier.fillMaxSize(),
            )
        }

        Row(
            Modifier
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color(0xCC000000), Color.Transparent)))
                .safeDrawingPadding()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = onBack,
                modifier = Modifier.focusRequester(backFocus).focusRing(CircleShape),
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
            }
            Spacer(Modifier.width(4.dp))
            LiveBadge()
            Spacer(Modifier.width(10.dp))
            Text(
                camera.name.ifBlank { "Camera" },
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(position, color = Color(0xFFB0B8C4))
            Spacer(Modifier.width(8.dp))
            IconButton(onClick = { muted = !muted }, modifier = Modifier.focusRing(CircleShape)) {
                Icon(
                    if (muted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp,
                    contentDescription = if (muted) "Unmute" else "Mute",
                    tint = Color.White,
                )
            }
            IconButton(onClick = onEdit, modifier = Modifier.focusRing(CircleShape)) {
                Icon(Icons.Default.Edit, contentDescription = "Edit camera", tint = Color.White)
            }
        }

        status?.let {
            Text(
                it,
                color = Color.White,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .align(Alignment.Center)
                    .background(Color(0x99000000), CircleShape)
                    .padding(horizontal = 20.dp, vertical = 10.dp),
            )
        }
    }
}
