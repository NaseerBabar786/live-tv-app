package com.livetv.app.data

/**
 * The iptv-org list (https://github.com/iptv-org/iptv): a community-maintained set of
 * publicly available streams, published as ready-made M3U playlists per country, plus
 * whole-list indexes grouped by country, language and category.
 */
object IptvOrg {

    const val BASE = "https://iptv-org.github.io/iptv"

    /** The list of every playlist iptv-org publishes, with channel counts. */
    const val CATALOGUE_URL = "https://raw.githubusercontent.com/iptv-org/iptv/master/PLAYLISTS.md"

    enum class Kind(val title: String) { COUNTRY("Countries"), LANGUAGE("Languages"), CATEGORY("Categories"), REGION("Regions") }

    /** One ready-made playlist: e.g. Pakistan (countries/pk.m3u) or News (categories/news.m3u). */
    data class Listing(val kind: Kind, val name: String, val url: String, val channels: Int? = null)

    private val tableRow = Regex("""<tr><td[^>]*>(.*?)</td><td[^>]*>(\d+)</td><td[^>]*><code>(https://\S+?\.m3u)</code>""")
    private val listRow = Regex("""^- (.+?) <code>(https://\S+?\.m3u)</code>""")

    /**
     * Reads iptv-org's PLAYLISTS.md: categories and languages come as table rows with
     * channel counts, countries and regions as a list (only top-level entries are kept,
     * not provinces and cities). Country names lose their flag emoji.
     */
    fun parseCatalogue(markdown: String): List<Listing> {
        var kind: Kind? = null
        val out = mutableListOf<Listing>()
        markdown.lineSequence().forEach { line ->
            when {
                line.startsWith("### Grouped by category") -> kind = Kind.CATEGORY
                line.startsWith("### Grouped by language") -> kind = Kind.LANGUAGE
                line.startsWith("#### Countries") -> kind = Kind.COUNTRY
                line.startsWith("#### Regions") -> kind = Kind.REGION
                line.startsWith("### ") -> kind = null
                else -> {
                    val k = kind ?: return@forEach
                    tableRow.find(line)?.let { m ->
                        val (name, count, url) = m.destructured
                        out += Listing(k, name.trim(), url, count.toIntOrNull())
                    } ?: listRow.find(line)?.let { m ->
                        val (name, url) = m.destructured
                        out += Listing(k, name.dropWhile { !it.isLetter() }.trim(), url)
                    }
                }
            }
        }
        return out.distinctBy { it.url }
    }

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

    /**
     * For one of iptv-org's own playlists opened on its own: the channels' categories
     * become the chips, names are cleaned and languages filled in.
     */
    fun convertPlaylist(entries: List<Channel>, languages: Map<String, String>): List<Channel> =
        convert(entries, languages, section = null).map { it.copy(group = it.category, category = null) }

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
