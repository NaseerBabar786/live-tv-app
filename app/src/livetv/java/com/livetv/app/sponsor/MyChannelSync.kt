package com.livetv.app.sponsor

import com.livetv.app.account.Account
import com.livetv.app.account.Firestore
import com.livetv.app.account.Http
import com.livetv.app.data.MyChannel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Fetches the owner's channel settings, saved on tv.bulkbazaar.ca/studio. They live in
 * sponsors/_channel, which app users can already read (no new Firebase rule), with a public copy in
 * channel/main for the website. Until the owner saves anything, the test schedule on the website
 * plays, so the channel works from the first day.
 */
object MyChannelSync {
    private const val TEST_SCHEDULE = "https://tv.bulkbazaar.ca/channel/test-schedule.json"

    /** Quietly keeps the saved settings when offline. */
    suspend fun refresh(account: Account) = withContext(Dispatchers.IO) {
        runCatching { MyChannel.update(fetch(account)) }
        Unit
    }

    private suspend fun fetch(account: Account): JSONObject? {
        val token = if (account.user.value != null) runCatching { account.token() }.getOrNull() else null
        val doc = token?.let { document("sponsors/_channel", it) } ?: document("channel/main", null)
        if (doc != null) return doc
        return JSONObject(Http.request("GET", TEST_SCHEDULE, null, null, null))
    }

    /** The settings in a document's "data" field; null when there's no such document (or no access). */
    private fun document(path: String, token: String?): JSONObject? = try {
        val fields = JSONObject(Http.request("GET", Firestore.doc(path), null, null, token)).optJSONObject("fields")
        fields?.optJSONObject("data")?.optString("stringValue")?.takeIf { it.isNotBlank() }?.let(::JSONObject)
    } catch (e: Http.Status) {
        if (e.code == 404 || e.code == 403) null else throw e
    }
}
