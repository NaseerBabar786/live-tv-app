package com.livecam.app.player

import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.livecam.app.data.Camera

/**
 * Live video for one camera. The player lives as long as this composable is on screen.
 * [preview] tiles play muted and prefer the camera's lighter substream.
 */
@OptIn(UnstableApi::class)
@Composable
fun CameraVideo(
    camera: Camera,
    preview: Boolean,
    muted: Boolean,
    onStatus: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val cameraPlayer = remember(camera, preview) { CameraPlayer(context, preview) }

    DisposableEffect(cameraPlayer) {
        cameraPlayer.onStatus = onStatus
        cameraPlayer.play(camera)
        onDispose { cameraPlayer.release() }
    }
    cameraPlayer.setMuted(preview || muted)

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            PlayerView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                useController = false
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                setShutterBackgroundColor(android.graphics.Color.BLACK)
                // Tiles and remote focus are handled by Compose, not the view.
                isFocusable = false
                isFocusableInTouchMode = false
            }
        },
        update = { it.player = cameraPlayer.player },
    )
}
