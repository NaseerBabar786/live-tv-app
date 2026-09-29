package com.livetv.app.data

/** One playable entry from an M3U playlist. */
data class Channel(
    val name: String,
    val url: String,
    val logo: String? = null,
    /** Top-level section: a country such as "Pakistani", or an M3U group-title. */
    val group: String? = null,
    /** Spoken language, e.g. "Urdu". */
    val language: String? = null,
    /** Type of channel, e.g. "News" or "Sports". */
    val category: String? = null,
    val tvgId: String? = null,
    val userAgent: String? = null,
    val referrer: String? = null,
    /** Backup stream URLs tried in order when [url] fails. */
    val alternates: List<String> = emptyList(),
) {
    /** Stable key used for favorites and list keys. */
    val id: String get() = url
}
