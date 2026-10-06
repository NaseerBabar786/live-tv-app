package com.livetv.app.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.io.File
import java.util.Calendar
import java.util.TimeZone

/**
 * The owner's own channel, run from tv.bulkbazaar.ca/channel. There is no streaming server: the
 * page saves a schedule (videos, time slots and a loop list) and every app works out from the clock
 * what is on now and how far into it, so all viewers see the same moment, like live TV.
 */
object MyChannel {
    /** The channel's stream address in the channel list; [StreamPlayer] plays the schedule instead. */
    const val URL = "mychannel://main"

    fun isMine(channel: Channel?) = channel?.url == URL

    class Video(val id: String, val title: String, val url: String, /** 0 for a live stream. */ val seconds: Long)

    class Slot(
        /** "all", "weekdays", "weekend", "mon".."sun", or a date "yyyy-MM-dd". */
        val day: String,
        /** "HH:mm" in the channel's time zone. */
        val time: String,
        val video: String,
    )

    class Config(
        val name: String,
        val logo: String?,
        val active: Boolean,
        val timeZone: String,
        val videos: List<Video>,
        val slots: List<Slot>,
        /** Video ids played one after another, round the clock, when no slot is on. */
        val loop: List<String>,
        /** The scrolling line along the bottom of the picture; null when off. */
        val ticker: String? = null,
        /** Where the logo sits on the picture: "tl", "tr", "bl", "br", or "off". */
        val logoCorner: String = "tr",
    ) {
        val channel: Channel
            get() = Channel(name = name, url = URL, logo = logo, number = 0)
    }

    /** What to show at a moment. */
    sealed class Now {
        /** Play [video] from [offsetMs] until [untilMs] (wall clock), when the schedule moves on. */
        class Playing(val video: Video, val offsetMs: Long, val untilMs: Long) : Now()
        /** Nothing on; [next] starts at [nextAt] (null when nothing is booked). */
        class OffAir(val next: Video?, val nextAt: Long?) : Now()
    }

    private val _config = MutableStateFlow<Config?>(null)
    /** The channel when the owner switched it on and gave it something to play; null otherwise. */
    val config: StateFlow<Config?> = _config.asStateFlow()

    private var file: File? = null

    /** Reads the saved schedule, so the channel shows before the network answers. */
    @Synchronized
    fun init(context: Context) {
        if (file != null) return
        file = File(context.applicationContext.filesDir, "my_channel.json")
        runCatching { file!!.takeIf { it.exists() }?.readText()?.let { _config.value = usable(parse(JSONObject(it))) } }
    }

    /** Stores the owner's latest settings ([json] as saved by the website; null when there are none). */
    fun update(json: JSONObject?) {
        val parsed = json?.let { runCatching { parse(it) }.getOrNull() }
        runCatching { if (json == null) file?.delete() else file?.writeText(json.toString()) }
        _config.value = usable(parsed)
    }

    private fun usable(c: Config?) = c?.takeIf { it.active && it.videos.isNotEmpty() }

    /** Parses { name, logo, active, tz, videos:[{id,title,url,secs}], slots:[{day,time,video}], loop:[ids] }. */
    fun parse(o: JSONObject): Config {
        val videos = o.optJSONArray("videos")?.let { a ->
            (0 until a.length()).mapNotNull { i ->
                val v = a.optJSONObject(i) ?: return@mapNotNull null
                val url = v.optString("url").trim()
                if (url.isEmpty()) return@mapNotNull null
                Video(v.optString("id"), v.optString("title").ifBlank { "My channel" }, url, v.optLong("secs").coerceAtLeast(0))
            }
        }.orEmpty()
        val slots = o.optJSONArray("slots")?.let { a ->
            (0 until a.length()).mapNotNull { i ->
                val s = a.optJSONObject(i) ?: return@mapNotNull null
                Slot(s.optString("day", "all"), s.optString("time"), s.optString("video"))
            }
        }.orEmpty()
        val loop = o.optJSONArray("loop")?.let { a -> (0 until a.length()).map { a.optString(it) } }.orEmpty()
        return Config(
            name = o.optString("name").trim().ifEmpty { "My Channel" },
            logo = o.optString("logo").trim().takeIf { it.startsWith("http") },
            active = o.optBoolean("active", true),
            timeZone = o.optString("tz").ifBlank { "America/Toronto" },
            videos = videos,
            slots = slots,
            loop = loop,
            ticker = o.optString("ticker").trim().takeIf { it.isNotEmpty() && o.optBoolean("tickerOn", true) },
            logoCorner = o.optString("logoCorner").ifBlank { "tr" },
        )
    }

    /** What the current settings put on air at [nowMs]; off air when the channel is off. */
    fun now(nowMs: Long = System.currentTimeMillis()): Now = _config.value?.let { whatsOn(it, nowMs) } ?: Now.OffAir(null, null)

    private class Start(val at: Long, val video: Video, val dated: Boolean)

    /**
     * What [c] plays at [nowMs]. A slot plays its video from its start time to the end of the
     * video, or until the next slot starts. Between slots the loop list plays back to back, timed
     * from a fixed point so every viewer is at the same place in it.
     */
    fun whatsOn(c: Config, nowMs: Long): Now {
        val byId = c.videos.associateBy { it.id }
        val tz = TimeZone.getTimeZone(c.timeZone)
        val starts = (-1..1).flatMap { d -> slotsOn(c, byId, tz, nowMs, d) }
            // A slot for a date wins over a repeating one at the same time.
            .sortedWith(compareBy<Start>({ it.at }, { !it.dated }))
            .distinctBy { it.at }
        val current = starts.lastOrNull { it.at <= nowMs }
        val next = starts.firstOrNull { it.at > nowMs }
        val nextAt = next?.at ?: Long.MAX_VALUE
        if (current != null) {
            val end = if (current.video.seconds > 0) current.at + current.video.seconds * 1000 else Long.MAX_VALUE
            if (nowMs < end) return Now.Playing(current.video, nowMs - current.at, minOf(end, nextAt))
        }
        val loop = c.loop.mapNotNull { byId[it] }.filter { it.seconds > 0 }
        val total = loop.sumOf { it.seconds * 1000 }
        if (total > 0) {
            var pos = Math.floorMod(nowMs, total)
            for (v in loop) {
                val len = v.seconds * 1000
                if (pos < len) return Now.Playing(v, pos, minOf(nowMs - pos + len, nextAt))
                pos -= len
            }
        }
        // A live stream in the loop plays on until the next slot.
        c.loop.mapNotNull { byId[it] }.firstOrNull { it.seconds == 0L }?.let { return Now.Playing(it, 0, nextAt) }
        return Now.OffAir(next?.video, next?.at)
    }

    private fun slotsOn(c: Config, byId: Map<String, Video>, tz: TimeZone, nowMs: Long, dayOffset: Int): List<Start> {
        val cal = Calendar.getInstance(tz).apply {
            timeInMillis = nowMs
            add(Calendar.DAY_OF_MONTH, dayOffset)
        }
        val date = "%04d-%02d-%02d".format(cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH))
        val weekday = cal.get(Calendar.DAY_OF_WEEK)
        return c.slots.mapNotNull { s ->
            val video = byId[s.video] ?: return@mapNotNull null
            if (!onDay(s.day, date, weekday)) return@mapNotNull null
            val (h, m) = s.time.split(':').mapNotNull { it.trim().toIntOrNull() }.takeIf { it.size == 2 } ?: return@mapNotNull null
            val at = (cal.clone() as Calendar).apply {
                set(Calendar.HOUR_OF_DAY, h)
                set(Calendar.MINUTE, m)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }.timeInMillis
            Start(at, video, dated = s.day.length == 10)
        }
    }

    private val weekdays = listOf("sun", "mon", "tue", "wed", "thu", "fri", "sat")

    private fun onDay(day: String, date: String, weekday: Int): Boolean = when (day) {
        "", "all" -> true
        "weekdays" -> weekday in Calendar.MONDAY..Calendar.FRIDAY
        "weekend" -> weekday == Calendar.SATURDAY || weekday == Calendar.SUNDAY
        in weekdays -> weekdays.indexOf(day) + 1 == weekday
        else -> day == date
    }
}
