package com.iqraquran.app.data

/**
 * Memorization the madrasa way:
 * - Sabaq: today's new lesson.
 * - Sabqi: lessons from the last 7 days, revised every day.
 * - Manzil: older lessons, revised on a growing schedule so nothing is forgotten.
 * Days are counted as epoch days (days since 1970-01-01). Pure Kotlin for unit tests.
 */
object Hifz {

    /** One memorized passage: [from] to [to] ayahs of [surah]. */
    data class Item(
        val surah: Int,
        val from: Int,
        val to: Int,
        val learnedOn: Long,
        val lastReview: Long,
        val level: Int = 0,
        val weak: Boolean = false,
    ) {
        val key: String get() = "$surah:$from-$to"
    }

    enum class Group { Sabaq, Sabqi, Manzil }

    /** Days between Manzil revisions, growing each time a passage is revised well. */
    private val intervals = listOf(1, 2, 4, 7, 14, 21, 30)

    fun interval(level: Int): Int = intervals[level.coerceIn(0, intervals.lastIndex)]

    fun group(item: Item, today: Long): Group = when (today - item.learnedOn) {
        0L -> Group.Sabaq
        in 1L..7L -> Group.Sabqi
        else -> Group.Manzil
    }

    /** Whether [item] should be revised today. Sabaq and Sabqi are daily; weak passages too. */
    fun isDue(item: Item, today: Long): Boolean {
        if (item.lastReview >= today) return false
        return when (group(item, today)) {
            Group.Sabaq, Group.Sabqi -> true
            Group.Manzil -> item.weak || today - item.lastReview >= interval(item.level)
        }
    }

    /** After a revision: "good" moves the next Manzil revision further out, "weak" brings it back. */
    fun reviewed(item: Item, today: Long, good: Boolean): Item =
        if (good) {
            item.copy(lastReview = today, level = item.level + 1, weak = false)
        } else {
            item.copy(lastReview = today, level = maxOf(0, item.level - 2), weak = true)
        }

    /** One ayah to play; [round] counts the repeats so the screen can show "2 of 5". */
    data class Step(val surah: Int, val ayah: Int, val round: Int, val rounds: Int)

    /**
     * The listening plan for a lesson: each ayah [perAyah] times, then the whole passage
     * [wholeTimes] times so the ayahs join up in memory.
     */
    fun plan(surah: Int, from: Int, to: Int, perAyah: Int, wholeTimes: Int): List<Step> {
        require(from in 1..to) { "bad range $from-$to" }
        val single = (from..to).flatMap { a -> (1..perAyah).map { r -> Step(surah, a, r, perAyah) } }
        val whole = if (to > from) {
            (1..wholeTimes).flatMap { r -> (from..to).map { a -> Step(surah, a, r, wholeTimes) } }
        } else {
            emptyList()
        }
        return single + whole
    }

    /** Where each of the 30 juz starts, as surah to ayah. */
    val juzStarts: List<Pair<Int, Int>> = listOf(
        1 to 1, 2 to 142, 2 to 253, 3 to 93, 4 to 24, 4 to 148, 5 to 82, 6 to 111, 7 to 88, 8 to 41,
        9 to 93, 11 to 6, 12 to 53, 15 to 1, 17 to 1, 18 to 75, 21 to 1, 23 to 1, 25 to 21, 27 to 56,
        29 to 46, 33 to 31, 36 to 28, 39 to 32, 41 to 47, 46 to 1, 51 to 31, 58 to 1, 67 to 1, 78 to 1,
    )

    /** The juz (1 to 30) an ayah is in. */
    fun juzOf(surah: Int, ayah: Int): Int {
        var juz = 1
        for ((i, start) in juzStarts.withIndex()) {
            if (surah > start.first || (surah == start.first && ayah >= start.second)) juz = i + 1
        }
        return juz
    }

    /**
     * Share of each juz memorized, 0 to 1, from [items] and the ayah count of each surah
     * ([ayahCounts], index 0 = surah 1).
     */
    fun juzProgress(items: List<Item>, ayahCounts: List<Int>): List<Float> {
        val total = IntArray(30)
        ayahCounts.forEachIndexed { i, count -> for (a in 1..count) total[juzOf(i + 1, a) - 1]++ }
        val known = HashSet<Pair<Int, Int>>()
        items.forEach { for (a in it.from..it.to) known += it.surah to a }
        val done = IntArray(30)
        known.forEach { (s, a) -> done[juzOf(s, a) - 1]++ }
        return (0 until 30).map { if (total[it] == 0) 0f else done[it].toFloat() / total[it] }
    }
}
