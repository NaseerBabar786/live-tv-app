package com.claudenotes.app

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.speech.RecognizerIntent
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.claudenotes.app.data.Kind
import com.claudenotes.app.data.Note
import com.claudenotes.app.data.Outgoing
import com.claudenotes.app.ui.EditNoteDialog
import com.claudenotes.app.ui.NotesScreen
import com.claudenotes.app.ui.NotesTheme
import com.claudenotes.app.ui.NotesViewModel
import com.claudenotes.app.ui.SendChoiceDialog
import com.claudenotes.app.ui.SettingsDialog
import com.claudenotes.app.ui.UpdateDialog
import com.claudenotes.app.ui.UpdateViewModel
import com.claudenotes.app.ui.pendingRelease
import com.claudenotes.app.ui.VoiceInput
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val notes: NotesViewModel by viewModels()
    private val updates: UpdateViewModel by viewModels()
    private val voice by lazy { VoiceInput(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (CrashGuard.start(this)) return
        enableEdgeToEdge()
        if (savedInstanceState == null) takeSharedText(intent)
        setContent {
            NotesTheme {
                val state by notes.state.collectAsStateWithLifecycle()
                val snackbar = remember { SnackbarHostState() }
                val scope = rememberCoroutineScope()
                var draft by rememberSaveable { mutableStateOf("") }
                var editing by remember { mutableStateOf<Note?>(null) }
                var settings by rememberSaveable { mutableStateOf(false) }
                var choices by remember { mutableStateOf<List<Outgoing>>(emptyList()) }
                var voiceTopic by rememberSaveable { mutableStateOf("") }

                fun say(text: String) = scope.launch { snackbar.showSnackbar(text) }

                fun saveVoice(text: String) {
                    if (text.isNotBlank()) {
                        notes.add(Kind.VOICE, text, voiceTopic)
                        say("Voice note saved")
                    }
                }

                // A phone without in-app speech recognition: use Google's speech screen instead.
                val speechScreen = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
                    saveVoice(r.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull().orEmpty())
                }
                fun startVoice() {
                    if (voice.available) {
                        voice.start(state.language)
                    } else {
                        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                            .putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak your note")
                        if (state.language.isNotEmpty()) i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, state.language)
                        runCatching { speechScreen.launch(i) }
                            .onFailure { say("This phone has no speech to text. Install the Google app to use voice notes.") }
                    }
                }
                val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
                    if (ok) startVoice() else say("Voice notes need the microphone. You can still type notes.")
                }

                // An error stopped the recording: keep what was heard and say why.
                LaunchedEffect(voice.error) {
                    val message = voice.error ?: return@LaunchedEffect
                    saveVoice(voice.takeLeftover())
                    snackbar.showSnackbar(message)
                    voice.error = null
                }

                fun send(o: Outgoing) {
                    if (deliver(o)) notes.markSent(o.noteIds)
                    choices = choices.filterNot { it == o }
                }

                NotesScreen(
                    state = state,
                    voice = voice,
                    snackbar = snackbar,
                    draft = draft,
                    onDraft = { draft = it },
                    onAdd = notes::add,
                    onToggle = notes::toggleSelected,
                    onEdit = { editing = it },
                    onRestore = notes::restore,
                    onClearSent = notes::clearSent,
                    onMic = { topic ->
                        if (voice.listening) {
                            saveVoice(voice.stop())
                        } else {
                            voiceTopic = topic
                            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
                                PackageManager.PERMISSION_GRANTED
                            ) startVoice() else micPermission.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    },
                    onSend = {
                        val plan = notes.plan()
                        if (plan.size == 1) send(plan.first()) else if (plan.size > 1) choices = plan
                    },
                    onSettings = { settings = true },
                    version = updates.installedVersion,
                )

                editing?.let { note ->
                    EditNoteDialog(
                        note = note,
                        topics = state.topics.map { it.name },
                        onSave = { notes.edit(it); editing = null },
                        onDelete = { notes.delete(note.id); editing = null },
                        onDismiss = { editing = null },
                    )
                }
                if (settings) {
                    SettingsDialog(
                        topics = state.topics,
                        defaultLink = state.defaultLink,
                        language = state.language,
                        onSave = { renames, topics, link, language ->
                            renames.forEach { (from, to) -> notes.renameTopic(from, to) }
                            notes.saveSettings(topics, link, language)
                            settings = false
                        },
                        onDismiss = { settings = false },
                    )
                }
                if (choices.isNotEmpty()) {
                    SendChoiceDialog(choices, onSend = ::send, onDismiss = { choices = emptyList() })
                }

                val update by updates.update.collectAsStateWithLifecycle()
                UpdateDialog(
                    state = update,
                    onInstall = { update.pendingRelease?.let { updates.install(it) } },
                    onDismiss = updates::dismiss,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        takeSharedText(intent)
    }

    override fun onStop() {
        // Leaving the app while recording: keep what was heard as a voice note.
        if (voice.listening) {
            val text = voice.stop()
            if (text.isNotBlank()) notes.add(Kind.VOICE, text, notes.state.value.topics.first().name)
        }
        super.onStop()
    }

    /** Text shared into the app from another app becomes an idea. */
    private fun takeSharedText(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND) return
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
        if (text.isEmpty()) return
        val topic = notes.state.value.topics.let { t -> t.firstOrNull { it.name == "Other" } ?: t.first() }.name
        notes.add(Kind.IDEA, text, topic)
        Toast.makeText(this, "Saved as an idea", Toast.LENGTH_SHORT).show()
        setIntent(Intent(this, MainActivity::class.java))
    }

    /**
     * Copies the message and opens Claude: the project chat when the topic has a link,
     * otherwise the Claude app's own share screen (or any app if Claude isn't installed).
     * Returns false when nothing could be opened.
     */
    private fun deliver(o: Outgoing): Boolean {
        val clipboard = getSystemService(ClipboardManager::class.java)
        clipboard?.setPrimaryClip(ClipData.newPlainText("Notes for Claude", o.text))
        val opened = if (o.link.isNotEmpty()) {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(o.link))) }.isSuccess
        } else {
            val share = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, o.text)
            try {
                startActivity(Intent(share).setPackage(CLAUDE_PACKAGE))
                true
            } catch (e: ActivityNotFoundException) {
                runCatching { startActivity(Intent.createChooser(share, "Send notes to")) }.isSuccess
            }
        }
        Toast.makeText(
            this,
            if (!opened) "Copied. Open Claude and paste it into your project chat."
            else if (o.link.isNotEmpty()) "Copied. Paste it into the chat and send."
            else "Copied too, in case you want to paste it into a project chat.",
            Toast.LENGTH_LONG,
        ).show()
        return opened
    }

    companion object {
        private const val CLAUDE_PACKAGE = "com.anthropic.claude"
    }
}
