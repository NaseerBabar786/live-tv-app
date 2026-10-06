package com.livetv.app.account

import com.livetv.app.account.Firestore.bool
import com.livetv.app.account.Firestore.str
import com.livetv.app.account.Firestore.time
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Date

/** One message in a viewer's private conversation with the Cable TV team. */
data class Message(
    val id: String,
    val fromAdmin: Boolean,
    val name: String,
    val text: String,
    /** The suggestion the team was answering, when the message started from one. */
    val quote: String,
    val createdAt: Date?,
)

/** A viewer's conversation, as the owner's list shows it. */
data class Conversation(
    val uid: String,
    val name: String,
    val email: String,
    val lastText: String,
    val lastFromAdmin: Boolean,
    val lastAt: Date?,
    val adminUnread: Boolean,
    val userUnread: Boolean,
)

/**
 * Private messages between each viewer and the Cable TV team (the owner), the same ones as on
 * tv.bulkbazaar.ca/suggestions#messages. inbox/{viewer uid} holds the latest message and who has
 * unread ones; inbox/{uid}/messages holds them all. Only that viewer and the owner can read them.
 */
class Messages(private val account: Account) {

    /** The owner's list of conversations, newest first. */
    suspend fun conversations(): List<Conversation> = withContext(Dispatchers.IO) {
        Firestore.list("", "inbox", newestFirst = true, limit = 200, token = account.token(), orderBy = "lastAt").map { (id, f) ->
            Conversation(
                uid = id,
                name = f.str("name").ifBlank { "Cable TV viewer" },
                email = f.str("email"),
                lastText = f.str("lastText"),
                lastFromAdmin = f.str("lastFrom") == "admin",
                lastAt = f.time("lastAt"),
                adminUnread = f.bool("adminUnread"),
                userUnread = f.bool("userUnread"),
            )
        }
    }

    /** Everyone who has signed in to the app, most recently seen first: the owner can write to any of them. */
    suspend fun viewers(): List<User> = withContext(Dispatchers.IO) {
        Firestore.list("", "users", newestFirst = true, limit = 1000, token = account.token(), orderBy = "lastOpened")
            .map { (id, f) -> User(id, f.str("name").ifBlank { "Cable TV viewer" }, f.str("email")) }
    }

    suspend fun messages(uid: String): List<Message> = withContext(Dispatchers.IO) {
        Firestore.list("inbox/$uid", "messages", newestFirst = false, limit = 500, token = account.token()).map { (id, f) ->
            Message(id, f.str("from") == "admin", f.str("name"), f.str("text"), f.str("quote"), f.time("createdAt"))
        }
    }

    /**
     * Whether there's something new to read: for a viewer, an unread message from the team (with
     * its time, so the app asks about each one only once); for the owner, the newest unread reply.
     */
    suspend fun newest(): Pair<String, Date>? = withContext(Dispatchers.IO) {
        val me = account.user.value ?: return@withContext null
        if (account.isAdmin) {
            conversations().firstOrNull { it.adminUnread }?.let { c -> c.lastText to (c.lastAt ?: Date(0)) }
        } else {
            val head = runCatching { Firestore.get(Firestore.doc("inbox/${me.uid}"), account.token()) }
                .getOrElse { if (it is Http.Status && it.code == 404) return@withContext null else throw it }
                .optJSONObject("fields") ?: return@withContext null
            if (!head.bool("userUnread")) null else head.str("lastText") to (head.time("lastAt") ?: Date(0))
        }
    }

    /** Sends [text] to the conversation of viewer [uid] (the viewer's own uid when they write). */
    suspend fun send(uid: String, text: String, toName: String = "", quote: String = "", toEmail: String = "") = withContext(Dispatchers.IO) {
        val me = account.user.value ?: error("Not signed in")
        val fromAdmin = account.isAdmin && uid != me.uid
        val t = account.token()
        val body = text.trim().take(Forum.MAX_LENGTH)
        val now = Date()
        val msg = mutableMapOf<String, Any>(
            "from" to if (fromAdmin) "admin" else "user",
            "uid" to me.uid,
            "name" to me.name.ifBlank { "Cable TV viewer" },
            "text" to body,
            "createdAt" to now,
        )
        if (quote.isNotBlank()) msg["quote"] = quote.take(300)
        Firestore.create("inbox/$uid/messages", msg, t)
        val head = mutableMapOf<String, Any>(
            "uid" to uid,
            "lastText" to body.take(200),
            "lastAt" to now,
            "lastFrom" to msg["from"]!!,
        )
        if (fromAdmin) {
            head["userUnread"] = true
            if (toName.isNotBlank()) head["name"] = toName
            if (toEmail.isNotBlank()) head["email"] = toEmail
        } else {
            head["adminUnread"] = true
            head["userUnread"] = false
            head["name"] = me.name.ifBlank { "Cable TV viewer" }
            head["email"] = me.email
        }
        Firestore.patch(Firestore.doc("inbox/$uid"), head, t)
    }

    /** Marks the conversation read on this side (the viewer's, or the owner's). */
    suspend fun markRead(uid: String) = withContext(Dispatchers.IO) {
        val me = account.user.value ?: return@withContext
        val field = if (account.isAdmin && uid != me.uid) "adminUnread" else "userUnread"
        runCatching { Firestore.patch(Firestore.doc("inbox/$uid"), mapOf(field to false), account.token()) }
        Unit
    }
}
