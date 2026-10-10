package com.claudenotes.app.data

/** What a note is for. The order here is the order they appear in the message to Claude. */
enum class Kind(val label: String, val heading: String) {
    TASK("Work", "Work to do"),
    IDEA("Idea", "Ideas"),
    VOICE("Voice", "Voice notes"),
}

/**
 * One note. [topic] groups notes in the message (for example "NextGen Cable" or "Website"),
 * [sentAt] is set once the note went to Claude; until then it waits in the lists.
 */
data class Note(
    val id: Long,
    val kind: Kind,
    val text: String,
    val topic: String,
    val created: Long,
    val selected: Boolean = true,
    val sentAt: Long? = null,
)

/** A topic and, optionally, the Claude project chat its notes go to (a claude.ai link). */
data class Topic(val name: String, val link: String = "")
