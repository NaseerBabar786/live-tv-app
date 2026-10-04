package com.livetv.app.data

import com.livetv.app.Edition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.Normalizer

/**
 * Live TV Max's TV guide: what's on now and next, for the channels that have listings.
 * tools/build_epg.py rebuilds tv.bulkbazaar.ca/epg.json every 6 hours from free public XMLTV
 * guides, keyed by [key] of the channel's name.
 */
object Guide {

    const val URL = "https://tv.bulkbazaar.ca/epg.json"

    data class Programme(val start: Long, val end: Long, val title: String)

    private val dropTail = setOf("hd", "fhd", "uhd", "sd", "4k", "tv", "channel", "pk", "in", "ca", "uk", "us", "usa", "east", "west")
    private val brackets = Regex("""\([^)]*\)|\[[^\]]*]""")
    private val word = Regex("[a-z0-9]+")

    /** Matching key for a channel name; must stay the same as key() in tools/build_epg.py. */
    fun key(name: String): String {
        val ascii = Normalizer.normalize(name, Normalizer.Form.NFKD).filter { it.code < 128 }.lowercase()
        val words = word.findAll(brackets.replace(ascii, " ")).map { it.value }.toMutableList()
        while (words.size > 1 && words.last() in dropTail) words.removeAt(words.lastIndex)
        return words.joinToString("")
    }

    /** Each channel key's programmes, in time order. */
    fun parse(json: String): Map<String, List<Programme>> {
        val channels = JSONObject(json).optJSONObject("channels") ?: return emptyMap()
        return channels.keys().asSequence().associateWith { k ->
            val list = channels.getJSONArray(k)
            (0 until list.length()).mapNotNull { i ->
                val p = list.optJSONArray(i) ?: return@mapNotNull null
                Programme(p.optLong(0), p.optLong(1), p.optString(2)).takeIf { it.title.isNotBlank() && it.end > it.start }
            }.sortedBy { it.start }
        }
    }

    /** What's on [channel] at [nowSec] (unix seconds) and what follows it; nulls when unknown. */
    fun nowNext(guide: Map<String, List<Programme>>, channel: Channel, nowSec: Long): Pair<Programme?, Programme?> {
        val list = guide[key(channel.name)] ?: return null to null
        val i = list.indexOfFirst { it.end > nowSec }
        if (i < 0) return null to null
        val first = list[i]
        return if (first.start <= nowSec) first to list.getOrNull(i + 1) else null to first
    }

    @Volatile private var cached: Pair<Long, Map<String, List<Programme>>>? = null

    /** The guide, downloaded at most once an hour; empty when it can't be reached. */
    suspend fun load(): Map<String, List<Programme>> = withContext(Dispatchers.IO) {
        cached?.takeIf { System.currentTimeMillis() - it.first < 60 * 60_000L }?.let { return@withContext it.second }
        val fresh = runCatching {
            val conn = URL(URL).openConnection() as HttpURLConnection
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.setRequestProperty("User-Agent", Edition.USER_AGENT)
            try {
                parse(conn.inputStream.bufferedReader().use { it.readText() })
            } finally {
                conn.disconnect()
            }
        }.getOrNull()
        if (fresh != null) cached = System.currentTimeMillis() to fresh
        fresh ?: cached?.second ?: emptyMap()
    }
}
