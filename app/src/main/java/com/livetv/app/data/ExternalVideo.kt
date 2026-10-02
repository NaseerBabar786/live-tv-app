package com.livetv.app.data

/** YouTube links in playlists. They play in YouTube's own player, never in ours. */
object YouTube {

    private val idPattern = Regex("""^[A-Za-z0-9_-]{11}$""")

    /** The video id of a YouTube watch, share, embed, shorts or live link; null for anything else. */
    fun videoId(url: String): String? {
        val u = url.trim()
        val host = u.substringAfter("://", "").substringBefore('/').substringBefore('?').lowercase().removePrefix("www.").removePrefix("m.")
        val path = u.substringAfter("://", "").substringAfter('/', "").substringBefore('#')
        val id = when (host) {
            "youtu.be" -> path.substringBefore('?')
            "youtube.com", "music.youtube.com", "youtube-nocookie.com" -> when {
                path.startsWith("watch") -> path.substringAfter('?', "").split('&')
                    .firstOrNull { it.startsWith("v=") }?.removePrefix("v=")
                path.startsWith("embed/") || path.startsWith("shorts/") || path.startsWith("live/") ->
                    path.substringAfter('/').substringBefore('?').substringBefore('/')
                else -> null
            }
            else -> null
        }
        return id?.takeIf { idPattern.matches(it) }
    }

    fun watchUrl(id: String) = "https://www.youtube.com/watch?v=$id"

    /** Whether the link plays in YouTube's player (a video, or a channel's live stream). */
    fun isYouTube(url: String): Boolean = videoId(url) != null
}

/** Bilibili (bilibili.tv) video and series links. They open in the Bilibili app, which is the only place they play. */
object Bilibili {
    fun isVideo(url: String): Boolean {
        val rest = url.trim().substringAfter("://", "")
        val host = rest.substringBefore('/').substringBefore('?').lowercase()
        val path = rest.substringAfter('/', "").lowercase()
        return (host == "bilibili.tv" || host.endsWith(".bilibili.tv")) &&
            Regex("""^(?:[a-z]{2}(?:-[a-z]{2})?/)?(?:video|play)/\d+""").containsMatchIn(path)
    }
}

private fun hostAndPath(url: String): Pair<String, String> {
    val rest = url.trim().substringAfter("://", "")
    val host = rest.substringBefore('/').substringBefore('?').lowercase().removePrefix("www.")
    return host to rest.substringAfter('/', "").substringBefore('?').substringBefore('#')
}

/** Dailymotion video links. They play in Dailymotion's own embedded player. */
object Dailymotion {
    private val idPattern = Regex("""^x[a-z0-9]{4,12}$""", RegexOption.IGNORE_CASE)

    /** The video id of a dailymotion.com/video/…, /embed/video/… or dai.ly/… link; null for anything else. */
    fun videoId(url: String): String? {
        val (host, path) = hostAndPath(url)
        val id = when (host) {
            "dai.ly" -> path
            "dailymotion.com", "geo.dailymotion.com" -> when {
                path.startsWith("video/") -> path.removePrefix("video/")
                path.startsWith("embed/video/") -> path.removePrefix("embed/video/")
                else -> null
            }
            else -> null
        }?.substringBefore('/')?.substringBefore('_')
        return id?.takeIf { idPattern.matches(it) }
    }

    fun embedUrl(id: String) = "https://www.dailymotion.com/embed/video/$id?autoplay=1"
}

/** Vimeo video links. They play in Vimeo's own embedded player. */
object Vimeo {
    /** The video id of a vimeo.com/123 or player.vimeo.com/video/123 link; null for anything else. */
    fun videoId(url: String): String? {
        val (host, path) = hostAndPath(url)
        val id = when (host) {
            "vimeo.com" -> path.split('/').lastOrNull { it.isNotEmpty() }
            "player.vimeo.com" -> path.removePrefix("video/").substringBefore('/')
            else -> null
        }
        return id?.takeIf { it.length in 5..12 && it.all(Char::isDigit) }
    }

    fun embedUrl(id: String) = "https://player.vimeo.com/video/$id?autoplay=1"
}
