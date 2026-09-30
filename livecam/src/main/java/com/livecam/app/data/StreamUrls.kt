package com.livecam.app.data

/**
 * Stream address helpers. Pure Kotlin so they run in plain JVM unit tests.
 */
object StreamUrls {

    /**
     * Common camera / NVR brands and the RTSP path their live stream uses.
     * [channel] is the camera number on an NVR (1 for a single camera);
     * [sub] picks the lower-resolution substream, which is lighter for the multi-camera grid.
     */
    enum class Brand(val label: String, val defaultPort: Int) {
        HIKVISION("Hikvision / HiLook", 554),
        DAHUA("Dahua / Amcrest / Lorex", 554),
        REOLINK("Reolink", 554),
        TAPO("TP-Link Tapo", 554),
        UNIVIEW("Uniview", 554),
        WYZE_BRIDGE("Wyze (docker-wyze-bridge)", 8554),
        GENERIC("Other (ONVIF / generic)", 554),
        CUSTOM("Custom URL", 0);

        fun path(channel: Int, sub: Boolean, name: String = ""): String = when (this) {
            HIKVISION -> "/Streaming/Channels/${channel}0${if (sub) 2 else 1}"
            DAHUA -> "/cam/realmonitor?channel=$channel&subtype=${if (sub) 1 else 0}"
            REOLINK -> "/h264Preview_${channel.toString().padStart(2, '0')}_${if (sub) "sub" else "main"}"
            TAPO -> if (sub) "/stream2" else "/stream1"
            UNIVIEW -> "/unicast/c$channel/s${if (sub) 1 else 0}/live"
            WYZE_BRIDGE -> "/" + slug(name)
            GENERIC -> "/stream${if (sub) 2 else 1}"
            CUSTOM -> ""
        }
    }

    /** Builds an rtsp:// address for a brand, e.g. rtsp://192.168.1.64:554/Streaming/Channels/101. */
    fun build(brand: Brand, host: String, channel: Int = 1, sub: Boolean = false, name: String = ""): String {
        val h = host.trim()
        if (brand == Brand.CUSTOM || h.isEmpty()) return ""
        val withPort = if (h.contains(':')) h else "$h:${brand.defaultPort}"
        return "rtsp://$withPort${brand.path(channel.coerceAtLeast(1), sub, name)}"
    }

    /**
     * Returns [url] with the username and password put into it (rtsp://user:pass@host/...),
     * which is how Media3's RTSP client does Basic and Digest login. Credentials already in
     * the URL are replaced. Special characters are percent-encoded.
     */
    fun withCredentials(url: String, username: String, password: String): String {
        if (username.isEmpty()) return url
        val scheme = url.substringBefore("://", missingDelimiterValue = "")
        if (scheme.isEmpty()) return url
        val rest = url.substringAfter("://")
        val authorityEnd = rest.indexOfFirst { it == '/' || it == '?' || it == '#' }.let { if (it < 0) rest.length else it }
        val authority = rest.substring(0, authorityEnd)
        val hostPort = authority.substringAfterLast('@')
        val auth = encode(username) + if (password.isNotEmpty()) ":" + encode(password) else ""
        return "$scheme://$auth@$hostPort${rest.substring(authorityEnd)}"
    }

    /** Hides the password in a URL for display, e.g. rtsp://admin:***@host/... */
    fun redacted(url: String): String {
        val scheme = url.substringBefore("://", missingDelimiterValue = "")
        if (scheme.isEmpty()) return url
        val rest = url.substringAfter("://")
        val at = rest.indexOf('@')
        val slash = rest.indexOf('/').let { if (it < 0) rest.length else it }
        if (at < 0 || at > slash) return url
        val user = rest.substring(0, at).substringBefore(':')
        return "$scheme://$user:***@${rest.substring(at + 1)}"
    }

    fun isRtsp(url: String): Boolean = url.trim().lowercase().let { it.startsWith("rtsp://") || it.startsWith("rtsps://") }

    private fun encode(s: String): String = buildString {
        for (b in s.toByteArray(Charsets.UTF_8)) {
            val c = b.toInt() and 0xFF
            val ch = c.toChar()
            if (ch.isLetterOrDigit() && c < 128 || ch in "-._~") append(ch)
            else append('%').append("%02X".format(c))
        }
    }

    private fun slug(name: String): String =
        name.trim().lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-').ifEmpty { "camera" }
}
