package com.claudenotes.app.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Turns speech into text with the phone's own speech recognition, for as long as the user
 * keeps the microphone on. Android stops listening after each pause, so this starts it again
 * and keeps adding to [heard] until [stop] is called.
 */
class VoiceInput(context: Context) {

    private val appContext = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var language: String = ""
    private var retries = 0

    /** Text recognised so far in this recording. */
    var heard by mutableStateOf("")
        private set

    /** The words being recognised right now, before Android settles on them. */
    var partial by mutableStateOf("")
        private set

    var listening by mutableStateOf(false)
        private set

    var error by mutableStateOf<String?>(null)

    val available: Boolean get() = SpeechRecognizer.isRecognitionAvailable(appContext)

    /** Everything heard, including the words still being recognised. */
    val text: String get() = listOf(heard, partial).filter { it.isNotBlank() }.joinToString(" ")

    fun start(language: String) {
        this.language = language
        heard = ""
        partial = ""
        error = null
        retries = 0
        listening = true
        listen()
    }

    /** Stops listening and returns everything that was heard. */
    fun stop(): String {
        val result = text.trim()
        listening = false
        handler.removeCallbacksAndMessages(null)
        recognizer?.run { runCatching { cancel() }; destroy() }
        recognizer = null
        heard = ""
        partial = ""
        return result
    }

    /** Text kept after an error stopped the recording; empty once taken. */
    fun takeLeftover(): String = heard.trim().also { heard = "" }

    private fun listen() {
        if (!listening) return
        val r = recognizer ?: SpeechRecognizer.createSpeechRecognizer(appContext).also {
            it.setRecognitionListener(listener)
            recognizer = it
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L)
        if (language.isNotEmpty()) intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
        runCatching { r.startListening(intent) }.onFailure { fail("Speech to text could not start.") }
    }

    private fun restartSoon(fresh: Boolean = false) {
        if (!listening) return
        if (fresh) {
            if (++retries > 5) return fail("Speech to text is busy. Try again in a moment.")
            recognizer?.destroy()
            recognizer = null
        }
        handler.postDelayed({ listen() }, if (fresh) 400L else 150L)
    }

    private fun fail(message: String) {
        error = message
        val keep = text.trim()
        stop()
        heard = keep
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) = Unit
        override fun onBeginningOfSpeech() {
            retries = 0
        }
        override fun onRmsChanged(rmsdB: Float) = Unit
        override fun onBufferReceived(buffer: ByteArray?) = Unit
        override fun onEndOfSpeech() = Unit
        override fun onEvent(eventType: Int, params: Bundle?) = Unit

        override fun onPartialResults(partialResults: Bundle?) {
            partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull().orEmpty()
        }

        override fun onResults(results: Bundle?) {
            val best = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
            if (best.isNotBlank()) heard = listOf(heard, best).filter { it.isNotBlank() }.joinToString(" ")
            partial = ""
            restartSoon()
        }

        override fun onError(code: Int) {
            if (!listening) return
            when (code) {
                // Silence or nothing understood: keep listening until the user taps stop.
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
                    partial = ""
                    restartSoon()
                }
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY, SpeechRecognizer.ERROR_CLIENT -> restartSoon(fresh = true)
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                    fail("Allow the microphone for Notes for Claude in the phone's settings.")
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER ->
                    fail("Speech to text needs the internet (or the offline language download in the phone's settings).")
                else -> fail("Speech to text stopped (error $code). What was heard is kept.")
            }
        }
    }
}
