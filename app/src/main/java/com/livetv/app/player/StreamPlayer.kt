package com.livetv.app.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.livetv.app.data.Channel
import com.livetv.app.data.ChannelRepository

/**
 * Wraps ExoPlayer for IPTV-style playback.
 *
 * IPTV URLs often have no file extension, so the stream type cannot always be
 * guessed. For those, HLS is tried first and plain progressive (e.g. MPEG-TS)
 * second. When a channel has backup URLs, each is tried in turn. Live streams
 * that fall behind the live window rejoin at the live edge.
 */
@OptIn(UnstableApi::class)
class StreamPlayer(private val context: Context, preview: Boolean = false) {

    // Previews keep only a few seconds buffered, so a screenful of them fits in a TV's memory.
    val player: ExoPlayer = ExoPlayer.Builder(context).apply {
        if (preview) {
            setLoadControl(
                DefaultLoadControl.Builder()
                    .setBufferDurationsMs(2_000, 6_000, 1_000, 1_000)
                    .setTargetBufferBytes(3 * 1024 * 1024)
                    .setPrioritizeTimeOverSizeThresholds(false)
                    .build()
            )
        }
    }.build().apply {
        playWhenReady = true
        addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) = handleError(error)
        })
    }

    private var channel: Channel? = null
    /** Every (url, mime type) combination to try for the current channel, in order. */
    private var candidates: List<Pair<String, String?>> = emptyList()
    private var attempt = 0

    /** Called with a user-facing message when a stream cannot be played; null clears it. */
    var onError: ((String?) -> Unit)? = null

    fun play(channel: Channel) {
        this.channel = channel
        candidates = (listOf(channel.url) + channel.alternates)
            .flatMap { url -> mimeCandidates(url).map { url to it } }
        attempt = 0
        onError?.invoke(null)
        prepareCurrent()
    }

    /** Stops playback and forgets the channel (used by the channel-list preview). */
    fun stop() {
        channel = null
        candidates = emptyList()
        player.stop()
        player.clearMediaItems()
    }

    fun retry() {
        channel?.let(::play)
    }

    fun release() {
        onError = null
        player.release()
    }

    private fun prepareCurrent() {
        val c = channel ?: return
        val (url, mime) = candidates.getOrNull(attempt) ?: return
        val item = MediaItem.Builder()
            .setUri(url)
            .setMimeType(mime)
            .build()

        val http = DefaultHttpDataSource.Factory()
            .setUserAgent(c.userAgent ?: ChannelRepository.USER_AGENT)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)
        c.referrer?.let { http.setDefaultRequestProperties(mapOf("Referer" to it)) }

        val source = DefaultMediaSourceFactory(DefaultDataSource.Factory(context, http))
            .createMediaSource(item)
        player.setMediaSource(source)
        player.prepare()
        player.play()
    }

    private fun handleError(error: PlaybackException) {
        when {
            error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW -> {
                player.seekToDefaultPosition()
                player.prepare()
            }
            attempt + 1 < candidates.size -> {
                attempt++
                prepareCurrent()
            }
            else -> onError?.invoke(describe(error))
        }
    }

    private fun describe(error: PlaybackException): String = when (error.errorCode) {
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ->
            "Can't reach this channel. Check your internet connection."
        PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS ->
            "The channel's server refused the stream. It may be offline or geo-blocked."
        PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED,
        PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED,
        PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED ->
            "This stream format isn't supported."
        PlaybackException.ERROR_CODE_DRM_UNSPECIFIED,
        PlaybackException.ERROR_CODE_DRM_SCHEME_UNSUPPORTED ->
            "This channel is DRM protected and can't be played."
        else -> "This channel can't be played right now (${error.errorCodeName})."
    }

    private fun mimeCandidates(url: String): List<String?> {
        val path = url.substringBefore('?').substringBefore('#').lowercase()
        return when {
            path.endsWith(".m3u8") || path.endsWith(".m3u") -> listOf(MimeTypes.APPLICATION_M3U8)
            path.endsWith(".mpd") -> listOf(MimeTypes.APPLICATION_MPD)
            path.endsWith(".ts") || path.endsWith(".mp4") || path.endsWith(".mkv") ||
                path.endsWith(".aac") || path.endsWith(".mp3") -> listOf(null)
            else -> listOf(MimeTypes.APPLICATION_M3U8, null)
        }
    }
}
