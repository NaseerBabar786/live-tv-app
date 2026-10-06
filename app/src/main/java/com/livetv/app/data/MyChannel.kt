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
 * The owner's own channels, run from tv.bulkbazaar.ca/studio. There is no streaming server: the
 * page saves a schedule (videos, time slots and a loop list) and every app works out from the clock
 * what is on now and how far into it, so all viewers see the same moment, like live TV.
 */
object MyChannel {
    /**
     * Our logos get redrawn at the same address (1.9.47, 1.9.49), and Coil keeps the old picture on
     * disk for ever, so our own logo links carry this number; raise it whenever the logos change.
     */
    private const val LOGO_VERSION = 4

    fun freshLogo(url: String): String =
        if ("/channel/logos/" in url && '?' !in url) "$url?v=$LOGO_VERSION" else url

    /**
     * One of our channels: [id] names its saved settings and its stream address, [number] is its
     * channel number (our channels are 1 to [COUNT], 1.9.45), and [dial] the row of zeros that
     * reached it before then, which still works.
     */
    class Station(
        val id: String,
        val number: Int,
        val dial: String,
        val name: String,
        /** Runs like Bazaar Hits (1.9.47): official YouTube videos on our page, its schedule only the backup. */
        val youtube: Boolean = false,
        /**
         * Whose ready-made schedule is the backup, for a channel with none of its own (9 to 11, 1.9.50);
         * it then keeps its own [name] and logo ([logo], under tv.bulkbazaar.ca/channel/logos/).
         */
        val backup: String = id,
        val logo: String? = null,
    )

    /** Our channels take numbers 1 to 12; the other channels are numbered from 13. */
    const val COUNT = 12

    /**
     * Our channels, in the order they lead the channel list. Since 1.9.47 all but Bazaar TV run
     * from official YouTube videos (tools/build_youtube_channels.py); the free films below are their backup.
     */
    val STATIONS = listOf(
        Station("main", 1, "0", "Bazaar TV"),
        // Public-domain classic films round the clock (built weekly from Movies.m3u).
        Station("filmein", 2, "00", "Bazaar Cinema", youtube = true),
        // Free-to-use music (public domain and CC BY, from Wikimedia Commons), built by tools/build_sur.py.
        Station("sur", 3, "000", "Bazaar Music", youtube = true),
        // Public-domain and Creative Commons cartoons for children (1.9.41).
        Station("kids", 5, "00000", "Bazaar Kids", youtube = true),
        // Public-domain and CC BY sports films from the Internet Archive, built by tools/build_archive_channels.py (1.9.43).
        Station("sports", 6, "000000", "Bazaar Sports", youtube = true),
        // Public-domain travel films of countries, cities and parks, also by build_archive_channels.py (1.9.44).
        Station("travel", 7, "0000000", "Bazaar Travel", youtube = true),
        // Silent and classic comedy (Chaplin, Laurel and Hardy, Keaton), also by build_archive_channels.py (1.9.44).
        Station("comedy", 8, "00000000", "Bazaar Comedy", youtube = true),
        // 1.9.50: full films in English and in Hindi, and Pakistani dramas, from their makers' channels.
        // They came after the rows of zeros, so they're dialled by number only; Bazaar Cinema's free films are their backup.
        Station("english", 9, "9", "Bazaar Movies English", youtube = true, backup = "filmein", logo = "bazaar-english.png"),
        Station("hindi", 10, "10", "Bazaar Movies Hindi", youtube = true, backup = "filmein", logo = "bazaar-hindi.png"),
        Station("dramas", 11, "11", "Bazaar Dramas", youtube = true, backup = "filmein", logo = "bazaar-dramas.png"),
        // 1.9.53: cooking shows in Urdu, Hindi, Punjabi and English from the cooks' own channels.
        Station("cooking", 12, "12", "Bazaar Cooking", youtube = true, backup = "filmein", logo = "bazaar-cooking.png"),
    )

    private const val SCHEME = "mychannel://"

    /** Bazaar TV's stream address in the channel list; [StreamPlayer] plays the schedule instead. */
    const val URL = "mychannel://main"

    fun urlOf(id: String) = SCHEME + id

    /** Bazaar Hits' channel number, between Bazaar Music (3) and Bazaar Kids (5). */
    const val HITS_NUMBER = 4

    /**
     * Bazaar Hits (channel 4, dialled 0000 before 1.9.45): the music labels' own YouTube uploads, one after another in
     * YouTube's player on this page (song list built by tools/build_bollywood.py). No schedule.
     */
    const val BOLLYWOOD_URL = "https://tv.bulkbazaar.ca/channel/bollywood.html"
    private val bollywood = Channel(
        name = "Bazaar Hits",
        url = BOLLYWOOD_URL,
        logo = freshLogo("https://tv.bulkbazaar.ca/channel/logos/bazaar-hits.png"),
        number = HITS_NUMBER,
    )

    /**
     * The page that plays [channel] like Bazaar Hits (official YouTube videos, locked), when it is
     * one of our channels that runs that way; null otherwise.
     */
    fun webPage(channel: Channel?): String? {
        val id = channel?.url?.takeIf { it.startsWith(SCHEME) }?.removePrefix(SCHEME) ?: return null
        return STATIONS.firstOrNull { it.id == id && it.youtube }?.let { "https://tv.bulkbazaar.ca/channel/ytc.html?c=${it.id}&app=1" }
    }

    /**
     * The page of ours that plays [channel] in YouTube's player, locked (our YouTube channels, Bazaar Hits,
     * or any YouTube video in a channel list); null for channels our own player plays. [version] is the app's.
     */
    fun pageFor(channel: Channel?, version: Int): String? {
        channel ?: return null
        webPage(channel)?.let { return "$it&v=$version" }
        if (channel.url == BOLLYWOOD_URL) return "$BOLLYWOOD_URL?app=1&v=$version"
        val id = YouTube.videoId(channel.url) ?: return null
        return "https://tv.bulkbazaar.ca/channel/yt.html?app=1&v=$id&name=" +
            java.net.URLEncoder.encode(channel.name, "UTF-8").replace("+", "%20") + "&ver=$version"
    }

    fun isMine(channel: Channel?) = channel?.url?.let { it.startsWith(SCHEME) || it == BOLLYWOOD_URL } == true

    class Video(val id: String, val title: String, val url: String, /** 0 for a live stream. */ val seconds: Long)

    class Slot(
        /** "all", "weekdays", "weekend", "mon".."sun", or a date "yyyy-MM-dd". */
        val day: String,
        /** "HH:mm" in the channel's time zone. */
        val time: String,
        val video: String,
        /**
         * A weekly show (a drama, serial or series): its episodes' video ids, one per airing, in order,
         * starting on [since] ("yyyy-MM-dd"); after the last one it starts again from episode 1.
         * Empty for a slot that plays [video] every time. [video] is the first episode, for older apps.
         */
        val episodes: List<String> = emptyList(),
        val since: String = "",
        /** The show's name, for the guide and the viewing stats ("" when the slot has none). */
        val show: String = "",
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
        /** Which of [STATIONS] this is. */
        val id: String = "main",
    ) {
        val channel: Channel
            get() = Channel(name = name, url = urlOf(id), logo = logo, number = STATIONS.firstOrNull { it.id == id }?.number ?: 0)
    }

    /** What to show at a moment. */
    sealed class Now {
        /** Play [video] from [offsetMs] until [untilMs] (wall clock), when the schedule moves on. */
        class Playing(val video: Video, val offsetMs: Long, val untilMs: Long, /** The booked show, when a weekly show's slot is on. */ val show: String = "") : Now()
        /** Nothing on; [next] starts at [nextAt] (null when nothing is booked). */
        class OffAir(val next: Video?, val nextAt: Long?) : Now()
    }

    private val _configs = MutableStateFlow<Map<String, Config>>(emptyMap())
    /** The channels the owner switched on and gave something to play, by station id. */
    val configs: StateFlow<Map<String, Config>> = _configs.asStateFlow()

    private var files: Map<String, File>? = null

    /** Reads the saved schedules, so the channels show before the network answers. */
    @Synchronized
    fun init(context: Context) {
        if (files != null) return
        val dir = context.applicationContext.filesDir
        files = STATIONS.associate { it.id to File(dir, if (it.id == "main") "my_channel.json" else "my_channel_${it.id}.json") }
        val read = files!!.mapNotNull { (id, file) ->
            runCatching { file.takeIf { it.exists() }?.readText()?.let { usable(parse(JSONObject(it), id)) } }.getOrNull()?.let { id to it }
        }
        _configs.value = read.toMap()
    }

    /** Stores the owner's latest settings for station [id] ([json] as saved by the website; null when there are none). */
    @Synchronized
    fun update(id: String, json: JSONObject?) {
        val parsed = json?.let { runCatching { parse(it, id) }.getOrNull() }
        runCatching { files?.get(id)?.let { if (json == null) it.delete() else it.writeText(json.toString()) } }
        val next = _configs.value.toMutableMap()
        val on = usable(parsed)
        if (on != null) next[id] = on else next.remove(id)
        _configs.value = next
    }

    /** The channels that are on, in station order. */
    fun channels(): List<Channel> =
        // In number order: 1 to 12, Bazaar Hits being 4.
        (STATIONS.mapNotNull { st -> _configs.value[st.id]?.channel } + bollywood).sortedBy { it.number }

    /** The channel a viewer reaches by typing [typed] as before 1.9.45 ("0", "00"), or 9 to 12, when it's on. */
    fun byDial(typed: String): Channel? =
        if (typed == "0000") bollywood else STATIONS.firstOrNull { it.dial == typed }?.let { _configs.value[it.id]?.channel }

    /** [channel]'s settings when it's one of ours and on. */
    fun configOf(channel: Channel?): Config? = channel?.takeIf(::isMine)?.let { _configs.value[it.url.removePrefix(SCHEME)] }

    private fun usable(c: Config?) = c?.takeIf { it.active && it.videos.isNotEmpty() }

    /** Parses { name, logo, active, tz, videos:[{id,title,url,secs}], slots:[{day,time,video}], loop:[ids] }. */
    fun parse(o: JSONObject, id: String = "main"): Config {
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
                val eps = s.optJSONArray("episodes")?.let { e -> (0 until e.length()).map { e.optString(it) }.filter { it.isNotEmpty() } }.orEmpty()
                Slot(s.optString("day", "all"), s.optString("time"), s.optString("video"), eps, s.optString("since"), s.optString("show").trim())
            }
        }.orEmpty()
        val loop = o.optJSONArray("loop")?.let { a -> (0 until a.length()).map { a.optString(it) } }.orEmpty()
        return Config(
            name = o.optString("name").trim().ifEmpty { "My Channel" },
            logo = o.optString("logo").trim().takeIf { it.startsWith("http") }?.let(::freshLogo),
            active = o.optBoolean("active", true),
            timeZone = o.optString("tz").ifBlank { "America/Toronto" },
            videos = videos,
            slots = slots,
            loop = loop,
            ticker = o.optString("ticker").trim().takeIf { it.isNotEmpty() && o.optBoolean("tickerOn", true) },
            logoCorner = o.optString("logoCorner").ifBlank { "tr" },
            id = id,
        )
    }

    /** What [channel]'s current settings put on air at [nowMs]; off air when the channel is off. */
    fun now(channel: Channel?, nowMs: Long = System.currentTimeMillis()): Now =
        configOf(channel)?.let { whatsOn(it, nowMs) } ?: Now.OffAir(null, null)

    private class Start(val at: Long, val video: Video, val dated: Boolean, val show: String = "")

    /**
     * What [c] plays at [nowMs]. A slot plays its video from its start time to the end of the
     * video, or until the next slot starts. Between slots the loop list plays back to back, from
     * the top after each slot (and on the clock before the first), so every viewer is at the same place.
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
            if (nowMs < end) return Now.Playing(current.video, nowMs - current.at, minOf(end, nextAt), current.show)
        }
        // After a time slot the loop starts again from the top; before any slot it runs on the clock.
        var anchor = 0L
        starts.forEachIndexed { i, s ->
            if (s.at > nowMs) return@forEachIndexed
            val cut = starts.getOrNull(i + 1)?.at ?: Long.MAX_VALUE
            val end = minOf(if (s.video.seconds > 0) s.at + s.video.seconds * 1000 else Long.MAX_VALUE, cut)
            if (end <= nowMs) anchor = maxOf(anchor, end)
        }
        val loop = c.loop.mapNotNull { byId[it] }.filter { it.seconds > 0 }
        val total = loop.sumOf { it.seconds * 1000 }
        if (total > 0) {
            var pos = Math.floorMod(nowMs - anchor, total)
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
            if (!onDay(s.day, date, weekday)) return@mapNotNull null
            val video = episodeOn(s, date, byId) ?: return@mapNotNull null
            val (h, m) = s.time.split(':').mapNotNull { it.trim().toIntOrNull() }.takeIf { it.size == 2 } ?: return@mapNotNull null
            val at = (cal.clone() as Calendar).apply {
                set(Calendar.HOUR_OF_DAY, h)
                set(Calendar.MINUTE, m)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }.timeInMillis
            Start(at, video, dated = s.day.length == 10, show = s.show)
        }
    }

    /**
     * The video [s] plays on [date]: for a weekly show, the episode for that airing (the first on
     * [Slot.since], then one more each time the slot comes round, from episode 1 again after the last).
     */
    private fun episodeOn(s: Slot, date: String, byId: Map<String, Video>): Video? {
        val eps = s.episodes.filter { it in byId }
        if (eps.isEmpty()) return byId[s.video]
        return byId[eps[Math.floorMod(airingsBefore(s.day, s.since, date), eps.size)]]
    }

    /** How many times a slot on [day] came round from [since] up to (not counting) [date]; 0 before [since]. */
    fun airingsBefore(day: String, since: String, date: String): Int {
        val from = dayNumber(since) ?: return 0
        val to = dayNumber(date) ?: return 0
        val n = to - from
        if (n <= 0) return 0
        // Day 0 (1970-01-01) was a Thursday; 1 = Sunday as in Calendar.
        val startWeekday = Math.floorMod(from + 4, 7) + 1
        val perWeek = (1..7).count { onDay(day, "", it) }
        var count = (n / 7) * perWeek
        for (i in 0 until n % 7) if (onDay(day, "", Math.floorMod(startWeekday - 1 + i, 7) + 1)) count++
        return count
    }

    /** Days since 1970-01-01 for "yyyy-MM-dd"; null when it isn't a date. */
    private fun dayNumber(date: String): Int? {
        val p = date.split('-').mapNotNull { it.toIntOrNull() }.takeIf { it.size == 3 } ?: return null
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { clear(); set(p[0], p[1] - 1, p[2]) }
        return (cal.timeInMillis / 86_400_000L).toInt()
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
