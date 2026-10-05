package com.livetv.app.account

import com.livetv.app.account.Firestore.str
import com.livetv.app.account.Firestore.time
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Date

/** A suggestion, or a reply to one. */
data class Post(val id: String, val uid: String, val name: String, val text: String, val createdAt: Date?)

/**
 * The Suggestions forum: posts/{id} with replies in posts/{id}/replies, readable and writable by
 * signed-in viewers only (the Firestore rules check that people post as themselves).
 */
class Forum(private val account: Account) {

    suspend fun posts(): List<Post> = withContext(Dispatchers.IO) {
        Firestore.list("", "posts", newestFirst = true, limit = 100, token = account.token()).map(::toPost)
    }

    suspend fun replies(postId: String): List<Post> = withContext(Dispatchers.IO) {
        Firestore.list("posts/$postId", "replies", newestFirst = false, limit = 200, token = account.token()).map(::toPost)
    }

    suspend fun post(text: String) = add("posts", text)

    suspend fun reply(postId: String, text: String) = add("posts/$postId/replies", text)

    suspend fun delete(postId: String, replyId: String? = null) = withContext(Dispatchers.IO) {
        val path = if (replyId == null) "posts/$postId" else "posts/$postId/replies/$replyId"
        Firestore.delete(path, account.token())
    }

    private suspend fun add(collection: String, text: String) = withContext(Dispatchers.IO) {
        val user = account.user.value ?: error("Not signed in")
        Firestore.create(
            collection,
            mapOf(
                "uid" to user.uid,
                "name" to user.name.ifBlank { "Free Live TV viewer" },
                "text" to text.trim().take(MAX_LENGTH),
                "createdAt" to Date(),
            ),
            account.token(),
        )
    }

    private fun toPost(p: Pair<String, org.json.JSONObject>): Post {
        val f = p.second
        return Post(p.first, f.str("uid"), f.str("name"), f.str("text"), f.time("createdAt"))
    }

    companion object {
        const val MAX_LENGTH = 2000
    }
}
