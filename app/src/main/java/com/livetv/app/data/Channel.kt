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
    /** Country code from tvg-country, lowercase (e.g. "pk"). */
    val country: String? = null,
    val userAgent: String? = null,
    val referrer: String? = null,
    /** Backup stream URLs tried in order when [url] fails. */
    val alternates: List<String> = emptyList(),
    /** Channel number: its position in the loaded list, starting at 1 (0 until numbered). */
    val number: Int = 0,
    /** The day it first showed up in its Library list ("2026-10-07", from added="..."), or null. */
    val added: String? = null,
    /** Library programmes: how long it is, in minutes (mins="95", tools/library_check.py), or null. */
    val mins: Int? = null,
    /** Library programmes: a line or two about it (desc="..."), or null. */
    val desc: String? = null,
    /** Library programmes: its genres for the genre chips ("Action", "Comedy"; genres="Action;Comedy"). */
    val genres: List<String> = emptyList(),
    /** Library programmes: the year it came out (year="2019", tools/library_titles.py), or null. */
    val year: Int? = null,
    /** Library programmes: the day the video went online ("2024-03-06", pub="..."), or null. */
    val pub: String? = null,
    /** Library programmes: the YouTube id of its official trailer (trailer="..."), or null. */
    val trailer: String? = null,
) {
    /** Stable key used for favorites and list keys. */
    val id: String get() = url
}
