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

    /** How many days a programme counts as "Newly added" after it first shows up in a list. */
    const val NEW_DAYS = 7

    /** The first day still counted as new ("2026-10-01" on 2026-10-07). */
    fun newSince(now: Long = System.currentTimeMillis()): String {
        val format = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
        return format.format(java.util.Date(now - (NEW_DAYS - 1) * 24L * 60 * 60 * 1000))
    }

    /**
     * The first day that counts as new: only the newest batch in the Library gets the NEW mark
     * (older titles show just their "Added" day, owner 2026-10-08), and nothing older than [NEW_DAYS].
     */
    fun newestSince(added: Sequence<String?>, now: Long = System.currentTimeMillis()): String {
        val window = newSince(now)
        val newest = added.filterNotNull().maxOrNull() ?: return window
        return maxOf(window, newest)
    }

    /** "Added Oct 8" for the day a programme first showed up in its list ("2026-10-08"), or null. */
    fun addedLabel(added: String?): String? {
        val day = runCatching {
            java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).apply { isLenient = false }.parse(added ?: return null)
        }.getOrNull() ?: return null
        return "Added " + java.text.SimpleDateFormat("MMM d", java.util.Locale.US).format(day)
    }

    /** Whether a programme first showed up in its list on or after [since] (see tools/first_seen.py). */
    fun isNew(channel: Channel, since: String): Boolean = channel.added?.let { it >= since } == true

    /** A programme's length for its tile: "45 min", "1 h 35 min" (null when unknown). */
    fun length(mins: Int?): String? = when {
        mins == null || mins <= 0 -> null
        mins < 60 -> "$mins min"
        mins % 60 == 0 -> "${mins / 60} h"
        else -> "${mins / 60} h ${mins % 60} min"
    }

    /** Free public-domain films and TV, rebuilt every morning by tools/build_movies.py. */
    const val FREE_MOVIES_URL = "https://tv.bulkbazaar.ca/Movies.m3u"

    /** The newest episodes from Pakistani channels' official YouTube uploads, rebuilt every morning by tools/build_dramas.py. */
    const val DRAMAS_URL = "https://tv.bulkbazaar.ca/Dramas.m3u"

    /** Free films and shows from Wikimedia Commons, NASA, Vimeo and PeerTube, rebuilt every morning by tools/build_free.py. */
    const val FREE_SOURCES_URL = "https://tv.bulkbazaar.ca/Free.m3u"

    /** Spark TV One's full news report of each day, the newest 30 (owner, 2026-10-08), by tools/news/archive.py. */
    const val NEWS_ARCHIVE_URL = "https://tv.bulkbazaar.ca/NewsArchive.m3u"

    /**
     * The folders on the Library's main page next to the languages (owner, 2026-10-09): Spark TV's own
     * programmes (the news archive) and MTA's, each with its own picture, instead of inside Urdu's Shows.
     */
    enum class Folder(val label: String, val source: String) {
        SPARK("Spark TV", NEWS_ARCHIVE_URL),
        MTA("MTA", Mta.VIDEOS_URL),
    }

    /** The main-page folder a playlist's videos go in, or null for the language folders. */
    fun folder(source: String): Folder? = Folder.entries.firstOrNull { it.source == source }

    /**
     * The playlists Movies & Series always shows: the free lists in Cable TV, none in the store editions.
     * The old public-domain classics ([FREE_MOVIES_URL]) left the Library at the owner's wish (2026-10-07):
     * too old for viewers. Newer English films, shows and cartoons come in Dramas.m3u; the classics still
     * play on Bazaar Cinema.
     */
    fun builtIn(): List<Playlist> =
        if (Edition.HAS_VOD) {
            // In this order, so where a title is in two lists the first one's copy is kept.
            listOf(
                Playlist("Pakistani dramas", DRAMAS_URL),
                Playlist("Free films and shows", FREE_SOURCES_URL),
                Playlist("Spark TV One News", NEWS_ARCHIVE_URL),
            )
        } else {
            emptyList()
        }

    /** One show and its episodes, in season and episode order. */
    data class Show(val name: String, val logo: String?, val group: String?, val episodes: List<Episode>) {
        /** The day its newest episode first showed up (null when the lists don't say). */
        val added: String? get() = episodes.mapNotNull { it.channel.added }.maxOrNull()

        /** Its episodes that are newly added (see [isNew]). */
        fun newEpisodes(since: String): Int = episodes.count { isNew(it.channel, since) }

        /** How long an episode usually is (the middle length of its episodes), or null. */
        val episodeMins: Int? get() = episodes.mapNotNull { it.channel.mins }.sorted().let { it.getOrNull(it.size / 2) }

        /** The show's genres: the ones most of its episodes have (at most two). */
        val genres: List<String>
            get() = episodes.flatMap { it.channel.genres }.groupingBy { it }.eachCount()
                .filter { it.value * 2 >= episodes.size }.entries.sortedByDescending { it.value }.map { it.key }.take(2)

        /** A line about the show, from the newest episode that has one. */
        val desc: String? get() = episodes.asReversed().firstNotNullOfOrNull { it.channel.desc }
    }

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
        if (YouTube.videoId(channel.url) != null || Bilibili.isVideo(channel.url) ||
            Dailymotion.videoId(channel.url) != null || Vimeo.videoId(channel.url) != null
        ) {
            return if (isEpisode(channel)) Kind.EPISODE else Kind.MOVIE
        }
        val hls = path.endsWith(".m3u8")
        if ("/series/" in path && !hls) return Kind.EPISODE
        if ("/movie/" in path && !hls) return Kind.MOVIE
        val video = path.substringAfterLast('/').substringAfterLast('.', "") in videoExtensions
        if (!video) return Kind.LIVE
        return if (isEpisode(channel)) Kind.EPISODE else Kind.MOVIE
    }

    private fun isEpisode(channel: Channel): Boolean {
        // tvg-genre from Cable TV's own lists: Movies, or a Series, Shows or Kids folder.
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
    /**
     * A title reduced to its letters and digits ("The Kid (1921) [HD]" to "kid"), so one film or
     * show spelled a little differently in two lists still matches.
     */
    fun titleKey(name: String): String =
        name.lowercase()
            .replace(bracketed, " ")
            .replace(fillerWords, " ")
            .filter { it.isLetterOrDigit() }

    private val bracketed = Regex("""\(.*?\)|\[.*?]""")
    private val fillerWords = Regex("""\b(the|full movie|full episode|hd|4k)\b""")

    /**
     * The same for one film, or one episode of a show, listed twice (in two lists, or from two
     * sites such as YouTube and Dailymotion), so the Library shows it only once.
     */
    fun sameTitleKey(channel: Channel): String {
        val language = language(channel)
        val name = if (kind(channel) == Kind.EPISODE) {
            parse(channel.name)?.let { (show, season, number) ->
                titleKey(show).takeIf { it.isNotEmpty() }?.let { "e|$it|${season ?: 1}|$number" }
            }
        } else {
            titleKey(channel.name).takeIf { it.isNotEmpty() }?.let { "m|$it" }
        }
        return "$language|${name ?: "u|${channel.url}"}"
    }

    fun shows(episodes: List<Channel>): List<Show> =
        episodes.groupBy { c -> showName(c).let { titleKey(it).ifEmpty { it } } }
            .map { (_, list) ->
                val name = showName(list.first())
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

    private fun showName(c: Channel): String = parse(c.name)?.first?.takeIf { it.isNotBlank() } ?: c.group ?: c.name

    private fun clean(show: String): String = show.trim().trimEnd('-', ':', '|', '.', '_').trim()
}
