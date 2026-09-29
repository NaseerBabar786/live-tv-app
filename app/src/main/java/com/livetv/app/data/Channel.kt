package com.livetv.app.data

/** One playable entry from an M3U playlist. */
data class Channel(
    val name: String,
    val url: String,
    val logo: String? = null,
    val group: String? = null,
    val tvgId: String? = null,
    val userAgent: String? = null,
    val referrer: String? = null,
) {
    /** Stable key used for favorites and list keys. */
    val id: String get() = url
}
