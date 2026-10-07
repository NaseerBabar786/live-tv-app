package com.livetv.app.sponsor

import com.livetv.app.account.Account
import com.livetv.app.account.Firestore
import com.livetv.app.account.Http
import com.livetv.app.data.MyChannel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Fetches the owner's channel settings, saved on tv.bulkbazaar.ca/studio. Bazaar TV's live in
 * sponsors/_channel and the other channels' in sponsors/_channel_<id>, which app users can already
 * read (no new Firebase rule), with public copies in channel/<id> for the website. Until the owner
 * saves anything, the ready-made schedule on the website plays, so each channel works from the first
 * day (Bazaar Cinema's is rebuilt every week from the public-domain films list, Bazaar Music's monthly
 * from free-to-use songs).
 */
object MyChannelSync {
    private fun readyMade(id: String) =
        if (id == "main") "https://tv.bulkbazaar.ca/channel/test-schedule.json"
        else "https://tv.bulkbazaar.ca/channel/$id-schedule.json"

    /** Quietly keeps the saved settings when offline. */
    suspend fun refresh(account: Account) = withContext(Dispatchers.IO) {
        val token = if (account.user.value != null) runCatching { account.token() }.getOrNull() else null
        for (station in MyChannel.STATIONS) {
            runCatching {
                // Bazaar TV's upcoming trailers: a list rebuilt on the website every day takes its entry's place.
                val json = fetch(station, token)?.let { o -> MyChannel.expand(o) { JSONObject(Http.request("GET", it, null, null, null)) } }
                MyChannel.update(station.id, json)
            }
        }
    }

    private fun fetch(station: MyChannel.Station, token: String?): JSONObject? {
        val id = station.id
        val owner = if (id == "main") "sponsors/_channel" else "sponsors/_channel_$id"
        val doc = token?.let { document(owner, it) } ?: document("channel/$id", null)
        if (doc != null) return doc
        val ready = JSONObject(Http.request("GET", readyMade(station.backup), null, null, null))
        // Another channel's schedule as the backup: it still shows this channel's own name and logo.
        if (station.backup != id) {
            ready.put("name", station.name)
            station.logo?.let { ready.put("logo", "https://tv.bulkbazaar.ca/channel/logos/$it") }
        }
        return ready
    }

    /** The settings in a document's "data" field; null when there's no such document (or no access). */
    private fun document(path: String, token: String?): JSONObject? = try {
        val fields = JSONObject(Http.request("GET", Firestore.doc(path), null, null, token)).optJSONObject("fields")
        fields?.optJSONObject("data")?.optString("stringValue")?.takeIf { it.isNotBlank() }?.let(::JSONObject)
    } catch (e: Http.Status) {
        if (e.code == 404 || e.code == 403) null else throw e
    }
}
