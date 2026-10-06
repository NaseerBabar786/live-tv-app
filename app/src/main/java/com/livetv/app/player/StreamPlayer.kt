package com.livetv.app.player

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.livetv.app.data.Channel
import com.livetv.app.data.ChannelRepository
import com.livetv.app.data.MyChannel
import com.livetv.app.data.YouTube

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
            // With many tiles playing, the TV's video chips can run out; tiny previews then
            // fall back to software decoding instead of staying blank.
            setRenderersFactory(DefaultRenderersFactory(context).setEnableDecoderFallback(true))
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
            override fun onPlaybackStateChanged(state: Int) {
                // The owner's channel moves on to whatever its schedule has next.
                if (state == Player.STATE_ENDED && MyChannel.isMine(channel)) {
                    endedUrl = scheduledUrl
                    playScheduled()
                }
            }
        })
    }

    private var channel: Channel? = null
    /** Every (url, mime type) combination to try for the current channel, in order. */
    private var candidates: List<Pair<String, String?>> = emptyList()
    private var attempt = 0

    private val handler = Handler(Looper.getMainLooper())
    private val nextOnSchedule = Runnable { if (MyChannel.isMine(channel)) playScheduled() }
    /** The owner's channel: the video playing, and when (wall clock) its position 0 was. */
    private var scheduledUrl: String? = null
    private var scheduledZero: Long? = null
    /** A video that reached its end early (its length on the website was too long). */
    private var endedUrl: String? = null

    /** Called with a user-facing message when a stream cannot be played; null clears it. */
    var onError: ((String?) -> Unit)? = null

    fun play(channel: Channel) {
        handler.removeCallbacks(nextOnSchedule)
        scheduledUrl = null
        scheduledZero = null
        endedUrl = null
        if (MyChannel.isMine(channel)) {
            this.channel = channel
            playScheduled()
            return
        }
        if (YouTube.isYouTube(channel.url)) {
            // YouTube streams play only in YouTube's player, which opens in full screen.
            stop()
            onError?.invoke("This channel plays in YouTube's player. Open it in full screen to watch.")
            return
        }
        this.channel = channel
        candidates = (listOf(channel.url) + channel.alternates)
            .flatMap { url -> mimeCandidates(url).map { url to it } }
        attempt = 0
        onError?.invoke(null)
        prepareCurrent()
    }

    /** Stops playback and forgets the channel (used by the channel-list preview). */
    fun stop() {
        handler.removeCallbacks(nextOnSchedule)
        channel = null
        candidates = emptyList()
        player.stop()
        player.clearMediaItems()
    }

    fun retry() {
        channel?.let(::play)
    }


    fun release() {
        handler.removeCallbacks(nextOnSchedule)
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
        // The owner's channel joins its video where the schedule is now, like live TV.
        val zero = scheduledZero
        if (zero != null) player.setMediaSource(source, (System.currentTimeMillis() - zero).coerceAtLeast(0))
        else player.setMediaSource(source)
        player.prepare()
        player.play()
    }

    /** Plays what the owner's schedule has on now, and comes back when it moves on. */
    private fun playScheduled() {
        handler.removeCallbacks(nextOnSchedule)
        val nowMs = System.currentTimeMillis()
        when (val now = MyChannel.now(nowMs)) {
            is MyChannel.Now.Playing -> {
                val url = now.video.url
                if (url == endedUrl && now.offsetMs > 0) {
                    // Already over; wait quietly for the next programme.
                    handler.postDelayed(nextOnSchedule, (now.untilMs - nowMs).coerceIn(1_000, 60_000))
                    return
                }
                endedUrl = null
                // Checked at least every minute, so a changed schedule is picked up soon.
                handler.postDelayed(nextOnSchedule, (now.untilMs - nowMs).coerceIn(1_000, 60_000))
                val zero = if (now.video.seconds > 0) nowMs - now.offsetMs else null
                // The same video still on (e.g. the schedule was refreshed): leave it playing.
                if (url == scheduledUrl && zero == scheduledZero && player.playbackState != Player.STATE_IDLE) return
                scheduledUrl = url
                scheduledZero = zero
                candidates = mimeCandidates(url).map { url to it }
                attempt = 0
                onError?.invoke(null)
                prepareCurrent()
            }
            is MyChannel.Now.OffAir -> {
                scheduledUrl = null
                scheduledZero = null
                player.stop()
                player.clearMediaItems()
                val name = channel?.name ?: "This channel"
                val next = now.next?.let { v ->
                    val at = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(now.nextAt ?: nowMs))
                    " Next: ${v.title} at $at."
                }.orEmpty()
                onError?.invoke("$name is off air right now.$next")
                handler.postDelayed(nextOnSchedule, ((now.nextAt ?: Long.MAX_VALUE) - nowMs).coerceIn(1_000, 60_000))
            }
        }
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
