package com.livecam.app.player

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.rtsp.RtspMediaSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.livecam.app.data.Camera
import com.livecam.app.data.StreamUrls

/**
 * ExoPlayer set up for live cameras: small buffers so the picture stays close to real time,
 * RTSP (over TCP by default) or HTTP/HLS, and automatic reconnect when a camera drops.
 */
@OptIn(UnstableApi::class)
class CameraPlayer(
    private val context: Context,
    private val preview: Boolean,
) {
    val player: ExoPlayer = ExoPlayer.Builder(context)
        .setLoadControl(
            DefaultLoadControl.Builder()
                .setBufferDurationsMs(500, 3_000, 250, 500)
                .setPrioritizeTimeOverSizeThresholds(true)
                .build()
        )
        .build()
        .apply {
            playWhenReady = true
            volume = if (preview) 0f else 1f
            addListener(object : Player.Listener {
                override fun onPlayerError(error: PlaybackException) = handleError(error)
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY) {
                        retries = 0
                        onStatus?.invoke(null)
                    }
                }
            })
        }

    /** A short message while a camera is unreachable, null once the picture is back. */
    var onStatus: ((String?) -> Unit)? = null

    private val handler = Handler(Looper.getMainLooper())
    private var camera: Camera? = null
    private var retries = 0
    private var released = false

    fun play(camera: Camera) {
        this.camera = camera
        retries = 0
        handler.removeCallbacksAndMessages(null)
        prepare()
    }

    fun setMuted(muted: Boolean) {
        player.volume = if (muted) 0f else 1f
    }

    fun release() {
        released = true
        onStatus = null
        handler.removeCallbacksAndMessages(null)
        player.release()
    }

    private fun prepare() {
        val cam = camera ?: return
        val uri = if (preview) cam.previewUri() else cam.liveUri()
        if (uri.isBlank()) {
            onStatus?.invoke("No stream address set")
            return
        }
        val item = MediaItem.fromUri(uri)
        val source = if (StreamUrls.isRtsp(uri)) {
            RtspMediaSource.Factory()
                .setForceUseRtpTcp(cam.rtspOverTcp)
                .setTimeoutMs(8_000)
                .createMediaSource(item)
        } else {
            val http = DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(8_000)
                .setReadTimeoutMs(15_000)
            DefaultMediaSourceFactory(DefaultDataSource.Factory(context, http)).createMediaSource(item)
        }
        player.setMediaSource(source)
        player.prepare()
        player.play()
    }

    private fun handleError(error: PlaybackException) {
        if (released) return
        if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
            player.seekToDefaultPosition()
            player.prepare()
            return
        }
        onStatus?.invoke(describe(error))
        // Cameras reboot and Wi-Fi drops; keep trying, backing off to every 30 seconds.
        val delay = (2_000L shl retries.coerceAtMost(4)).coerceAtMost(30_000L)
        retries++
        handler.postDelayed({ if (!released) prepare() }, delay)
    }

    private fun describe(error: PlaybackException): String = when (error.errorCode) {
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ->
            "Can't reach the camera. Reconnecting…"
        PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS ->
            "The camera refused the stream. Check the username and password."
        PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED,
        PlaybackException.ERROR_CODE_DECODER_INIT_FAILED ->
            "This device can't decode the camera's video. Try the H.264 substream."
        else -> "Camera offline (${error.errorCodeName}). Reconnecting…"
    }
}
