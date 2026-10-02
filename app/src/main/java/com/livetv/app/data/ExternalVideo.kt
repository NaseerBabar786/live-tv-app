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
