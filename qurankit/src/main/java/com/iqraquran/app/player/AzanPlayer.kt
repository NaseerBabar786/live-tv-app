package com.iqraquran.app.player

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import com.iqraquran.app.data.AzanSettings
import com.iqraquran.app.data.AzanVoice

/**
 * Plays the Azan (or the short chime). While it plays, other sound on the device (a TV channel, music)
 * is asked to pause or go quiet (audio focus), and gets its turn back afterwards.
 */
class AzanPlayer(context: Context) {

    private val app = context.applicationContext
    private val audio = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var player: MediaPlayer? = null
    private var ringtone: android.media.Ringtone? = null
    private val focus = AudioManager.OnAudioFocusChangeListener { }

    val playing: Boolean get() = runCatching { player?.isPlaying == true }.getOrDefault(false) || ringtone?.isPlaying == true

    /** Plays [voice] at [volume] (10-100); its downloaded copy when there is one. [onDone] runs when it ends. */
    fun playAzan(settings: AzanSettings, voice: AzanVoice?, volume: Int, onDone: () -> Unit) {
        stop()
        val source = voice?.let { settings.localFile(it)?.path ?: it.url }
        if (source == null) {
            playChime(); onDone(); return
        }
        requestFocus(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        val v = volume / 100f
        player = runCatching {
            MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build(),
                )
                setDataSource(source)
                setVolume(v, v)
                setOnCompletionListener { stop(); onDone() }
                setOnErrorListener { _, _, _ ->
                    // No recording (offline and not downloaded yet): at least the chime.
                    stop(); playChime(); onDone(); true
                }
                setOnPreparedListener { it.start() }
                prepareAsync()
            }
        }.getOrElse { playChime(); onDone(); null }
    }

    /** The device's own notification sound. */
    fun playChime() {
        runCatching {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            ringtone = RingtoneManager.getRingtone(app, uri)?.also { it.play() }
        }
    }

    fun stop() {
        runCatching { player?.stop() }
        runCatching { player?.release() }
        player = null
        runCatching { ringtone?.stop() }
        ringtone = null
        @Suppress("DEPRECATION")
        audio.abandonAudioFocus(focus)
    }

    @Suppress("DEPRECATION")
    private fun requestFocus(kind: Int) {
        audio.requestAudioFocus(focus, AudioManager.STREAM_ALARM, kind)
    }
}
