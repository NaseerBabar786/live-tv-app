package com.livetv.app.data

import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Free live TV channels by country from the Famelack dataset (formerly TV Garden),
 * an MIT-licensed list of publicly available streams that is checked regularly
 * and has broken streams removed: https://github.com/famelack/famelack-channels
 */
object Famelack {

    private const val BASE = "https://raw.githubusercontent.com/famelack/famelack-channels/main/tv/raw"
    const val COUNTRIES_URL = "$BASE/countries_metadata.json"

    /** Playlist sources for a country are stored as "famelack:<code>", e.g. "famelack:ca". */
    const val SOURCE_PREFIX = "famelack:"

    /** Pakistani, Indian (Hindi/Urdu/Punjabi) and Canadian channels together. The default. */
    const val SOURCE_MIX = "famelack:mix"

    /** Every country, one section per country. */
    const val SOURCE_ALL = "famelack:all"

    /** Countries the user ticked, stored as "famelack:pick:pk,in,ca". */
    private const val SOURCE_PICK = "famelack:pick:"

    fun pickSource(codes: Collection<String>) = SOURCE_PICK + codes.joinToString(",") { it.lowercase() }

    /** The ticked country codes, or null when [source] isn't a list of picked countries. */
    fun pickedCountries(source: String): List<String>? =
        source.takeIf { it.startsWith(SOURCE_PICK) }?.removePrefix(SOURCE_PICK)
            ?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }

    /** A section of the combined view: a country, optionally limited to some languages. */
    data class Section(val country: String, val title: String, val languages: Set<String>? = null)

    val MIX = listOf(
        Section("pk", "Pakistani"),
        Section("in", "Indian", languages = setOf("hin", "urd", "pan")),
        Section("ca", "Canadian"),
    )

    fun countryUrl(code: String) = "$BASE/countries/${code.lowercase()}.json"

    fun source(code: String) = SOURCE_PREFIX + code.lowercase()

    /** The country of a single-country source, or null for any other source. */
    fun countryCode(source: String): String? =
        source.takeIf { it.startsWith(SOURCE_PREFIX) && it != SOURCE_MIX && it != SOURCE_ALL }
            ?.removePrefix(SOURCE_PREFIX)
            ?.takeUnless { ':' in it }

    data class Country(val code: String, val name: String, val channelCount: Int)

    fun parseCountries(json: String): List<Country> {
        val obj = JSONObject(json)
        return obj.keys().asSequence()
            .map { code ->
                val c = obj.getJSONObject(code)
                Country(code.lowercase(), c.optString("country", code), c.optInt("channelCount", 0))
            }
            .filter { it.channelCount > 0 }
            .sortedBy { it.name }
            .toList()
    }

    /** Logo URL and iptv-org category for a channel, keyed by Famelack nanoid. */
    data class Info(val logo: String, val category: String)

    /** Reads assets/channel_info.json, built by tools/build_logo_index.py. */
    fun parseInfo(json: String): Map<String, Info> {
        val obj = JSONObject(json)
        return obj.keys().asSequence().associateWith { id ->
            val a = obj.getJSONArray(id)
            Info(logo = a.optString(0), category = a.optString(1))
        }
    }

    /**
     * Converts a country's channel list to playable channels. Channels that only
     * have YouTube sources are skipped because they can't play in ExoPlayer.
     * [section] becomes [Channel.group]; [Channel.category] is the type (News,
     * Sports…) when [info] knows it. When [languages] is set, only channels in
     * one of those languages are kept.
     */
    fun parseChannels(
        json: String,
        info: Map<String, Info> = emptyMap(),
        section: String? = null,
        languages: Set<String>? = null,
    ): List<Channel> {
        val array = JSONArray(json)
        return (0 until array.length()).mapNotNull { i ->
            val entry = array.getJSONObject(i)
            val streams = entry.optJSONObject("sources")?.optJSONArray("streams")
                ?.let { s -> (0 until s.length()).map { s.getString(it) } }
                ?.filter { it.startsWith("http") }
                .orEmpty()
            if (streams.isEmpty()) return@mapNotNull null

            val langs = entry.optJSONArray("languages")
                ?.let { l -> (0 until l.length()).map { l.getString(it).lowercase() } }
                .orEmpty()
            if (languages != null && langs.none { it in languages }) return@mapNotNull null
            if (isRadio(entry.optString("name"), streams.first())) return@mapNotNull null

            val id = entry.optString("nanoid").ifBlank { null }
            val extra = id?.let(info::get)
            val category = extra?.category?.takeIf { it.isNotBlank() && it != "general" }
            val language = langs.firstOrNull { languages == null || it in languages } ?: langs.firstOrNull()
            val geoBlocked = entry.optBoolean("isGeoBlocked", false)
            Channel(
                name = entry.optString("name").ifBlank { "Channel ${i + 1}" },
                url = streams.first(),
                alternates = streams.drop(1),
                logo = extra?.logo?.takeIf { it.startsWith("http") },
                group = section,
                language = language?.takeIf { it.isNotBlank() }?.let(::languageName) ?: "Other",
                category = when {
                    geoBlocked -> "Geo-blocked"
                    category != null -> category.replaceFirstChar { it.uppercase() }
                    else -> "General"
                },
                tvgId = id,
            )
        }
    }

    private val radioName = Regex("""\bradio\b|\bf\.?m\b|\d{2,3}[.,]\d\s*fm\b""", RegexOption.IGNORE_CASE)
    private val tvName = Regex("""t[eé]l[eé](?![a-z])|\btv\b|television""", RegexOption.IGNORE_CASE)
    private val audioUrl = Regex(
        """\.(mp3|aac|ogg|opus|m4a)(\?|$)|icecast|shoutcast|streamtheworld|zeno\.fm""",
        RegexOption.IGNORE_CASE,
    )
    /** Stingray's music-only channels play audio over a still screen, like radio. */
    private val stingrayVideo = Regex("concert|karaoke|naturescape|cityscape", RegexOption.IGNORE_CASE)

    /**
     * True for radio stations mixed into the TV lists: audio-only stream URLs,
     * names like "CKNO-FM" or "TikTok Radio" (but not "Radio-Canada Télé"),
     * and Stingray's music-only channels.
     */
    fun isRadio(name: String, url: String): Boolean =
        audioUrl.containsMatchIn(url) ||
            (radioName.containsMatchIn(name) && !tvName.containsMatchIn(name)) ||
            (name.startsWith("Stingray ", ignoreCase = true) && !stingrayVideo.containsMatchIn(name))

    /** ISO 639-2 codes ("fra", "zho") to English names ("French", "Chinese"). */
    private val languageNames: Map<String, String> by lazy {
        Locale.getISOLanguages().associate { two ->
            val locale = Locale(two)
            runCatching { locale.isO3Language }.getOrDefault(two) to locale.getDisplayLanguage(Locale.ENGLISH)
        }
    }

    private fun languageName(code: String): String =
        (languageNames[code.lowercase()] ?: Locale.forLanguageTag(code).getDisplayLanguage(Locale.ENGLISH))
            .ifBlank { code }
            .replaceFirstChar { it.uppercase() }
}
