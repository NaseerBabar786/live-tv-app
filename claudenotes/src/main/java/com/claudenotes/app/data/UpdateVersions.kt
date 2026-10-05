package com.claudenotes.app.data

/** Version helpers for the updater. Pure Kotlin so they run in plain JVM unit tests. */
object UpdateVersions {

    /** CI names the fixed "claude-notes" release "Notes for Claude <versionName>". */
    const val TITLE_PREFIX = "Notes for Claude "

    /** "Notes for Claude 1.0.2" -> "1.0.2", or null when the title has no version. */
    fun versionFromTitle(title: String): String? =
        title.takeIf { it.startsWith(TITLE_PREFIX) }?.removePrefix(TITLE_PREFIX)?.trim()
            ?.takeIf { it.isNotEmpty() && it.first().isDigit() }

    /** Compares dotted versions number by number, so "1.10.0" is newer than "1.9.9". */
    fun isNewer(candidate: String, installed: String): Boolean = compare(candidate, installed) > 0

    fun compare(a: String, b: String): Int {
        val x = a.split(".").map { it.toIntOrNull() ?: 0 }
        val y = b.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(x.size, y.size)) {
            val d = x.getOrElse(i) { 0 }.compareTo(y.getOrElse(i) { 0 })
            if (d != 0) return d
        }
        return 0
    }
}
