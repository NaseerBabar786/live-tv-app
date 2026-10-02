package com.livetv.app.data

/**
 * Picks the movies and TV series out of IPTV playlists and groups series episodes by show.
 *
 * Providers list them next to live channels. A video file (.mp4, .mkv…) or an Xtream
 * /movie/ link is a movie; an Xtream /series/ link, or a video file whose name has an
 * episode number ("S01 E02") or whose group says series or drama, is an episode. Live
 * streams (HLS, MPEG-TS) never count, even in a group called "Movies", because those are
 * live movie channels.
 */
object Vod {

    enum class Kind { LIVE, MOVIE, EPISODE }

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
        val hls = path.endsWith(".m3u8")
        if ("/series/" in path && !hls) return Kind.EPISODE
        if ("/movie/" in path && !hls) return Kind.MOVIE
        val video = path.substringAfterLast('/').substringAfterLast('.', "") in videoExtensions
        if (!video) return Kind.LIVE
        val group = channel.group.orEmpty().lowercase()
        return if (parse(channel.name) != null || seriesWords.any { it in group }) Kind.EPISODE else Kind.MOVIE
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
