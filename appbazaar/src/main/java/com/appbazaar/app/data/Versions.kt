package com.appbazaar.app.data

/** Version helpers. Pure Kotlin so they run in plain JVM unit tests. */
object Versions {

    /** Compares dotted versions number by number, so "1.10.0" is newer than "1.9.9". */
    fun isNewer(candidate: String, installed: String): Boolean = compare(candidate, installed) > 0

    fun compare(a: String, b: String): Int {
        val x = numbers(a)
        val y = numbers(b)
        for (i in 0 until maxOf(x.size, y.size)) {
            val d = x.getOrElse(i) { 0 }.compareTo(y.getOrElse(i) { 0 })
            if (d != 0) return d
        }
        return 0
    }

    /** "1.9.10-beta" -> [1, 9, 10]; anything after the numbers is ignored. */
    private fun numbers(v: String): List<Int> =
        v.trim().removePrefix("v").split(".").map { part -> part.takeWhile { it.isDigit() }.toIntOrNull() ?: 0 }
}
