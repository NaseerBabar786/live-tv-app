package com.livetv.app

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

/**
 * Counts how long each part of the app is used, and how often it's opened, per day, so the owner can see
 * which features viewers use most (tv.bulkbazaar.ca/users and /stats, owner 2026-10-08). The keys are the
 * packages' feature keys ("browse", "five", "news"...) plus "list" (1+List) and "full" (a channel full screen);
 * the PC app (cabletv-pc/src/ui/features.js) uses the same ones. Cable TV sends the totals with [Watching]'s.
 */
object Features {
    class Use(var seconds: Long, var opens: Int)

    /** Day ("yyyy-MM-dd") → feature key → total. */
    private val days = mutableMapOf<String, MutableMap<String, Use>>()
    private var prefs: SharedPreferences? = null
    private var current: String? = null
    private var since = 0L
    private var inForeground = true

    fun init(context: Context) {
        if (prefs != null) return
        prefs = context.getSharedPreferences("features", Context.MODE_PRIVATE)
        runCatching {
            val all = JSONObject(prefs!!.getString(K_DAYS, "{}")!!)
            for (day in all.keys()) {
                val m = all.getJSONObject(day)
                days[day] = m.keys().asSequence().associateWith { k ->
                    m.getJSONObject(k).let { Use(it.optLong("s"), it.optInt("o")) }
                }.toMutableMap()
            }
        }
        val keep = Watching.today(System.currentTimeMillis() - 7 * DAY)
        days.keys.filter { it < keep }.forEach { days.remove(it) }
    }

    /** [key] is on screen now (an open counts when it changes). */
    @Synchronized
    fun use(key: String) {
        if (key == current) return
        add()
        current = key
        days.getOrPut(Watching.today(System.currentTimeMillis())) { mutableMapOf() }.getOrPut(key) { Use(0, 0) }.opens++
    }

    /** The app went to the background (false) or came back (true). */
    @Synchronized
    fun foreground(on: Boolean) {
        add()
        inForeground = on
        if (!on) save()
    }

    /** Every day's totals so far, including what's on screen now. */
    @Synchronized
    fun totals(): Map<String, Map<String, Use>> {
        add()
        save()
        return days.mapValues { (_, m) -> m.mapValues { (_, u) -> Use(u.seconds, u.opens) } }
    }

    /** Days before today, once sent, are no longer needed. */
    @Synchronized
    fun sent(day: String) {
        if (day < Watching.today(System.currentTimeMillis()) && days.remove(day) != null) save()
    }

    private fun add() {
        val now = System.currentTimeMillis()
        val key = current
        // A gap of over 6 hours means the clock jumped or the TV slept; don't count it.
        if (key != null && inForeground && since > 0 && now - since in 1 until 6 * 3600_000L) {
            days.getOrPut(Watching.today(now)) { mutableMapOf() }.getOrPut(key) { Use(0, 0) }.seconds += (now - since) / 1000
        }
        since = now
    }

    private fun save() {
        val p = prefs ?: return
        val all = JSONObject()
        for ((day, m) in days) all.put(day, JSONObject().apply { for ((k, u) in m) put(k, JSONObject().put("s", u.seconds).put("o", u.opens)) })
        p.edit().putString(K_DAYS, all.toString()).apply()
    }

    private const val K_DAYS = "days"
    private const val DAY = 24 * 3600_000L
}
