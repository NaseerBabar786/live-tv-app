package com.livetv.app

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * A private message from the NextGen Cable team that pops up over whatever is playing (owner, 2026-10-09):
 * the owner writes it at tv.bulkbazaar.ca/users, and the viewer can answer at once with the remote.
 * NextGen Cable's Messages fill it in; the main screen shows it, and so does a full-screen YouTube channel or
 * Library film (WebChannelActivity, a window of its own), so it's seen wherever the viewer is.
 */
object MessagePopup {
    /** The team's messages the viewer hasn't answered yet, oldest first. */
    data class Incoming(val lines: List<String>, val at: Long)

    private val _shown = MutableStateFlow<Incoming?>(null)
    val shown: StateFlow<Incoming?> = _shown.asStateFlow()

    /** Sends the viewer's answer (throws when it couldn't); set by the edition that has Messages. */
    @Volatile var sendReply: (suspend (String) -> Unit)? = null

    /** Marks the message read, once the viewer has answered or closed it (in the background); set by the edition. */
    @Volatile var markRead: (() -> Unit)? = null

    /** A full-screen web channel is in front, so messages are still checked while the main screen is behind it. */
    @Volatile var webInFront = false

    /** One-press answers, so nobody has to type with the remote. */
    val QUICK_REPLIES = listOf("👍 OK, got it", "Thank you!", "Please call me")

    const val TITLE = "✉ Message from the NextGen Cable team"

    fun show(message: Incoming) {
        _shown.value = message
    }

    fun close() {
        _shown.value = null
    }

    /** The viewer closed it without answering: it's read, and stays in their ✉ Messages. */
    fun closeRead() {
        markRead?.invoke()
        close()
    }
}
