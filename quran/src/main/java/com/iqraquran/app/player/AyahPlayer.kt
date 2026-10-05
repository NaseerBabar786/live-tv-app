package com.iqraquran.app.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import java.io.File
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Plays a list of ayahs one after another, each its own MP3, with an optional pause after
 * each one (time for a child to repeat it). Audio is cached on the device, so repeating an
 * ayah for Hifz, or playing a surah again, needs no new download.
 */
@OptIn(UnstableApi::class)
class AyahPlayer(context: Context) {

    /** One thing to play. [label] is shown on screen, e.g. "2 / 5" for a Hifz repeat. */
    data class Track(val surah: Int, val ayah: Int, val url: String, val label: String = "")

    private val player: ExoPlayer = ExoPlayer.Builder(context.applicationContext)
        .setMediaSourceFactory(DefaultMediaSourceFactory(cacheFactory(context)))
        .build()

    private val scope = MainScope()
    private var gapJob: Job? = null
    private var queue: List<Track> = emptyList()
    private var gapMs = 0L
    private var onFinished: (() -> Unit)? = null

    private val _current = MutableStateFlow<Pair<Int, Track>?>(null)
    /** Index in the queue and track now playing, or null when stopped. */
    val current: StateFlow<Pair<Int, Track>?> = _current.asStateFlow()

    private val _playing = MutableStateFlow(false)
    val playing: StateFlow<Boolean> = _playing.asStateFlow()

    private val _error = MutableStateFlow(false)
    val error: StateFlow<Boolean> = _error.asStateFlow()

    init {
        player.addListener(object : Player.Listener {
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                publishCurrent()
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                // A gap between ayahs still counts as playing.
                _playing.value = isPlaying || gapJob?.isActive == true
            }

            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                if (!playWhenReady && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM) {
                    // Paused at the end of an ayah: wait, then go on.
                    gapJob?.cancel()
                    gapJob = scope.launch {
                        _playing.value = true
                        delay(gapMs)
                        if (player.hasNextMediaItem()) {
                            player.seekToNextMediaItem()
                            player.play()
                        } else {
                            finish()
                        }
                    }
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) finish()
            }

            override fun onPlayerError(error: PlaybackException) {
                _error.value = true
                stop()
            }
        })
    }

    private fun publishCurrent() {
        val i = player.currentMediaItemIndex
        _current.value = queue.getOrNull(i)?.let { i to it }
    }

    /** Plays [tracks] from [startIndex], pausing [gapMs] after each; [onDone] runs after the last. */
    fun play(tracks: List<Track>, startIndex: Int = 0, gapMs: Long = 0, onDone: (() -> Unit)? = null) {
        gapJob?.cancel()
        if (tracks.isEmpty()) return
        queue = tracks
        this.gapMs = gapMs
        onFinished = onDone
        _error.value = false
        player.pauseAtEndOfMediaItems = gapMs > 0
        player.setMediaItems(
            tracks.map { MediaItem.Builder().setUri(it.url).setMediaId("${it.surah}:${it.ayah}").build() },
            startIndex.coerceIn(0, tracks.lastIndex),
            0L,
        )
        player.prepare()
        player.play()
        publishCurrent()
    }

    fun togglePause() {
        if (queue.isEmpty()) return
        if (gapJob?.isActive == true) {
            gapJob?.cancel()
            _playing.value = false
            return
        }
        if (player.isPlaying) {
            player.pause()
        } else {
            if (player.playbackState == Player.STATE_ENDED || player.playbackState == Player.STATE_IDLE) {
                player.prepare()
            }
            // Resuming after a paused gap moves on to the next ayah.
            if (player.duration > 0 && player.currentPosition >= player.duration - 50 && player.hasNextMediaItem()) {
                player.seekToNextMediaItem()
            }
            player.play()
        }
    }

    private fun finish() {
        gapJob?.cancel()
        _playing.value = false
        _current.value = null
        val done = onFinished
        onFinished = null
        queue = emptyList()
        player.stop()
        player.clearMediaItems()
        done?.invoke()
    }

    fun stop() {
        onFinished = null
        gapJob?.cancel()
        player.stop()
        player.clearMediaItems()
        queue = emptyList()
        _playing.value = false
        _current.value = null
    }

    fun release() {
        scope.cancel()
        player.release()
    }

    private companion object {
        private var cache: SimpleCache? = null

        /** One cache for the whole app (Media3 allows only one per folder). Up to 300 MB of recitations. */
        fun cacheFactory(context: Context): CacheDataSource.Factory {
            val c = cache ?: SimpleCache(
                File(context.cacheDir, "recitations"),
                LeastRecentlyUsedCacheEvictor(300L * 1024 * 1024),
                StandaloneDatabaseProvider(context.applicationContext),
            ).also { cache = it }
            val http = DefaultHttpDataSource.Factory()
                .setUserAgent("IqraQuran-Android")
                .setAllowCrossProtocolRedirects(true)
            return CacheDataSource.Factory()
                .setCache(c)
                .setUpstreamDataSourceFactory(DefaultDataSource.Factory(context.applicationContext, http))
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        }
    }
}
