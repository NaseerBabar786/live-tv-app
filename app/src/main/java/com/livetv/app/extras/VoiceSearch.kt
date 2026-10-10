package com.livetv.app.extras

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.livetv.app.ui.Themes
import com.livetv.app.ui.focusGlow
import kotlinx.coroutines.delay

/**
 * Voice search inside NextGen Cable. It listens itself (Android's SpeechRecognizer, as Google's own TV search
 * screens do), so viewers never get Android's "Google or Speech Recognition and Synthesis?" question, and
 * the remote's microphone is used. The owner's VIZIO Google TV, 2026-10-10: Android's speech screen showed
 * a white mic that never turned red, whatever was pressed.
 */
object VoiceSearch {
    /** NextGen Cable can listen by itself on this device. */
    fun canListen(context: Context): Boolean = runCatching { SpeechRecognizer.isRecognitionAvailable(context) }.getOrDefault(false)

    /** Some speech screen can take [speechIntent] (the older way, used only when [canListen] is false). */
    fun hasSpeechScreen(context: Context): Boolean =
        runCatching { context.packageManager.queryIntentActivities(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH), 0).isNotEmpty() }
            .getOrDefault(false)

    /** Show the mic button only where voice search can work. */
    fun available(context: Context): Boolean = canListen(context) || hasSpeechScreen(context)

    /** Android's speech screen, sent straight to Google's when it is there, so there's no app chooser. */
    fun speechIntent(context: Context): Intent {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PROMPT, "Say a channel name")
        val google = GOOGLE_SPEECH.firstOrNull { pkg ->
            runCatching { context.packageManager.queryIntentActivities(Intent(intent).setPackage(pkg), 0).isNotEmpty() }.getOrDefault(false)
        }
        return if (google != null) intent.setPackage(google) else intent
    }

    // Google TV's search app, then the Google app on phones.
    private val GOOGLE_SPEECH = listOf("com.google.android.katniss", "com.google.android.googlequicksearchbox")
}

private enum class Hearing { Asking, Starting, Listening, Thinking, Failed }

/** Listens once and hands what was said to [onSpoken]; Back or Close stops it. Colours follow the theme. */
@Composable
fun VoiceSearchDialog(onSpoken: (String) -> Unit, onDismiss: () -> Unit) {
    val context = LocalContext.current
    var phase by remember { mutableStateOf(Hearing.Asking) }
    var heard by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }
    var level by remember { mutableStateOf(0f) }
    var attempt by remember { mutableIntStateOf(0) }
    val retry = remember { FocusRequester() }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            phase = Hearing.Starting
            attempt++
        } else {
            problem = "NextGen Cable needs the microphone for voice search. Allow it, or use the search button instead."
            phase = Hearing.Failed
        }
    }

    LaunchedEffect(Unit) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            phase = Hearing.Starting
            attempt++
        } else {
            runCatching { permission.launch(Manifest.permission.RECORD_AUDIO) }.onFailure {
                problem = "Voice search isn't available on this TV. Use the search button instead."
                phase = Hearing.Failed
            }
        }
    }

    // One recognizer per try; destroyed when the try ends or the dialog closes.
    DisposableEffect(attempt) {
        if (attempt == 0) return@DisposableEffect onDispose { }
        heard = ""
        val recognizer = runCatching { SpeechRecognizer.createSpeechRecognizer(context) }.getOrNull()
        if (recognizer == null) {
            problem = "Voice search isn't available on this TV. Use the search button instead."
            phase = Hearing.Failed
            return@DisposableEffect onDispose { }
        }
        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { phase = Hearing.Listening }
            override fun onBeginningOfSpeech() { phase = Hearing.Listening }
            override fun onRmsChanged(rmsdB: Float) { level = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f) }
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() { phase = Hearing.Thinking; level = 0f }
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onPartialResults(partialResults: Bundle?) {
                partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { heard = it }
            }
            override fun onResults(results: Bundle?) {
                val said = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (said.isBlank()) {
                    problem = "I didn't catch that."
                    phase = Hearing.Failed
                } else {
                    onDismiss()
                    onSpoken(said)
                }
            }
            override fun onError(error: Int) {
                problem = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "I didn't catch that."
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "NextGen Cable needs the microphone for voice search."
                    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> "Voice search needs the internet. Check the connection."
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "The microphone is busy. Try again."
                    else -> "Voice search didn't work this time."
                }
                phase = Hearing.Failed
                level = 0f
            }
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        runCatching { recognizer.startListening(intent) }.onFailure {
            problem = "Voice search didn't work this time."
            phase = Hearing.Failed
        }
        onDispose { runCatching { recognizer.cancel(); recognizer.destroy() } }
    }

    LaunchedEffect(phase) {
        if (phase == Hearing.Failed) runCatching { delay(100); retry.requestFocus() }
    }

    val palette = Themes.current
    val listening = phase == Hearing.Listening
    val pulse by animateFloatAsState(if (listening) 1f + level * 0.25f else 1f, label = "micPulse")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Voice search") },
        text = {
            Column(
                Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    Modifier
                        .size(88.dp)
                        .scale(pulse)
                        .background(if (listening) MIC_RED else palette.surfaceVariant, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Mic, contentDescription = null, tint = if (listening) Color.White else palette.muted, modifier = Modifier.size(44.dp))
                }
                Text(
                    when (phase) {
                        Hearing.Asking, Hearing.Starting -> "Getting the microphone ready…"
                        Hearing.Listening -> heard.ifBlank { "Listening… say a channel name" }
                        Hearing.Thinking -> heard.ifBlank { "One moment…" }
                        Hearing.Failed -> problem
                    },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = if (heard.isNotBlank() && phase != Hearing.Failed) FontWeight.Bold else FontWeight.Normal,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 8.dp),
                )
            }
        },
        confirmButton = {
            if (phase == Hearing.Failed) {
                TextButton(
                    onClick = {
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            phase = Hearing.Starting
                            attempt++
                        } else {
                            runCatching { permission.launch(Manifest.permission.RECORD_AUDIO) }
                        }
                    },
                    modifier = Modifier.focusRequester(retry).focusGlow(),
                ) { Text("Try again") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Close") } },
    )
}

// "Listening" red, the colour people know from Google's own mic; only meaning, not decoration.
private val MIC_RED = Color(0xFFE53935)
