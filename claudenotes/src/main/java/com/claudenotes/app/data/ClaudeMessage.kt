package com.claudenotes.app.data

/** Builds the one message that goes to Claude. Pure Kotlin so it runs in plain JVM unit tests. */
object ClaudeMessage {

    /**
     * Groups [notes] by topic (in [topicOrder], unknown topics after), and inside each topic
     * lists work first, then ideas, then voice notes. [date] heads the message.
     */
    fun build(notes: List<Note>, topicOrder: List<String>, date: String): String {
        if (notes.isEmpty()) return ""
        val topics = notes.map { it.topic }.distinct()
            .sortedBy { t -> topicOrder.indexOf(t).let { if (it < 0) Int.MAX_VALUE else it } }
        val multi = topics.size > 1
        return buildString {
            append("Notes for Claude, ").append(date).append('\n')
            append(
                if (multi) "Each topic below belongs to its own project or thread. Please pass each one to the thread that owns it, or start a new thread for it."
                else "Please pass this to the thread that owns ${topics.first()}, or start a new thread for it."
            ).append('\n')
            for (topic in topics) {
                append("\n## ").append(topic).append('\n')
                val inTopic = notes.filter { it.topic == topic }
                for (kind in Kind.entries) {
                    val items = inTopic.filter { it.kind == kind }.sortedBy { it.created }
                    if (items.isEmpty()) continue
                    append('\n').append(kind.heading).append(":\n")
                    items.forEachIndexed { i, note ->
                        val text = note.text.trim().replace(Regex("\\s*\\n\\s*"), " / ")
                        if (kind == Kind.TASK) append(i + 1).append(". ") else append("- ")
                        append(text).append('\n')
                    }
                }
            }
        }.trimEnd()
    }
}

/** One message for one Claude project chat ([link] empty means "pick in the Claude app"). */
data class Outgoing(val link: String, val topics: List<String>, val text: String, val noteIds: List<Long>)

/** Splits notes by where their topic goes, so each project chat gets only its own notes. */
object SendPlan {

    fun plan(notes: List<Note>, topics: List<Topic>, defaultLink: String, date: String): List<Outgoing> {
        val order = topics.map { it.name }
        fun linkOf(topic: String) =
            topics.firstOrNull { it.name == topic }?.link?.trim()?.takeIf { it.isNotEmpty() } ?: defaultLink.trim()
        return notes.groupBy { linkOf(it.topic) }.map { (link, group) ->
            val names = group.map { it.topic }.distinct()
                .sortedBy { t -> order.indexOf(t).let { if (it < 0) Int.MAX_VALUE else it } }
            Outgoing(link, names, ClaudeMessage.build(group, order, date), group.map { it.id })
        }.sortedBy { o -> o.topics.minOf { t -> order.indexOf(t).let { if (it < 0) Int.MAX_VALUE else it } } }
    }
}
