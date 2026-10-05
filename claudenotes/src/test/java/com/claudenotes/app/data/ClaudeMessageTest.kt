package com.claudenotes.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ClaudeMessageTest {

    private val topics = listOf(Topic("Live TV", "https://claude.ai/project/a"), Topic("Website"), Topic("Other"))

    @Test
    fun groupsByTopicThenKind() {
        val notes = listOf(
            Note(1, Kind.IDEA, "Dark theme", "Website", 1),
            Note(2, Kind.TASK, "Fix the guide", "Live TV", 2),
            Note(3, Kind.VOICE, "line one\nline two", "Live TV", 3),
            Note(4, Kind.TASK, "Add search", "Live TV", 4),
        )
        val text = ClaudeMessage.build(notes, topics.map { it.name }, "Mon 5 Oct 2026")
        assertEquals(
            """
            Notes for Claude, Mon 5 Oct 2026
            Each topic below belongs to its own project or thread. Please pass each one to the thread that owns it, or start a new thread for it.

            ## Live TV

            Work to do:
            1. Fix the guide
            2. Add search

            Voice notes:
            - line one / line two

            ## Website

            Ideas:
            - Dark theme
            """.trimIndent(),
            text,
        )
    }

    @Test
    fun splitsByProjectLink() {
        val notes = listOf(
            Note(1, Kind.TASK, "a", "Website", 1),
            Note(2, Kind.TASK, "b", "Live TV", 2),
            Note(3, Kind.IDEA, "c", "Other", 3),
        )
        val plan = SendPlan.plan(notes, topics, "https://claude.ai/project/main", "today")
        assertEquals(2, plan.size)
        assertEquals("https://claude.ai/project/a", plan[0].link)
        assertEquals(listOf(2L), plan[0].noteIds)
        assertEquals(listOf("Website", "Other"), plan[1].topics)
        assertTrue(plan[1].text.contains("## Other"))
    }

    @Test
    fun noLinksMeansOneMessage() {
        val notes = listOf(Note(1, Kind.TASK, "a", "Website", 1), Note(2, Kind.IDEA, "b", "Other", 2))
        val plan = SendPlan.plan(notes, topics.map { it.copy(link = "") }, "", "today")
        assertEquals(1, plan.size)
        assertEquals("", plan[0].link)
    }
}
