package com.livetv.app.data

/**
 * Parses extended M3U / M3U8 IPTV playlists.
 *
 * Supports the common attributes used by IPTV lists:
 *   #EXTINF:-1 tvg-id="x" tvg-logo="http://..." group-title="News",Channel Name
 *   #EXTVLCOPT:http-user-agent=...
 *   #EXTVLCOPT:http-referrer=...
 *   #EXTGRP:Group
 */
object M3uParser {

    private val attrRegex = Regex("""([\w-]+)="([^"]*)"""")

    fun parse(text: String): List<Channel> {
        val channels = mutableListOf<Channel>()

        var name: String? = null
        var attrs: Map<String, String> = emptyMap()
        var extGroup: String? = null
        var userAgent: String? = null
        var referrer: String? = null

        fun reset() {
            name = null; attrs = emptyMap(); extGroup = null; userAgent = null; referrer = null
        }

        text.lineSequence()
            .map { it.trim().removePrefix("﻿") }
            .filter { it.isNotEmpty() }
            .forEach { line ->
                when {
                    line.startsWith("#EXTINF", ignoreCase = true) -> {
                        reset()
                        val body = line.substringAfter(':', "")
                        val header = headerPart(body)
                        attrs = attrRegex.findAll(header)
                            .associate { it.groupValues[1].lowercase() to it.groupValues[2] }
                        name = body.substring(header.length).removePrefix(",").trim()
                    }
                    line.startsWith("#EXTGRP:", ignoreCase = true) ->
                        extGroup = line.substringAfter(':').trim()
                    line.startsWith("#EXTVLCOPT:", ignoreCase = true) -> {
                        val opt = line.substringAfter(':')
                        val key = opt.substringBefore('=').trim().lowercase()
                        val value = opt.substringAfter('=', "").trim()
                        when (key) {
                            "http-user-agent" -> userAgent = value
                            "http-referrer", "http-referer" -> referrer = value
                        }
                    }
                    line.startsWith("#") -> Unit // #EXTM3U and other directives
                    else -> {
                        val url = line
                        val displayName = name?.takeIf { it.isNotBlank() }
                            ?: attrs["tvg-name"]?.takeIf { it.isNotBlank() }
                            ?: url.substringAfterLast('/').substringBefore('?')
                        channels += Channel(
                            name = displayName,
                            url = url,
                            logo = attrs["tvg-logo"]?.takeIf { it.isNotBlank() },
                            group = (attrs["group-title"] ?: extGroup)?.takeIf { it.isNotBlank() },
                            tvgId = attrs["tvg-id"]?.takeIf { it.isNotBlank() },
                            language = attrs["tvg-language"]?.substringBefore(';')?.takeIf { it.isNotBlank() },
                            category = attrs["tvg-genre"]?.substringBefore(';')?.takeIf { it.isNotBlank() },
                            country = attrs["tvg-country"]?.substringBefore(';')?.lowercase()?.takeIf { it.isNotBlank() },
                            userAgent = userAgent ?: attrs["http-user-agent"],
                            referrer = referrer ?: attrs["http-referrer"],
                            added = attrs["added"]?.takeIf { it.isNotBlank() },
                            mins = attrs["mins"]?.toIntOrNull()?.takeIf { it > 0 },
                            desc = attrs["desc"]?.trim()?.takeIf { it.isNotBlank() },
                            genres = attrs["genres"]?.split(';')?.map { it.trim() }?.filter { it.isNotEmpty() }.orEmpty(),
                            year = attrs["year"]?.toIntOrNull()?.takeIf { it in 1890..2100 },
                            pub = attrs["pub"]?.takeIf { it.length == 10 },
                            trailer = attrs["trailer"]?.takeIf { it.length == 11 },
                        )
                        reset()
                    }
                }
            }
        return channels
    }

    /**
     * Returns the part of an EXTINF body before the display-name comma,
     * ignoring commas that appear inside quoted attribute values.
     */
    private fun headerPart(body: String): String {
        var inQuotes = false
        for (i in body.indices) {
            when (body[i]) {
                '"' -> inQuotes = !inQuotes
                ',' -> if (!inQuotes) return body.substring(0, i)
            }
        }
        return body
    }
}
