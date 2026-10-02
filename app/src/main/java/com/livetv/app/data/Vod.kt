package com.livetv.app.data

import com.livetv.app.Edition

/**
 * Picks the movies and TV series out of IPTV playlists and groups series episodes by show.
 *
 * Providers list them next to live channels. A video file (.mp4, .mkv…) or an Xtream
 * /movie/ link is a movie; an Xtream /series/ link, or a video file whose name has an
 * episode number ("S01 E02") or whose group says series or drama, is an episode. Live
 * streams (HLS, MPEG-TS) never count, even in a group called "Movies", because those are
 * live movie channels. YouTube videos count too; they play in YouTube's own player.
 */
object Vod {

    enum class Kind { LIVE, MOVIE, EPISODE }

    /** The four languages Movies & Series is organised by, in the order they're shown. */
    enum class Language(val label: String) { URDU("Urdu"), HINDI("Hindi"), PUNJABI("Punjabi"), ENGLISH("English") }

    /** The sections inside a language, in the order they're shown. */
    enum class Section(val label: String) { MOVIES("Movies"), SERIES("Series"), SHOWS("Shows"), KIDS("Kids") }

    private val languageWords = listOf(
        Language.URDU to listOf("urdu", "urd", "pakistani", "pakistan"),
        Language.HINDI to listOf("hindi", "hin", "bollywood", "dubbed", "indian"),
        Language.PUNJABI to listOf("punjabi", "panjabi", "pan"),
        Language.ENGLISH to listOf("english", "eng"),
    )

    /**
     * The video's language: the playlist's tvg-language first, then words in its group or
     * name ("Pakistani dramas", "Hindi Dubbed"). Anything else counts as English.
     */
    fun language(channel: Channel): Language {
        channel.language?.let { lang ->
            val l = lang.trim().lowercase()
            languageWords.firstOrNull { (_, words) -> l in words || words.any { l.startsWith(it) && it.length > 3 } }
                ?.let { return it.first }
        }
        val text = "${channel.group.orEmpty()} ${channel.category.orEmpty()} ${channel.name}".lowercase()
        val words = Regex("""[a-z]+""").findAll(text).map { it.value }.toSet()
        return languageWords.firstOrNull { (_, list) -> list.any { it.length > 3 && it in words } }?.first ?: Language.ENGLISH
    }

    private val showWords = Regex(
        """\b(show|shows|reality|talk|game show|tamasha|jeeto|hasna mana|podcast|morning|ramzan|ramadan|transmission|quiz|comedy night)\b""",
        RegexOption.IGNORE_CASE,
    )

    /** Whether an episode is a kids' programme (tvg-genre "Kids"). */
    fun isKids(channel: Channel): Boolean =
        channel.category?.let { it.contains("kids", true) || it.contains("cartoon", true) } == true

    /** Whether an episode belongs to a show (reality, talk, game) rather than a drama series. */
    fun isShow(channel: Channel): Boolean {
        channel.category?.let { c ->
            if (c.contains("show", true)) return true
            if (c.contains("series", true) || c.contains("drama", true)) return false
        }
        return showWords.containsMatchIn(channel.group.orEmpty().replace("TV show", "")) ||
            showWords.containsMatchIn(parse(channel.name)?.first ?: channel.name)
    }

    /** Free public-domain films and TV, rebuilt weekly by tools/build_movies.py. */
    const val FREE_MOVIES_URL = "https://tv.bulkbazaar.ca/Movies.m3u"

    /** The newest episodes from Pakistani channels' official YouTube uploads, rebuilt daily by tools/build_dramas.py. */
    const val DRAMAS_URL = "https://tv.bulkbazaar.ca/Dramas.m3u"

    /** The playlists Movies & Series always shows: the free lists in Live TV, none in the store editions. */
    fun builtIn(): List<Playlist> =
        if (Edition.HAS_VOD) {
            listOf(Playlist("Pakistani dramas", DRAMAS_URL), Playlist("Free classics", FREE_MOVIES_URL))
        } else {
            emptyList()
        }

    /** One show and its episodes, in season and episode order. */
    data class Show(val name: String, val logo: String?, val group: String?, val episodes: List<Episode>)

    data class Episode(val channel: Channel, val season: Int?, val number: Int?) {
        /** "S1 E2" (or the full name when it has no episode number). */
        val label: String
            get() = when {
                season != null && number != null -> "S$season E$number"
                number != null -> "Episode $number"
                else -> channel.name
            }
    }

    private val videoExtensions = setOf("mp4", "mkv", "avi", "mov", "webm", "m4v", "wmv", "flv", "mpg", "mpeg")
    private val seriesWords = listOf("series", "serial", "drama", "season", "tv show", "episode")

    // "Show S01E02", "Show S1 E2", "Show - S01.E02 - Title", "Show 1x02".
    private val seasonEpisode = Regex("""^(.*?)[\s._\-:|]*\bS(\d{1,2})[\s._\-]*E(\d{1,3})\b.*$""", RegexOption.IGNORE_CASE)
    private val crossFormat = Regex("""^(.*?)[\s._\-:|]+(\d{1,2})x(\d{1,3})\b.*$""", RegexOption.IGNORE_CASE)
    // "Show Episode 12", "Show Ep 12", "Show Ep. 12", "Show - E12".
    private val episodeOnly = Regex("""^(.*?)[\s._\-:|]+(?:Episode\s*|Ep\.?\s*|E)(\d{1,4})\b.*$""", RegexOption.IGNORE_CASE)

    fun kind(channel: Channel): Kind {
        val path = channel.url.substringBefore('?').substringBefore('#').lowercase()
        if (YouTube.videoId(channel.url) != null || Bilibili.isVideo(channel.url)) return if (isEpisode(channel)) Kind.EPISODE else Kind.MOVIE
        val hls = path.endsWith(".m3u8")
        if ("/series/" in path && !hls) return Kind.EPISODE
        if ("/movie/" in path && !hls) return Kind.MOVIE
        val video = path.substringAfterLast('/').substringAfterLast('.', "") in videoExtensions
        if (!video) return Kind.LIVE
        return if (isEpisode(channel)) Kind.EPISODE else Kind.MOVIE
    }

    private fun isEpisode(channel: Channel): Boolean {
        // tvg-genre from Live TV's own lists: Movies, or a Series, Shows or Kids folder.
        channel.category?.lowercase()?.let { c ->
            if (c == "movies" || c == "movie") return false
            if (c == "series" || c == "shows" || c == "kids") return true
        }
        val group = channel.group.orEmpty().lowercase()
        return parse(channel.name) != null || seriesWords.any { it in group }
    }

    /** Show name, season and episode number from an episode's name, or null when it has none. */
    fun parse(name: String): Triple<String, Int?, Int>? {
        seasonEpisode.matchEntire(name.trim())?.let { m ->
            return Triple(clean(m.groupValues[1]), m.groupValues[2].toInt(), m.groupValues[3].toInt())
        }
        crossFormat.matchEntire(name.trim())?.let { m ->
            return Triple(clean(m.groupValues[1]), m.groupValues[2].toInt(), m.groupValues[3].toInt())
        }
        episodeOnly.matchEntire(name.trim())?.let { m ->
            return Triple(clean(m.groupValues[1]), null, m.groupValues[2].toInt())
        }
        return null
    }

    /**
     * Groups episodes into shows. Episodes without a number in their name are filed under
     * their group-title (Xtream series playlists put each show in its own group).
     */
    fun shows(episodes: List<Channel>): List<Show> =
        episodes.groupBy { c -> parse(c.name)?.first?.takeIf { it.isNotBlank() } ?: c.group ?: c.name }
            .map { (name, list) ->
                val sorted = list.map { c -> parse(c.name).let { Episode(c, it?.second, it?.third) } }
                    .sortedWith(compareBy({ it.season ?: 0 }, { it.number ?: 0 }, { it.channel.name }))
                Show(
                    name = name,
                    logo = list.firstNotNullOfOrNull { it.logo },
                    group = list.firstNotNullOfOrNull { it.group },
                    episodes = sorted,
                )
            }
            .sortedBy { it.name.lowercase() }

    private fun clean(show: String): String = show.trim().trimEnd('-', ':', '|', '.', '_').trim()
}
