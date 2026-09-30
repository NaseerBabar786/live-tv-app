package com.livecam.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.livecam.app.data.Camera
import com.livecam.app.player.CameraVideo

/** Home screen: every camera playing live in a grid, like the Wyze home page. */
@Composable
fun CameraGridScreen(
    cameras: List<Camera>,
    onWatch: (Camera) -> Unit,
    onEdit: (Camera) -> Unit,
    onAdd: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .safeDrawingPadding()
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.Videocam, contentDescription = null, tint = LiveRed)
            Spacer(Modifier.width(10.dp))
            Text("Live Cam", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            if (cameras.isNotEmpty()) {
                Button(onClick = onAdd, modifier = Modifier.focusRing(CircleShape)) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text("Add camera")
                }
            }
        }

        if (cameras.isEmpty()) {
            EmptyState(onAdd)
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 300.dp),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                items(cameras, key = { it.id }) { camera ->
                    CameraTile(camera, onClick = { onWatch(camera) }, onEdit = { onEdit(camera) })
                }
            }
        }
    }
}

@Composable
private fun CameraTile(camera: Camera, onClick: () -> Unit, onEdit: () -> Unit) {
    var status by remember(camera) { mutableStateOf<String?>(null) }
    Box(
        Modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .focusRing()
            .clip(TileShape)
            .background(Color.Black)
            .clickable(onClick = onClick)
    ) {
        CameraVideo(
            camera = camera,
            preview = true,
            muted = true,
            onStatus = { status = it },
            modifier = Modifier.fillMaxSize(),
        )
        // Name and LIVE badge along the bottom, over a fade so they read on bright video.
        Row(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xCC000000))))
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LiveBadge()
            Spacer(Modifier.width(8.dp))
            Text(
                camera.name.ifBlank { "Camera" },
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onEdit, modifier = Modifier.size(36.dp).focusRing(CircleShape)) {
                Icon(Icons.Default.Edit, contentDescription = "Edit ${camera.name}", tint = Color.White)
            }
        }
        status?.let {
            Text(
                it,
                color = Color.White,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.Center).padding(16.dp),
            )
        }
    }
}

@Composable
fun LiveBadge() {
    Row(
        Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(LiveRed)
            .padding(horizontal = 6.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(Color.White))
        Spacer(Modifier.width(4.dp))
        Text("LIVE", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun EmptyState(onAdd: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Default.Videocam, contentDescription = null, tint = LiveRed, modifier = Modifier.size(64.dp))
        Spacer(Modifier.size(16.dp))
        Text("No cameras yet", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.size(8.dp))
        Text(
            "Add your CCTV camera or NVR with its IP address. Most Hikvision, Dahua, Reolink, " +
                "Tapo and ONVIF cameras work over RTSP.",
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.widthIn(max = 420.dp),
        )
        Spacer(Modifier.size(24.dp))
        Button(onClick = onAdd, modifier = Modifier.focusRing(CircleShape)) {
            Icon(Icons.Default.Add, contentDescription = null)
            Spacer(Modifier.width(6.dp))
            Text("Add camera")
        }
    }
}
