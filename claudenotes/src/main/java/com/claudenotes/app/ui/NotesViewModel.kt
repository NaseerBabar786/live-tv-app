package com.claudenotes.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.claudenotes.app.data.Kind
import com.claudenotes.app.data.Note
import com.claudenotes.app.data.NoteStore
import com.claudenotes.app.data.Outgoing
import com.claudenotes.app.data.SendPlan
import com.claudenotes.app.data.Topic
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Holds the notes and topics, and saves every change to the phone straight away. */
class NotesViewModel(app: Application) : AndroidViewModel(app) {

    private val store = NoteStore(app)

    private val _state = MutableStateFlow(store.load())
    val state: StateFlow<NoteStore.Saved> = _state.asStateFlow()

    /** Notes still waiting to go to Claude and ticked for the next send. */
    fun ready(saved: NoteStore.Saved = _state.value): List<Note> =
        saved.notes.filter { it.sentAt == null && it.selected }

    private fun change(block: (NoteStore.Saved) -> NoteStore.Saved) {
        _state.update(block)
        val snapshot = _state.value
        viewModelScope.launch(Dispatchers.IO) { runCatching { store.save(snapshot) } }
    }

    fun add(kind: Kind, text: String, topic: String) {
        val clean = text.trim()
        if (clean.isEmpty()) return
        val now = System.currentTimeMillis()
        change { s ->
            val id = maxOf(now, (s.notes.maxOfOrNull { it.id } ?: 0L) + 1)
            s.copy(notes = s.notes + Note(id, kind, clean, topic, now))
        }
    }

    fun edit(note: Note) = change { s -> s.copy(notes = s.notes.map { if (it.id == note.id) note else it }) }

    fun delete(id: Long) = change { s -> s.copy(notes = s.notes.filterNot { it.id == id }) }

    fun toggleSelected(id: Long) =
        change { s -> s.copy(notes = s.notes.map { if (it.id == id) it.copy(selected = !it.selected) else it }) }

    /** Puts a sent note back in the lists so it goes with the next send. */
    fun restore(id: Long) =
        change { s -> s.copy(notes = s.notes.map { if (it.id == id) it.copy(sentAt = null, selected = true) else it }) }

    fun clearSent() = change { s -> s.copy(notes = s.notes.filter { it.sentAt == null }) }

    fun markSent(ids: Collection<Long>) {
        val now = System.currentTimeMillis()
        val set = ids.toSet()
        change { s -> s.copy(notes = s.notes.map { if (it.id in set) it.copy(sentAt = now) else it }) }
    }

    /** The messages for everything ready, one per project chat. */
    fun plan(): List<Outgoing> {
        val s = _state.value
        val date = SimpleDateFormat("EEE d MMM yyyy, HH:mm", Locale.ENGLISH).format(Date())
        return SendPlan.plan(ready(s), s.topics, s.defaultLink, date)
    }

    fun saveSettings(topics: List<Topic>, defaultLink: String, language: String) =
        change { s ->
            s.copy(
                topics = topics.filter { it.name.isNotBlank() }.distinctBy { it.name.trim() }
                    .map { Topic(it.name.trim(), it.link.trim()) }
                    .ifEmpty { NoteStore.DEFAULT_TOPICS },
                defaultLink = defaultLink.trim(),
                language = language,
            )
        }

    /** Renaming a topic moves its notes along with it. */
    fun renameTopic(from: String, to: String) {
        val name = to.trim()
        if (name.isEmpty() || name == from) return
        change { s ->
            s.copy(
                topics = s.topics.map { if (it.name == from) it.copy(name = name) else it }.distinctBy { it.name },
                notes = s.notes.map { if (it.topic == from) it.copy(topic = name) else it },
            )
        }
    }
}
