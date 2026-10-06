package com.claudenotes.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Saves notes and topics as one small JSON file in the app's private storage. */
class NoteStore(context: Context) {

    private val file = File(context.applicationContext.filesDir, "notes.json")

    /**
     * [defaultLink] is the project chat for topics without a link of their own;
     * [language] is the speech-to-text language ("" means the phone's language).
     */
    data class Saved(
        val notes: List<Note>,
        val topics: List<Topic>,
        val defaultLink: String = "",
        val language: String = "",
    )

    fun load(): Saved {
        val json = runCatching { JSONObject(file.readText()) }.getOrNull()
            ?: return Saved(emptyList(), DEFAULT_TOPICS)
        val topicsJson = json.optJSONArray("topics") ?: JSONArray()
        val topics = (0 until topicsJson.length()).mapNotNull { i ->
            topicsJson.optJSONObject(i)?.let { Topic(it.optString("name"), it.optString("link")) }
        }.filter { it.name.isNotBlank() }.ifEmpty { DEFAULT_TOPICS }
        val notesJson = json.optJSONArray("notes") ?: JSONArray()
        val notes = (0 until notesJson.length()).mapNotNull { i ->
            val o = notesJson.getJSONObject(i)
            runCatching {
                Note(
                    id = o.getLong("id"),
                    kind = Kind.valueOf(o.getString("kind")),
                    text = o.getString("text"),
                    topic = o.getString("topic"),
                    created = o.getLong("created"),
                    selected = o.optBoolean("selected", true),
                    sentAt = if (o.has("sentAt")) o.getLong("sentAt") else null,
                )
            }.getOrNull()
        }
        return Saved(notes, topics, json.optString("defaultLink"), json.optString("language"))
    }

    fun save(saved: Saved) {
        val json = JSONObject()
            .put("defaultLink", saved.defaultLink)
            .put("language", saved.language)
            .put("topics", JSONArray().apply {
                saved.topics.forEach { put(JSONObject().put("name", it.name).put("link", it.link)) }
            })
            .put("notes", JSONArray().apply {
                saved.notes.forEach { n ->
                    put(JSONObject()
                        .put("id", n.id)
                        .put("kind", n.kind.name)
                        .put("text", n.text)
                        .put("topic", n.topic)
                        .put("created", n.created)
                        .put("selected", n.selected)
                        .apply { n.sentAt?.let { put("sentAt", it) } })
                }
            })
        // Write to a side file first so a crash mid-write never loses the notes.
        val tmp = File(file.parentFile, "notes.json.tmp")
        tmp.writeText(json.toString())
        if (!tmp.renameTo(file)) {
            file.writeText(json.toString())
            tmp.delete()
        }
    }

    companion object {
        val DEFAULT_TOPICS = listOf("Cable TV", "Website", "App Bazaar", "Quran app", "Other").map { Topic(it) }
    }
}
