package com.iqraquran.app.player

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Reads Qaida letters and syllables aloud with the device's own Arabic voice
 * (Google text-to-speech, already on most Android phones and TVs).
 */
class Speaker(context: Context) {

    enum class Status { Starting, Ready, NoArabic }

    private val _status = MutableStateFlow(Status.Starting)
    val status: StateFlow<Status> = _status.asStateFlow()

    /** The utterance being spoken, or null when quiet. */
    private val _speaking = MutableStateFlow<String?>(null)
    val speaking: StateFlow<String?> = _speaking.asStateFlow()

    private var onDone: (() -> Unit)? = null

    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { result ->
        _status.value = if (result == TextToSpeech.SUCCESS && setArabic()) Status.Ready else Status.NoArabic
    }

    init {
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit
            override fun onDone(utteranceId: String?) = finished(utteranceId)
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) = finished(utteranceId)
            override fun onError(utteranceId: String?, errorCode: Int) = finished(utteranceId)
        })
    }

    private fun finished(id: String?) {
        if (id != null && id == _speaking.value) {
            _speaking.value = null
            val callback = onDone
            onDone = null
            callback?.invoke()
        }
    }

    private fun setArabic(): Boolean {
        val r = tts.setLanguage(Locale("ar"))
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) return false
        // A little slower than normal speech, so children can follow.
        tts.setSpeechRate(0.75f)
        return true
    }

    private var counter = 0

    /** Says [text]; [done] runs (on a background thread) when it has finished. */
    fun say(text: String, done: (() -> Unit)? = null) {
        if (_status.value != Status.Ready) return
        val id = "u${++counter}"
        onDone = done
        _speaking.value = id
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id)
    }

    fun stop() {
        onDone = null
        _speaking.value = null
        tts.stop()
    }

    fun release() {
        tts.stop()
        tts.shutdown()
    }
}
