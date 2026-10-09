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
    private const val LOGO_VERSION = 9

    fun freshLogo(url: String): String =
        if ("/channel/logos/" in url && '?' !in url) "${sparkLogo(url)}?v=$LOGO_VERSION" else url

    /**
     * Our channels are called Spark since 1.10.27 (owner, 2026-10-08), with the Spark Flower logos.
     * The website and our schedules still say Bazaar until the owner has tried this version, so the
     * app swaps the old names and logo files for the new ones as it reads them.
     */
    fun brand(name: String): String = name.replace(Regex("^Bazaar(?= )"), "Spark")

    private fun sparkLogo(url: String): String =
        url.replace("/channel/logos/bazaar-", "/channel/logos/spark-")
            .replace("/channel/logos/latest-movies.png", "/channel/logos/spark-latest.png")

    /** Tells our channel pages to show the Spark names and logos too (they still say Bazaar for everyone else). */
    private const val BRAND = "&brand=spark"

    /**
     * One of our channels: [id] names its saved settings and its stream address, [number] is its
     * channel number, [lang] its one language, and [dial] the row of zeros that reached it before
     * 1.9.45, which still works ("" for none).
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
        /** False for a channel that carries no logo of ours on the picture; [logo] is then only for the channel list. */
        val bug: Boolean = true,
        /** The one language its programmes are in (the owner, 2026-10-08): [URDU], [HINDI], [ENGLISH] or [PUNJABI]. */
        val lang: String = URDU,
    )

    const val URDU = "Urdu"
    const val HINDI = "Hindi"
    const val ENGLISH = "English"
    const val PUNJABI = "Punjabi"

    /**
     * Every channel of ours is in one language, and each language has its block of numbers (the owner,
     * 2026-10-08): Urdu 1 to 19, Hindi 21 to 39, English 41 to 59, Punjabi 61 to 79. MTA's channels are
     * [MTA_FIRST] on and every other channel [OTHERS_FIRST] on.
     */
    val LANGUAGES = listOf(URDU, HINDI, ENGLISH, PUNJABI)
    const val MTA_FIRST = 81
    const val OTHERS_FIRST = 101

    /** The heading over a language's block of our channels, also the channel's group ("Spark Urdu"). */
    fun groupOf(lang: String) = "Spark $lang"

    /**
     * Our channels, in number order. All but Spark TV One run from official YouTube videos
     * (tools/build_youtube_channels.py); a channel that was mixed before 2026-10-08 is split by language
     * there, and the free films below are the backup.
     */
    val STATIONS get() = if (com.livetv.app.Edition.PLAY_CHANNELS) PLAY_STATIONS else ALL_STATIONS

    /**
     * Spark TV, our Google Play app (the owner, 2026-10-09): only channels whose every programme we own or may
     * show. No YouTube channels, since YouTube's rules forbid playing its videos locked. Their schedules are
     * tv.bulkbazaar.ca/channel/play/<id>.json, made by tools/build_play_schedules.py with every YouTube video taken out.
     *
     * Spark TV launches on Google Play with channel 1 alone (the owner, 2026-10-09: "run channel one there, then
     * slowly, gradually push other items"). Every programme on it is ours: channel 1's news and ad breaks with our
     * own Urdu and Hindi films, stories and shayari in place of its YouTube dramas and songs.
     */
    val PLAY_STATIONS = listOf(
        Station("pone", 1, "", "Spark TV One", logo = "spark-tv.png"),
    )

    /**
     * Ready for Spark TV, every one ours to show like channel 1, added to [PLAY_STATIONS] one at a time as the
     * owner decides (their schedules are built and kept fresh by tools/build_play_schedules.py).
     */
    val PLAY_READY = listOf(
        Station("pnews", 1, "", "Spark TV News", logo = "spark-news.png"),
        Station("pclassics", 2, "", "Spark Classics", logo = "spark-cinema.png", lang = ENGLISH),
        // Our own Urdu and Hindi AI dubs of free films (the owner, 2026-10-09: every channel like channel 1).
        Station("purdu", 3, "", "Spark Cinema Urdu", logo = "spark-cinema-urdu.png"),
        Station("phindi", 4, "", "Spark Cinema Hindi", logo = "spark-cinema-hindi.png", lang = HINDI),
        Station("pshayari", 5, "", "Spark Shayari", logo = "spark-shayari.png"),
        Station("psports", 6, "", "Spark Sports Classics", logo = "spark-sports.png", lang = ENGLISH),
        Station("ptravel", 7, "", "Spark Travel Classics", logo = "spark-travel.png", lang = ENGLISH),
        Station("pcomedy", 8, "", "Spark Comedy Classics", logo = "spark-comedy-play.png", lang = ENGLISH),
        Station("pauto", 9, "", "Spark Auto Classics", logo = "spark-auto.png", lang = ENGLISH),
        Station("pcooking", 10, "", "Spark Kitchen Classics", logo = "spark-cooking-play.png", lang = ENGLISH),
        Station("pmusic", 11, "", "Spark Music", logo = "spark-music-play.png", lang = ENGLISH),
        Station("pads", 12, "", "Spark Ads", logo = "spark-ads.png", lang = ENGLISH),
    )

    private val ALL_STATIONS = listOf(
        // Urdu
        Station("main", 1, "0", "Spark TV One"),
        Station("dramas", 2, "", "Spark Dramas Urdu", youtube = true, backup = "filmein", logo = "spark-dramas.png"),
        // Urdu songs (Coke Studio, qawwali) from the music channel's sources; its free songs are the backup.
        Station("musicur", 3, "", "Spark Music Urdu", youtube = true, backup = "sur", logo = "spark-musicur.png"),
        Station("cookingur", 4, "", "Spark Cooking Urdu", youtube = true, backup = "filmein", logo = "spark-cookingur.png"),
        // Urdu poetry and mushairas, with our own hourly "Aaj ka Sher" (17 before the language blocks).
        Station("shayari", 5, "", "Spark Shayari", youtube = true, backup = "filmein", logo = "spark-shayari.png"),
        // Pakistani sitcoms and comedy shows (Hasb-e-Haal, Suno Chanda, Chupke Chupke...), the Urdu half of Comedy (2026-10-09).
        Station("comedyur", 9, "", "Spark Comedy Urdu", youtube = true, backup = "comedy", logo = "spark-comedyur.png"),
        // Hindi (Spark Hits, 23, is [bollywood] below)
        Station("filmein", 21, "00", "Spark Cinema", youtube = true, lang = HINDI),
        Station("hindi", 22, "", "Spark Movies Hindi", youtube = true, backup = "filmein", logo = "spark-hindi.png", lang = HINDI),
        // Full episodes of Hindi serials from the Indian TV channels' own YouTube channels (16 before the language blocks).
        Station("hindidramas", 24, "", "Spark Dramas Hindi", youtube = true, backup = "filmein", logo = "spark-dramas-hindi.png", lang = HINDI),
        Station("comedy", 25, "00000000", "Spark Comedy Hindi", youtube = true, lang = HINDI),
        Station("cooking", 26, "", "Spark Cooking Hindi", youtube = true, backup = "filmein", logo = "spark-cooking.png", lang = HINDI),
        // The Hindi half of Shayari: kavi sammelan and Hindi poetry.
        Station("kavi", 27, "", "Spark Kavi Sammelan", youtube = true, backup = "filmein", logo = "spark-kavi.png", lang = HINDI),
        Station("kidshi", 28, "", "Spark Kids Hindi", youtube = true, backup = "kids", logo = "spark-kidshi.png", lang = HINDI),
        Station("teenshi", 30, "", "Spark Teens Hindi", youtube = true, backup = "filmein", logo = "spark-teenshi.png", lang = HINDI),
        // Cars (the owner, 2026-10-08): Hindi car shows' reviews and launches.
        Station("autohi", 32, "", "Spark Auto Hindi", youtube = true, backup = "sports", logo = "spark-autohi.png", lang = HINDI),
        // English
        Station("english", 41, "", "Spark Movies English", youtube = true, backup = "filmein", logo = "spark-english.png", lang = ENGLISH),
        // Trailers of new and upcoming films, mostly English from the Hollywood studios' own channels plus Hindi
        // and Pakistani ones (tools/build_trailers.py, daily; owner 2026-10-08). Its own logo, no Spark word.
        Station("trailers", 42, "", "Movie Trailers", youtube = true, backup = "filmein", logo = "movie-trailers.png", lang = ENGLISH),
        Station("kids", 43, "00000", "Spark Kids English", youtube = true, lang = ENGLISH),
        Station("teens", 44, "", "Spark Teens English", youtube = true, backup = "filmein", logo = "spark-teens.png", lang = ENGLISH),
        Station("travel", 45, "0000000", "Spark Travel", youtube = true, lang = ENGLISH),
        Station("sports", 46, "000000", "Spark Sports", youtube = true, lang = ENGLISH),
        // Cars (the owner, 2026-10-08): reviews, launches, top 10s, supercars and motorsport, in blocks through the day.
        Station("auto", 47, "", "Spark Auto", youtube = true, backup = "sports", logo = "spark-auto.png", lang = ENGLISH),
        // Ads and promos round the clock in our own player (owner, 2026-10-07): our Cable TV promos, the
        // sponsors' ads from /sponsors and "Advertise with us" (docs/channel/ads-schedule.json). No pop-up ads on it.
        Station("ads", 48, "", "Spark Ads", logo = "spark-ads.png", lang = ENGLISH),
        Station("comedyen", 49, "", "Spark Comedy English", youtube = true, backup = "comedy", logo = "spark-comedyen.png", lang = ENGLISH),
        // Punjabi
        Station("sur", 61, "000", "Spark Music Punjabi", youtube = true, lang = PUNJABI),
        // More Punjabi (the owner, 2026-10-08): Gurbani carries no ads of ours and no other music as its backup
        // (its own empty gurbani-schedule.json), films, Sufi qawwali.
        Station("gurbani", 62, "", "Spark Gurbani", youtube = true, logo = "spark-gurbani.png", lang = PUNJABI),
        Station("moviespa", 63, "", "Spark Movies Punjabi", youtube = true, backup = "filmein", logo = "spark-moviespa.png", lang = PUNJABI),
        Station("sufi", 64, "", "Spark Sufi Qawwali", youtube = true, backup = "sur", logo = "spark-sufi.png", lang = PUNJABI),
        // Punjabi comedy films and stage dramas from the producers' and labels' own channels (2026-10-09).
        Station("comedypa", 65, "", "Spark Comedy Punjabi", youtube = true, backup = "comedy", logo = "spark-comedypa.png", lang = PUNJABI),
    )

    /**
     * Channels that went away, and where a favourite or the last channel watched on them now goes
     * (Latest Movies' newest films lead each language's Movies channel since 2026-10-08).
     */
    val MOVED = mapOf("mychannel://latest" to "mychannel://hindi")

    /** Bazaar Ads' address: the channel that is all ads, so no pop-up ad breaks come over it. */
    const val ADS_URL = "mychannel://ads"

    /** Spark Gurbani (62): no pop-up ads, breaks or ticker over it, out of respect (the owner, 2026-10-08). */
    const val GURBANI_URL = "mychannel://gurbani"

    private const val SCHEME = "mychannel://"

    /** Bazaar TV's stream address in the channel list; [StreamPlayer] plays the schedule instead. */
    const val URL = "mychannel://main"

    fun urlOf(id: String) = SCHEME + id

    /** Spark Hits' channel number, in the Hindi block. */
    const val HITS_NUMBER = 23

    /**
     * Bazaar Hits (channel 4, dialled 0000 before 1.9.45): the music labels' own YouTube uploads, one after another in
     * YouTube's player on this page (song list built by tools/build_bollywood.py). No schedule.
     */
    const val BOLLYWOOD_URL = "https://tv.bulkbazaar.ca/channel/bollywood.html"
    private val bollywood = Channel(
        name = "Spark Hits",
        url = BOLLYWOOD_URL,
        logo = freshLogo("https://tv.bulkbazaar.ca/channel/logos/spark-hits.png"),
        number = HITS_NUMBER,
        language = HINDI,
        group = groupOf(HINDI),
    )

    /**
     * The page that plays [channel] like Bazaar Hits (official YouTube videos, locked), when it is
     * one of our channels that runs that way; null otherwise.
     */
    fun webPage(channel: Channel?): String? {
        val id = channel?.url?.takeIf { it.startsWith(SCHEME) }?.removePrefix(SCHEME) ?: return null
        return STATIONS.firstOrNull { it.id == id && it.youtube }?.let { "https://tv.bulkbazaar.ca/channel/ytc.html?c=${it.id}&app=1$BRAND" }
    }

    /**
     * The page of ours that plays [channel] in YouTube's player, locked (our YouTube channels, Bazaar Hits,
     * or any YouTube video in a channel list); null for channels our own player plays. [version] is the app's.
     */
    fun pageFor(channel: Channel?, version: Int): String? {
        channel ?: return null
        webPage(channel)?.let { return "$it&v=$version" }
        if (channel.url == BOLLYWOOD_URL) return "$BOLLYWOOD_URL?app=1$BRAND&v=$version"
        val id = YouTube.videoId(channel.url) ?: return null
        return "https://tv.bulkbazaar.ca/channel/yt.html?app=1&v=$id&name=" +
            java.net.URLEncoder.encode(channel.name, "UTF-8").replace("+", "%20") + "&ver=$version"
    }

    fun isMine(channel: Channel?) = channel?.url?.let { it.startsWith(SCHEME) || it == BOLLYWOOD_URL } == true

    /** True when [channel] is one of ours with its own scrolling line along the bottom (MyChannelOverlay). */
    fun hasTicker(channel: Channel?) =
        isMine(channel) && configs.value[channel!!.url.removePrefix(SCHEME)]?.ticker != null

    class Video(
        val id: String,
        val title: String,
        val url: String,
        /** 0 for a live stream. */ val seconds: Long,
        /** "programme", "ad", "ident" (a channel ident or promo) or "live", as set in Channel Studio. */
        val kind: String = "programme",
    ) {
        /** An ad, ident or promo: part of a break, not a programme. */
        val isBreak: Boolean get() = kind == "ad" || kind == "ident"

        /** The YouTube video this is, when it is one (Bazaar TV's upcoming trailers): it plays on our locked page. */
        val youtube: String? = YouTube.videoId(url)
    }

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
        /** Short videos (ids) that fill the time when a programme ends before its slot does; ads when empty. */
        val fillers: List<String> = emptyList(),
    ) {
        val channel: Channel
            // Our channels keep their fixed names (owner, 2026-10-07), whatever name a saved schedule carries.
            get() = STATIONS.firstOrNull { it.id == id }.let { st ->
                Channel(
                    name = st?.name ?: name, url = urlOf(id), logo = logo, number = st?.number ?: 0,
                    language = st?.lang, group = st?.lang?.let(::groupOf),
                )
            }
    }

    /** What to show at a moment. */
    sealed class Now {
        /** Play [video] from [offsetMs] until [untilMs] (wall clock), when the schedule moves on. */
        class Playing(
            val video: Video,
            val offsetMs: Long,
            val untilMs: Long,
            /** Its place in the loop list (without zero-length entries); -1 for a time slot or a live stream. */
            val loopIndex: Int = -1,
            /** When the next time slot starts (the loop waits then); Long.MAX_VALUE when none is booked. */
            val nextSlotMs: Long = Long.MAX_VALUE,
            /** The booked show, when a weekly show's slot is on. */
            val show: String = "",
        ) : Now()
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
        // In number order, language by language (Spark Hits is 23).
        (STATIONS.mapNotNull { st -> _configs.value[st.id]?.channel } + listOfNotNull(bollywood.takeUnless { com.livetv.app.Edition.PLAY_CHANNELS }))
            .sortedBy { it.number }

    /** The channel a viewer reaches by typing a row of zeros as before 1.9.45 ("0", "00"), when it's on. */
    fun byDial(typed: String): Channel? =
        if (typed == "0000" && !com.livetv.app.Edition.PLAY_CHANNELS) bollywood else STATIONS.firstOrNull { it.dial.isNotEmpty() && it.dial == typed }?.let { _configs.value[it.id]?.channel }

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
                // Spark TV (Google Play) never plays a YouTube video, whatever a schedule says.
                if (com.livetv.app.Edition.PLAY_CHANNELS && YouTube.videoId(url) != null) return@mapNotNull null
                val secs = v.optLong("secs").coerceAtLeast(0)
                Video(v.optString("id"), v.optString("title").ifBlank { "My channel" }, url, secs, v.optString("kind").ifBlank { if (secs > 0) "programme" else "live" })
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
            name = brand(o.optString("name").trim().ifEmpty { "My Channel" }),
            logo = o.optString("logo").trim().takeIf { it.startsWith("http") }?.let(::freshLogo),
            active = o.optBoolean("active", true),
            timeZone = o.optString("tz").ifBlank { "America/Toronto" },
            videos = videos,
            slots = slots,
            loop = loop,
            ticker = o.optString("ticker").trim().takeIf { it.isNotEmpty() && o.optBoolean("tickerOn", true) },
            logoCorner = o.optString("logoCorner").ifBlank { "tr" },
            id = id,
            fillers = o.optJSONArray("fillers")?.let { a -> (0 until a.length()).map { a.optString(it) } }.orEmpty(),
        )
    }

    /**
     * Something short to play when a programme ends before the schedule moves on (the owner, 2026-10-07:
     * never a still picture or dead air): the channel's fillers (or its ads), taking turns by the minute,
     * the first one that fits in [leftMs] and isn't [skip] (the one just played); the shortest when none fits,
     * cut off when the schedule moves on. Null when the channel has none. Same as fillerFor in schedule.js.
     */
    fun filler(c: Config, leftMs: Long, nowMs: Long, skip: String? = null): Video? {
        val byId = c.videos.associateBy { it.id }
        val pool = (c.fillers.mapNotNull { byId[it] }.ifEmpty { c.videos.filter { it.kind == "ad" } })
            .filter { it.seconds in 1..660 && it.youtube == null }
            .distinctBy { it.url }
        if (pool.isEmpty()) return null
        val start = Math.floorMod(nowMs / 60_000, pool.size.toLong()).toInt()
        val turn = pool.drop(start) + pool.take(start)
        return turn.firstOrNull { it.seconds * 1000 <= leftMs && it.url != skip }
            ?: turn.filter { it.url != skip }.minByOrNull { it.seconds }
            ?: turn.first()
    }

    fun filler(channel: Channel?, leftMs: Long, nowMs: Long, skip: String? = null): Video? =
        configOf(channel)?.let { filler(it, leftMs, nowMs, skip) }

    /** What [channel]'s current settings put on air at [nowMs]; off air when the channel is off. */
    fun now(channel: Channel?, nowMs: Long = System.currentTimeMillis()): Now =
        configOf(channel)?.let { whatsOn(it, nowMs) } ?: Now.OffAir(null, null)

    /** A Bazaar TV News bulletin (news-headlines, news-full). */
    fun isNews(v: Video) = v.id.startsWith("news-")

    /**
     * Owner rule (2026-10-08): no ads of any kind on Bazaar TV (channel 1) while a news bulletin is on
     * (or one starts within [aheadMs]); ads come before or after the news, in the channel's own breaks.
     */
    fun newsOn(channelUrl: String?, nowMs: Long = System.currentTimeMillis(), aheadMs: Long = 0L): Boolean {
        if (channelUrl != URL) return false
        val c = usable(_configs.value[URL.removePrefix(SCHEME)]) ?: return false
        fun at(t: Long) = (runCatching { whatsOn(c, t) }.getOrNull() as? Now.Playing)?.video?.let(::isNews) == true
        return at(nowMs) || (aheadMs > 0 && at(nowMs + aheadMs))
    }

    private class Start(val at: Long, val video: Video, val dated: Boolean, val show: String = "")

    /**
     * A card over the picture (owner, 2026-10-07): every 10 minutes what's coming next, and every
     * 20 minutes today's shows first. It comes up with the first ad or ident of each 10 minutes, so
     * it rides on the breaks, or 8 minutes in when there's no break. Worked out from the clock, so
     * every viewer sees it at the same moment. Same as cardAt in docs/channel/schedule.js.
     */
    class Card(val today: Boolean, val untilMs: Long)

    const val CARD_WINDOW_MS = 10 * 60_000L
    const val TODAY_CARD_MS = 20_000L
    const val NEXT_CARD_MS = 12_000L
    private val cardStarts = object : LinkedHashMap<String, Long>() {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?) = size > 8
    }

    fun cardAt(c: Config, nowMs: Long): Card? {
        val window = nowMs - Math.floorMod(nowMs, CARD_WINDOW_MS)
        val key = "${System.identityHashCode(c)}|$window"
        val at = synchronized(cardStarts) { cardStarts.getOrPut(key) { firstBreak(c, window, window + 8 * 60_000L) ?: (window + 8 * 60_000L) } }
        val today = (window / CARD_WINDOW_MS) % 2 == 0L
        val todayEnd = if (today) at + TODAY_CARD_MS else at
        return when {
            nowMs < at -> null
            nowMs < todayEnd -> Card(true, todayEnd)
            nowMs < todayEnd + NEXT_CARD_MS -> Card(false, todayEnd + NEXT_CARD_MS)
            else -> null
        }
    }

    /** When the first ad or ident between [from] and [to] starts (or [from], if one is already on); null when none. */
    private fun firstBreak(c: Config, from: Long, to: Long): Long? {
        var t = from
        repeat(60) {
            if (t >= to) return null
            when (val now = whatsOn(c, t)) {
                is Now.Playing -> {
                    if (now.video.isBreak) return t
                    if (now.untilMs == Long.MAX_VALUE) return null
                    t = maxOf(now.untilMs, t + 1000)
                }
                is Now.OffAir -> t = now.nextAt ?: return null
            }
        }
        return null
    }

    private fun dayKey(ms: Long, tz: TimeZone) = Calendar.getInstance(tz).run { timeInMillis = ms; get(Calendar.YEAR) * 1000 + get(Calendar.DAY_OF_YEAR) }

    /** A programme in the guide: [title] (the show's name when it has one) starting at [at]. */
    class Upcoming(val at: Long, val title: String, val booked: Boolean = false, val more: Int = 0)

    /** The next [count] programmes after [nowMs] (ads and idents left out). */
    fun upNext(c: Config, nowMs: Long, count: Int = 2): List<Upcoming> {
        val out = mutableListOf<Upcoming>()
        var t = nowMs
        var guard = 0
        while (out.size < count && guard++ < 120 && t < nowMs + 24 * 3600_000L) {
            when (val now = whatsOn(c, t)) {
                is Now.Playing -> {
                    val start = t - now.offsetMs
                    if (start > nowMs && !now.video.isBreak && out.lastOrNull()?.at != start) {
                        out += Upcoming(start, now.show.ifEmpty { now.video.title }, now.loopIndex < 0)
                    }
                    if (now.untilMs == Long.MAX_VALUE) break
                    t = maxOf(now.untilMs, t + 1000)
                }
                is Now.OffAir -> t = now.nextAt ?: break
            }
        }
        return out
    }

    /**
     * Today's booked shows (time slots) from the one on now, in the channel's day; a show booked
     * many times today (the hourly news) shows once, at its next time, with how many more follow.
     * When nothing is booked today, the next programmes instead.
     */
    fun todaysShows(c: Config, nowMs: Long, max: Int = 7): List<Upcoming> {
        val byId = c.videos.associateBy { it.id }
        val tz = TimeZone.getTimeZone(c.timeZone)
        val starts = slotsOn(c, byId, tz, nowMs, 0)
            .sortedWith(compareBy<Start>({ it.at }, { !it.dated })).distinctBy { it.at }
        if (starts.isEmpty()) return upNext(c, nowMs, max)
        val title = { s: Start -> s.show.ifEmpty { s.video.title } }
        // From the slot on now (it began before now and is still playing).
        val fromIndex = starts.indexOfLast { it.at <= nowMs }.let { i ->
            if (i >= 0 && starts[i].at + starts[i].video.seconds * 1000 > nowMs) i else i + 1
        }.coerceAtLeast(0)
        val left = starts.drop(fromIndex)
        val counts = left.groupingBy(title).eachCount()
        val out = left.distinctBy(title).take(max).map { Upcoming(it.at, title(it), true, (counts[title(it)] ?: 1) - 1) }.toMutableList()
        // Late in the day with few shows left, the next programmes fill it up.
        if (out.size < 3) {
            val today = dayKey(nowMs, tz)
            for (u in upNext(c, nowMs, 4)) {
                if (out.size >= 3) break
                if (out.none { it.title == u.title } && dayKey(u.at, tz) == today) out += u
            }
        }
        return out.sortedBy { it.at }
    }

    /**
     * What [c] plays at [nowMs]. A slot plays its video from its start time to the end of the
     * video, or until the next slot starts. Between slots the loop list plays back to back: it starts
     * from the top at midnight (the channel's time) and waits during each slot, carrying on where it
     * was after it (since 1.9.69, for the hourly news; it used to start again from the top), so every
     * viewer is at the same place. Same as whatsOn in docs/channel/schedule.js.
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
            if (nowMs < end) return Now.Playing(current.video, nowMs - current.at, minOf(end, nextAt), show = current.show)
        }
        // The loop's own clock: time since midnight, less the time slots took since then.
        val midnight = Calendar.getInstance(tz).apply {
            timeInMillis = nowMs
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        var slotTime = 0L
        starts.forEachIndexed { i, s ->
            if (s.at >= nowMs) return@forEachIndexed
            val cut = starts.getOrNull(i + 1)?.at ?: Long.MAX_VALUE
            val end = minOf(if (s.video.seconds > 0) s.at + s.video.seconds * 1000 else Long.MAX_VALUE, cut, nowMs)
            slotTime += (end - maxOf(s.at, midnight)).coerceAtLeast(0)
        }
        val anchor = midnight + slotTime
        val loop = c.loop.mapNotNull { byId[it] }.filter { it.seconds > 0 }
        val total = loop.sumOf { it.seconds * 1000 }
        if (total > 0) {
            var pos = Math.floorMod(nowMs - anchor, total)
            loop.forEachIndexed { i, v ->
                val len = v.seconds * 1000
                if (pos < len) return Now.Playing(v, pos, minOf(nowMs - pos + len, nextAt), i, nextAt)
                pos -= len
            }
        }
        // A live stream in the loop plays on until the next slot.
        c.loop.mapNotNull { byId[it] }.firstOrNull { it.seconds == 0L }?.let { return Now.Playing(it, 0, nextAt) }
        return Now.OffAir(next?.video, next?.at)
    }

    /**
     * A run of YouTube videos on air (Bazaar TV's upcoming trailers, 2026-10-06): they play one after
     * another on our locked page from [startMs] to [endMs] (wall clock), then our own player goes on.
     */
    class Block(val videos: List<Video>, val startMs: Long, val endMs: Long)

    /** The run of YouTube videos [c] has on at [nowMs]; null when our own player plays. */
    fun block(c: Config, nowMs: Long): Block? {
        val now = whatsOn(c, nowMs) as? Now.Playing ?: return null
        if (now.video.youtube == null) return null
        val begun = nowMs - now.offsetMs
        if (now.loopIndex < 0) return Block(listOf(now.video), begun, now.untilMs)
        // The loop's neighbours that are YouTube videos too, up to the ends of the list (it starts again
        // from the top after a time slot, so a run never reaches across the end).
        val byId = c.videos.associateBy { it.id }
        val loop = c.loop.mapNotNull { byId[it] }.filter { it.seconds > 0 }
        var first = now.loopIndex
        var start = begun
        while (first > 0 && loop[first - 1].youtube != null) {
            first--
            start -= loop[first].seconds * 1000
        }
        var last = now.loopIndex
        var end = begun + now.video.seconds * 1000
        while (last + 1 < loop.size && loop[last + 1].youtube != null) {
            last++
            end += loop[last].seconds * 1000
        }
        // The next time slot (the news) cuts it short; the rest follows after it, on a new page.
        return Block(loop.subList(first, last + 1), start, minOf(end, now.nextSlotMs))
    }

    /**
     * Our locked page playing [channel]'s run of YouTube videos on now, joined where the clock says;
     * null when our own player plays. The address stays the same for the whole run.
     */
    fun blockPage(channel: Channel?, version: Int, nowMs: Long = System.currentTimeMillis()): String? {
        val c = configOf(channel) ?: return null
        if (STATIONS.firstOrNull { it.id == c.id }?.youtube == true) return null
        val b = block(c, nowMs) ?: return null
        fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20")
        return "https://tv.bulkbazaar.ca/channel/block.html?app=1&at=${b.startMs}&until=${b.endMs}" +
            "&ids=" + b.videos.joinToString(",") { it.youtube!! } +
            "&secs=" + b.videos.joinToString(",") { it.seconds.toString() } +
            "&name=" + enc(c.name) + BRAND + (c.logo?.let { "&logo=" + enc(it) } ?: "") + "&corner=" + c.logoCorner +
            (c.ticker?.let { "&tick=" + enc(it) } ?: "") + "&ver=$version"
    }

    /**
     * Schedule entries that stand for a list built on the website every day: Bazaar TV's upcoming
     * trailers ("trailers", tools/build_trailers.py), popular music videos ("music", tools/build_music_videos.py)
     * and its other programme blocks: dramas, cartoons, cooking and more ("list", tools/build_bazaar_blocks.py).
     */
    private val LIST_KINDS = setOf("trailers", "music", "list", "ads")

    /**
     * [o] (a schedule as saved) with each list entry replaced by the videos in its list, as [fetch]
     * gets them (null when it can't): the list changes every day without the owner saving anything.
     * Each loop place of the entry gets the whole list; a time slot can't hold a list and is dropped.
     */
    fun expand(o: JSONObject, fetch: (String) -> JSONObject?): JSONObject {
        val videos = o.optJSONArray("videos") ?: return o
        val lists = (0 until videos.length()).mapNotNull { videos.optJSONObject(it) }
            .filter { it.optString("kind") in LIST_KINDS && it.optString("url").startsWith("http") }
        if (lists.isEmpty()) return o
        val out = JSONObject(o.toString())
        val newVideos = org.json.JSONArray()
        val ids = mutableMapOf<String, List<String>>()
        for (i in 0 until videos.length()) {
            val v = videos.optJSONObject(i) ?: continue
            if (v !in lists) {
                newVideos.put(v)
                continue
            }
            val fetched = runCatching { fetch(v.optString("url")) }.getOrNull()
            val parts = mutableListOf<String>()
            if (v.optString("kind") == "ads") {
                // Bazaar Ads: our promos or the sponsors' ads, our own videos ([src] beside the list or a full link), 5 to 60 s each.
                val ads = fetched?.optJSONArray("ads") ?: fetched?.optJSONArray("promos")
                val base = runCatching { java.net.URI(v.optString("url")) }.getOrNull()
                for (j in 0 until (ads?.length() ?: 0)) {
                    val item = ads!!.optJSONObject(j) ?: continue
                    val src = item.optString("src").trim().takeIf { it.isNotEmpty() } ?: continue
                    val secs = Math.round(item.optDouble("secs", 0.0)).coerceAtMost(60).takeIf { it >= 5 } ?: continue
                    val url = runCatching { base?.resolve(src)?.toString() }.getOrNull() ?: continue
                    val id = "${v.optString("id")}-$j"
                    newVideos.put(JSONObject().put("id", id).put("title", item.optString("title").ifBlank { v.optString("title").ifBlank { "Ad" } })
                        .put("url", url).put("secs", secs).put("kind", "ad"))
                    parts += id
                }
                ids[v.optString("id")] = parts
                continue
            }
            val list = fetched?.optJSONArray("videos")
            for (j in 0 until (list?.length() ?: 0)) {
                val item = list!!.optJSONObject(j) ?: continue
                val yt = item.optString("id").takeIf { Regex("[A-Za-z0-9_-]{11}").matches(it) } ?: continue
                val secs = item.optLong("secs").takeIf { it > 0 } ?: continue
                val id = "${v.optString("id")}-$yt"
                if (id !in parts) newVideos.put(JSONObject().put("id", id).put("title", item.optString("title"))
                    .put("url", YouTube.watchUrl(yt)).put("secs", secs).put("kind", "programme"))
                parts += id
            }
            ids[v.optString("id")] = parts
        }
        out.put("videos", newVideos)
        val loop = o.optJSONArray("loop")
        if (loop != null) {
            val newLoop = org.json.JSONArray()
            for (i in 0 until loop.length()) {
                val id = loop.optString(i)
                ids[id]?.forEach { newLoop.put(it) } ?: newLoop.put(id)
            }
            out.put("loop", newLoop)
        }
        val slots = o.optJSONArray("slots")
        if (slots != null) {
            val kept = org.json.JSONArray()
            for (i in 0 until slots.length()) slots.optJSONObject(i)?.takeIf { it.optString("video") !in ids }?.let { kept.put(it) }
            out.put("slots", kept)
        }
        return out
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
