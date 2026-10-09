package com.iqraquran.app.data

/**
 * What a learner has memorized in Learn Namaz: surahs and duas (each with the day it was
 * marked, as an epoch day), plus the extra surahs they added to their plan beyond the first 30.
 * Saved as a short text line so it needs nothing from Android (and can be unit tested).
 */
data class NamazProgress(
    val surahs: Map<Int, Long> = emptyMap(),
    val duas: Map<String, Long> = emptyMap(),
    val extra: List<Int> = emptyList(),
) {
    /** The learner's whole surah plan: the 30 namaz surahs, then their own additions. */
    val plan: List<Int> get() = Namaz.starterSurahs + extra.filter { it !in Namaz.starterSurahs }

    fun toJson(): String = buildString {
        append("s=").append(surahs.entries.joinToString(",") { "${it.key}:${it.value}" })
        append(";d=").append(duas.entries.joinToString(",") { "${it.key}:${it.value}" })
        append(";p=").append(extra.joinToString(","))
    }

    companion object {
        fun fromJson(text: String?): NamazProgress {
            if (text.isNullOrBlank()) return NamazProgress()
            val parts = text.split(';').associate { part ->
                val i = part.indexOf('=')
                if (i < 0) "" to "" else part.substring(0, i) to part.substring(i + 1)
            }
            fun pairs(v: String?) = v.orEmpty().split(',').mapNotNull { e ->
                val i = e.lastIndexOf(':')
                if (i <= 0) null else e.substring(0, i) to (e.substring(i + 1).toLongOrNull() ?: return@mapNotNull null)
            }
            return NamazProgress(
                surahs = pairs(parts["s"]).mapNotNull { (k, v) -> k.toIntOrNull()?.let { it to v } }.toMap(),
                duas = pairs(parts["d"]).toMap(),
                extra = parts["p"].orEmpty().split(',').mapNotNull { it.toIntOrNull() }.filter { it in 1..114 }.distinct(),
            )
        }
    }
}
