package com.livetv.app

import android.content.Context
import android.content.SharedPreferences
import com.livetv.app.data.Channel
import com.livetv.app.data.MyChannel
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Counts how long each channel is watched, per day, so the owner's stats page can show what
 * people watch. Only totals are kept here; Cable TV sends them to Firebase now and then.
 */
object Watching {
    /** One channel's total for a day. */
    class Entry(val name: String, val country: String, val group: String, val category: String, var seconds: Long)

    /** One programme on our own channels ([station] is its MyChannel station id), watched for [seconds] that day. */
    class Programme(val title: String, val station: String, val show: String, var seconds: Long)

    /** One day's totals: per channel, per programme on our channels, and per weekday and hour on our channels. */
    class Day(
        val channels: Map<String, Entry>,
        val programmes: Map<String, Programme>,
        /** "station|w-HH" → seconds; w is the weekday (0 = Sunday) and HH the hour, in the channel's time zone. */
        val hours: Map<String, Long>,
    )

    private var prefs: SharedPreferences? = null
    /** Day ("yyyy-MM-dd") → channel key → total. */
    private val days = mutableMapOf<String, MutableMap<String, Entry>>()
    /** Day → programme key → total (1.9.65: which programmes on our channels people watch). */
    private val progs = mutableMapOf<String, MutableMap<String, Programme>>()
    /** Day → "station|w-HH" → seconds. */
    private val hours = mutableMapOf<String, MutableMap<String, Long>>()
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
            val p = JSONObject(prefs!!.getString(K_PROGS, "{}")!!)
            for (day in p.keys()) {
                val m = p.getJSONObject(day)
                progs[day] = m.keys().asSequence().associateWith { k ->
                    m.getJSONObject(k).let { Programme(it.optString("t"), it.optString("st"), it.optString("sh"), it.optLong("s")) }
                }.toMutableMap()
            }
            val h = JSONObject(prefs!!.getString(K_HOURS, "{}")!!)
            for (day in h.keys()) {
                val m = h.getJSONObject(day)
                hours[day] = m.keys().asSequence().associateWith { m.optLong(it) }.toMutableMap()
            }
        }
        // Totals that were never sent (an app without an account, or long offline) don't pile up.
        val keep = today(System.currentTimeMillis() - 7 * DAY)
        days.keys.removeAll { it < keep }
        progs.keys.removeAll { it < keep }
        hours.keys.removeAll { it < keep }
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
        if (inForeground) { lastName = channel.name.take(80); lastAt = System.currentTimeMillis() }
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

    /** The last channel watched, when it was last on screen, and whether it's on screen now (for the owner's /users page). */
    class Now(val name: String, val at: Long, val live: Boolean)
    private var lastName: String? = null
    private var lastAt = 0L

    @Synchronized
    fun now(): Now? {
        add()
        val name = lastName ?: return null
        return Now(name, lastAt, current != null && inForeground)
    }

    /** Every day's totals so far, oldest first, including what's on screen right now. */
    @Synchronized
    fun totals(): List<Pair<String, Day>> {
        add()
        save()
        return days.keys.union(progs.keys).union(hours.keys).sorted().map { day ->
            day to Day(
                days[day].orEmpty().mapValues { (_, e) -> Entry(e.name, e.country, e.group, e.category, e.seconds) },
                progs[day].orEmpty().mapValues { (_, p) -> Programme(p.title, p.station, p.show, p.seconds) },
                hours[day].orEmpty().toMap(),
            )
        }
    }

    /** Totals of days before today, once they have been sent, are no longer needed. */
    @Synchronized
    fun sent(day: String) {
        if (day < today(System.currentTimeMillis())) {
            days.remove(day)
            progs.remove(day)
            hours.remove(day)
            save()
        }
    }

    /** Adds the time since the last count to the channel on screen, split at midnight. */
    private fun add() {
        val now = System.currentTimeMillis()
        val channel = current
        if (channel != null && inForeground) { lastName = channel.name.take(80); lastAt = now }
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
                    if (MyChannel.isMine(channel)) runCatching { addProgrammes(day, channel, from, to) }
                }
                from = to
            }
        }
        since = now
    }

    /**
     * Splits [from]..[to] on one of our scheduled channels (not the ones playing YouTube pages, where
     * we can't tell which video is on) into the programmes its schedule had on, and into hours.
     */
    private fun addProgrammes(day: String, channel: Channel, from: Long, to: Long) {
        if (MyChannel.webPage(channel) != null) return
        val config = MyChannel.configOf(channel) ?: return
        val tz = java.util.TimeZone.getTimeZone(config.timeZone)
        var t = from
        var guard = 0
        while (t < to && guard++ < 500) {
            val cal = java.util.Calendar.getInstance(tz).apply { timeInMillis = t }
            val hourEnd = (cal.clone() as java.util.Calendar).apply {
                set(java.util.Calendar.MINUTE, 0); set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0)
                add(java.util.Calendar.HOUR_OF_DAY, 1)
            }.timeInMillis
            val now = MyChannel.whatsOn(config, t)
            var end = minOf(to, hourEnd)
            if (now is MyChannel.Now.Playing) {
                end = minOf(end, now.untilMs).coerceAtLeast(t + 1000)
                val secs = (minOf(end, to) - t) / 1000
                if (secs > 0) {
                    val title = now.video.title.take(80)
                    val key = Integer.toHexString("${config.id}|$title".hashCode())
                    progs.getOrPut(day) { mutableMapOf() }.getOrPut(key) { Programme(title, config.id, now.show.take(80), 0) }.seconds += secs
                    val slot = "${config.id}|${cal.get(java.util.Calendar.DAY_OF_WEEK) - 1}-" + String.format(Locale.US, "%02d", cal.get(java.util.Calendar.HOUR_OF_DAY))
                    val h = hours.getOrPut(day) { mutableMapOf() }
                    h[slot] = (h[slot] ?: 0L) + secs
                }
            } else if (now is MyChannel.Now.OffAir) {
                end = minOf(end, now.nextAt ?: end).coerceAtLeast(t + 1000)
            }
            t = end
        }
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
        val pr = JSONObject()
        for ((day, m) in progs) {
            val o = JSONObject()
            for ((k, e) in m) o.put(k, JSONObject().put("t", e.title).put("st", e.station).put("sh", e.show).put("s", e.seconds))
            pr.put(day, o)
        }
        val hr = JSONObject()
        for ((day, m) in hours) hr.put(day, JSONObject().apply { for ((k, v) in m) put(k, v) })
        p.edit().putString(K_DAYS, all.toString()).putString(K_PROGS, pr.toString()).putString(K_HOURS, hr.toString()).apply()
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
    private const val K_PROGS = "programmes"
    private const val K_HOURS = "hours"
    private const val DAY = 24 * 3600_000L
}
