package com.livetv.app.data

/**
 * The iptv-org list (https://github.com/iptv-org/iptv): a community-maintained set of
 * publicly available streams, published as ready-made M3U playlists per country, plus
 * whole-list indexes grouped by country, language and category.
 */
object IptvOrg {

    private const val BASE = "https://iptv-org.github.io/iptv"

    /** Every channel, group-title = country name. */
    const val ALL_URL = "$BASE/index.country.m3u"

    /** Every channel, group-title = language name (a channel repeats once per language). */
    const val LANGUAGES_URL = "$BASE/index.language.m3u"

    /** Every channel, group-title = category name. */
    const val CATEGORIES_URL = "$BASE/index.category.m3u"

    /** Country playlist, group-title = the channel's categories ("News" or "Kids;Religious"). */
    fun countryUrl(code: String) = "$BASE/countries/${code.lowercase()}.m3u"

    private val resolution = Regex("""\s*\(\d{3,4}[pi]\)""")
    private val tag = Regex("""\s*\[[^\]]*]""")

    /** "Geo TV (1080p) [Not 24/7]" becomes "Geo TV". */
    fun cleanName(name: String): String = name.replace(resolution, "").replace(tag, "").trim().ifBlank { name }

    /** Stream URL to its first listed language, from the [LANGUAGES_URL] playlist. */
    fun parseGroups(m3u: String): Map<String, String> {
        val map = HashMap<String, String>()
        M3uParser.parse(m3u).forEach { c -> c.group?.let { map.putIfAbsent(c.url, it) } }
        return map
    }

    /** iptv-org spells some languages differently from the rest of the app. */
    fun languageName(name: String?): String = when (name) {
        null, "", "Undefined" -> "Other"
        "Panjabi" -> "Punjabi"
        else -> name
    }

    /** "Kids;Religious" becomes "Kids"; "Undefined" becomes "General". */
    fun categoryName(name: String?): String {
        val first = name?.substringBefore(';')?.trim()
        return if (first.isNullOrEmpty() || first == "Undefined") "General" else first
    }

    /**
     * Turns parsed iptv-org entries into the app's channels: names cleaned, radio dropped,
     * [section] as the group (or, when null, the entry's own group-title as a country),
     * languages from [languages] and categories from the entry or [categories].
     * When [keepLanguages] is set (English names), only channels in those languages stay.
     */
    fun convert(
        entries: List<Channel>,
        languages: Map<String, String>,
        section: String?,
        keepLanguages: Set<String>? = null,
        categories: Map<String, String>? = null,
    ): List<Channel> = entries.mapNotNull { c ->
        if (Famelack.isRadio(c.name, c.url)) return@mapNotNull null
        val language = languageName(languages[c.url])
        // Without the language index (offline, first run) nothing is filtered out.
        if (keepLanguages != null && languages.isNotEmpty() && language !in keepLanguages) return@mapNotNull null
        val geoBlocked = c.name.contains("[Geo-blocked]", ignoreCase = true)
        c.copy(
            name = cleanName(c.name),
            group = section ?: c.group,
            language = language,
            category = when {
                geoBlocked -> "Geo-blocked"
                categories != null -> categoryName(categories[c.url])
                else -> categoryName(c.group)
            },
        )
    }
}
