package com.livetv.app

import android.content.Context
import android.content.SharedPreferences
import com.livetv.app.data.Channel
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Counts how long each channel is watched, per day, so the owner's stats page can show what
 * people watch. Only totals are kept here; Live TV sends them to Firebase now and then.
 */
object Watching {
    /** One channel's total for a day. */
    class Entry(val name: String, val country: String, val group: String, val category: String, var seconds: Long)

    private var prefs: SharedPreferences? = null
    /** Day ("yyyy-MM-dd") → channel key → total. */
    private val days = mutableMapOf<String, MutableMap<String, Entry>>()
    private var current: Channel? = null
    private var since = 0L
    private var inForeground = true

    @Synchronized
    fun init(context: Context) {
        if (prefs != null) return
        prefs = context.getSharedPreferences("watching", Context.MODE_PRIVATE)
        runCatching {
            val all = JSONObject(prefs!!.getString(K_DAYS, "{}")!!)
            for (day in all.keys()) {
                val chans = all.getJSONObject(day)
                days[day] = chans.keys().asSequence().associateWith { k ->
                    chans.getJSONObject(k).let {
                        Entry(it.optString("n"), it.optString("c"), it.optString("g"), it.optString("t"), it.optLong("s"))
                    }
                }.toMutableMap()
            }
        }
        // Totals that were never sent (an app without an account, or long offline) don't pile up.
        val keep = today(System.currentTimeMillis() - 7 * DAY)
        days.keys.removeAll { it < keep }
    }

    /** Screens showing a channel as their main picture; the newest one counts. */
    private val screens = LinkedHashMap<Any, Channel>()

    /** [screen] now shows [channel] as its main picture. */
    @Synchronized
    fun watch(screen: Any, channel: Channel) {
        add()
        screens.remove(screen)
        screens[screen] = channel
        current = channel
    }

    /** [screen] no longer shows a channel. */
    @Synchronized
    fun stop(screen: Any) {
        if (screens.remove(screen) == null) return
        add()
        current = screens.values.lastOrNull()
    }

    /** The app went to the background (false) or came back (true). */
    @Synchronized
    fun foreground(on: Boolean) {
        add()
        inForeground = on
        if (!on) save()
    }

    /** Every day's totals so far, oldest first, including what's on screen right now. */
    @Synchronized
    fun totals(): List<Pair<String, Map<String, Entry>>> {
        add()
        save()
        return days.toSortedMap().map { (day, m) ->
            day to m.mapValues { (_, e) -> Entry(e.name, e.country, e.group, e.category, e.seconds) }
        }
    }

    /** Totals of days before today, once they have been sent, are no longer needed. */
    @Synchronized
    fun sent(day: String) {
        if (day < today(System.currentTimeMillis())) {
            days.remove(day)
            save()
        }
    }

    /** Adds the time since the last count to the channel on screen, split at midnight. */
    private fun add() {
        val now = System.currentTimeMillis()
        val channel = current
        if (channel != null && inForeground && since > 0) {
            var from = since
            while (from < now) {
                val day = today(from)
                val midnight = startOfNextDay(from)
                val to = minOf(now, midnight)
                // A gap of over 6 hours means the clock jumped or the TV slept; don't count it.
                if (to - from < 6 * 3600_000L) {
                    val key = Integer.toHexString(channel.id.hashCode())
                    val e = days.getOrPut(day) { mutableMapOf() }.getOrPut(key) {
                        Entry(
                            channel.name.take(80),
                            channel.country.orEmpty(),
                            channel.group.orEmpty().take(60),
                            channel.category.orEmpty().take(40),
                            0,
                        )
                    }
                    e.seconds += (to - from) / 1000
                }
                from = to
            }
        }
        since = now
    }

    private fun save() {
        val p = prefs ?: return
        val all = JSONObject()
        for ((day, m) in days) {
            val chans = JSONObject()
            for ((k, e) in m) {
                chans.put(k, JSONObject().put("n", e.name).put("c", e.country).put("g", e.group).put("t", e.category).put("s", e.seconds))
            }
            all.put(day, chans)
        }
        p.edit().putString(K_DAYS, all.toString()).apply()
    }

    fun today(time: Long): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(time))

    private fun startOfNextDay(time: Long): Long = java.util.Calendar.getInstance().run {
        timeInMillis = time
        set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0)
        set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0)
        add(java.util.Calendar.DAY_OF_MONTH, 1)
        timeInMillis
    }

    private const val K_DAYS = "days"
    private const val DAY = 24 * 3600_000L
}
