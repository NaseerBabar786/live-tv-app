package com.iqraquran.app.data

/** Version helpers for the updater. Pure Kotlin so they run in plain JVM unit tests. */
object UpdateVersions {

    /** Iqra Quran releases are tagged "iqra-quran-v<versionName>" by CI. */
    const val TAG_PREFIX = "iqra-quran-v"

    /** "iqra-quran-v1.0.2" -> "1.0.2", or null for other apps' releases in the same repository. */
    fun versionFromTag(tag: String): String? =
        tag.takeIf { it.startsWith(TAG_PREFIX) }?.removePrefix(TAG_PREFIX)?.takeIf { it.isNotBlank() }

    /** Compares dotted versions number by number, so "0.10.0" is newer than "0.9.9". */
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
