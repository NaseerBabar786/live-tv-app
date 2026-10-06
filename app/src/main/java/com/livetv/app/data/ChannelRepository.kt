package com.livetv.app.data

import android.content.Context
import android.net.Uri
import com.livetv.app.Edition
import androidx.core.content.edit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Loads channels from the configured playlist source and stores user settings.
 *
 * The playlist source is one of:
 *  - "famelack:mix": Pakistani, Indian, Canadian, UK and USA channels from [Famelack] (the default)
 *  - "famelack:all": every country from [Famelack]
 *  - "famelack:pick:<cc>,<cc>": the countries the user ticked, one section each
 *  - "famelack:<country>": free channels for one country from [Famelack]
 *  - "sample": the bundled sample playlist (assets/sample.m3u)
 *  - an http(s) URL to an M3U playlist
 *  - a content:// URI to a playlist file the user picked on the device
 */
class ChannelRepository(context: Context) {

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("live_tv", Context.MODE_PRIVATE)

    /** Defaults to the combined Pakistani, Indian, Canadian, UK and USA channels. */
    var playlistSource: String
        get() = prefs.getString(KEY_SOURCE, null)?.ifBlank { null } ?: defaultSource()
        set(value) = prefs.edit { putString(KEY_SOURCE, value.trim()) }

    /** Cable TV's channel list: [PROVIDER_FAMELACK] (the default) or [PROVIDER_CHECKED]. */
    var provider: String
        get() = prefs.getString(KEY_PROVIDER, null)?.takeIf { it == PROVIDER_CHECKED } ?: PROVIDER_FAMELACK
        set(value) = prefs.edit { putString(KEY_PROVIDER, value) }

    private val checked: Boolean get() = provider == PROVIDER_CHECKED

    var favorites: Set<String>
        get() = prefs.getStringSet(KEY_FAVORITES, emptySet())?.toSet() ?: emptySet()
        set(value) = prefs.edit { putStringSet(KEY_FAVORITES, value) }

    /** Languages chosen in Settings; empty means every language. */
    var languages: Set<String>
        get() = prefs.getStringSet(KEY_LANGUAGES, emptySet())?.toSet() ?: emptySet()
        set(value) = prefs.edit { putStringSet(KEY_LANGUAGES, value) }

    /** Playlists the viewer added (Stream Player Plus). */
    var playlists: List<Playlist>
        get() = Playlist.fromJson(prefs.getString(KEY_PLAYLISTS, null))
        set(value) = prefs.edit { putString(KEY_PLAYLISTS, Playlist.toJson(value)) }

    /** Whether MTA's channels and Library programmes are shown (Cable TV only; off by default). */
    var showMta: Boolean
        get() = Edition.HAS_VOD && prefs.getBoolean(KEY_MTA, false)
        set(value) = prefs.edit { putBoolean(KEY_MTA, value) }

    var lastChannelUrl: String?
        get() = prefs.getString(KEY_LAST_CHANNEL, null)
        set(value) = prefs.edit { putString(KEY_LAST_CHANNEL, value) }

    /**
     * Loads the playlist. When a remote download fails, falls back to the last
     * copy that was downloaded successfully so the app still works offline.
     */
    suspend fun loadChannels(): Result<List<Channel>> = withContext(Dispatchers.IO) {
        runCatching {
            val source = playlistSource
            val country = Famelack.countryCode(source)
            val picked = Famelack.pickedCountries(source)
            val channels = when {
                source == SOURCE_SAMPLE -> M3uParser.parse(readAsset())
                source.startsWith("content://") -> M3uParser.parse(readContentUri(Uri.parse(source)))
                checked && source == Famelack.SOURCE_MIX ->
                    CheckedList.convert(M3uParser.parse(downloadCached("checked:mix", CheckedList.MIX_URL)))
                checked && source == Famelack.SOURCE_ALL -> checkedAll()
                checked && picked != null -> CheckedList.sections(checkedAll(), picked.map { code ->
                    Famelack.MIX.firstOrNull { it.country == code } ?: Famelack.Section(code, "")
                })
                checked && country != null -> checkedAll().filter { it.country == country }
                source == Famelack.SOURCE_MIX -> loadSections(Famelack.MIX)
                source == Famelack.SOURCE_ALL -> loadSections(
                    Famelack.parseCountries(downloadCached("countries", Famelack.COUNTRIES_URL))
                        .map { Famelack.Section(it.code, it.name) }
                )
                picked != null -> {
                    val names = runCatching {
                        Famelack.parseCountries(downloadCached("countries", Famelack.COUNTRIES_URL))
                            .associate { it.code to it.name }
                    }.getOrDefault(emptyMap())
                    // Pakistan, India and Canada keep their usual sections (India: Hindi, Urdu, Punjabi).
                    loadSections(picked.map { code ->
                        Famelack.MIX.firstOrNull { it.country == code }
                            ?: Famelack.Section(code, names[code] ?: code.uppercase())
                    })
                }
                country != null -> Famelack.parseChannels(
                    downloadCached(source, Famelack.countryUrl(country)),
                    channelInfo,
                )
                source.startsWith(IptvOrg.BASE) -> IptvOrg.convertPlaylist(
                    M3uParser.parse(downloadCached(source, source)),
                    iptvLanguages(),
                )
                else -> M3uParser.parse(downloadCached(source, source))
            }
            require(channels.isNotEmpty()) { "No playable channels found for this source." }
            // MTA's own channels go after the list's, unless the list already has them.
            val withMta = withPakistaniLive(channels.filterNot { Mta.isOldLink(it.url) })
                .let { if (showMta) it + Mta.CHANNELS else it }
            // Lists can repeat a stream (e.g. one channel filed under two names). The
            // stream URL is the channel's key in the grid, and a repeated key crashes it.
            withMta.distinctBy { it.id }
        }
    }

    /**
     * The movies and series episodes in every saved playlist (Cable TV's Movies & Series).
     * A playlist that can't be loaded is skipped; each item's group gets the playlist's
     * name when the playlist gives none.
     */
    suspend fun loadVod(): List<Channel> = coroutineScope {
        val mta = if (showMta) listOf(Playlist("MTA", Mta.VIDEOS_URL)) else emptyList()
        (playlists + Vod.builtIn() + mta).map { playlist ->
            async(Dispatchers.IO) {
                runCatching {
                    val text = when {
                        playlist.source == SOURCE_SAMPLE -> readAsset()
                        playlist.source.startsWith("content://") -> readContentUri(Uri.parse(playlist.source))
                        else -> downloadCached(playlist.source, playlist.source)
                    }
                    M3uParser.parse(text)
                        .filter { Vod.kind(it) != Vod.Kind.LIVE }
                        .map { if (it.group == null) it.copy(group = playlist.name) else it }
                }.getOrDefault(emptyList())
            }
        }.awaitAll().flatten().distinctBy { it.id }
    }

    /**
     * Adds the Pakistani channels that stream live on their own YouTube channel (Cable TV only,
     * when the list has Pakistani channels), after the last Pakistani channel. Each replaces a
     * channel of the same name in the list, whose own stream doesn't work, so none is listed twice.
     */
    private fun withPakistaniLive(channels: List<Channel>): List<Channel> {
        if (!Edition.HAS_VOD) return channels
        val last = channels.indexOfLast { it.country == "pk" }
        if (last < 0) return channels
        val live = runCatching { M3uParser.parse(downloadCached("pakistan-live", PAKISTAN_LIVE_URL)) }
            .getOrDefault(emptyList())
            .filter { YouTube.isYouTube(it.url) }
        if (live.isEmpty()) return channels
        val group = channels[last].group
        val names = live.flatMap { liveNames(it.name) }.toSet()
        val kept = channels.filterIndexed { i, c -> i > last || c.country != "pk" || nameKey(c.name) !in names }
        val at = kept.indexOfLast { it.country == "pk" } + 1
        return kept.take(at) + live.map { it.copy(group = group ?: it.group) } + kept.drop(at)
    }

    /** Every channel in the daily-checked list on tv.bulkbazaar.ca. */
    private fun checkedAll(): List<Channel> =
        CheckedList.convert(M3uParser.parse(downloadCached("checked:all", CheckedList.ALL_URL)))

    /** Downloads several countries in parallel; a country that fails is skipped. */
    private suspend fun loadSections(sections: List<Famelack.Section>): List<Channel> = loadFamelackSections(sections)

    /** Each iptv-org stream's language; empty when the index can't be loaded. */
    private fun iptvLanguages(): Map<String, String> =
        runCatching { IptvOrg.parseGroups(downloadCached("iptv:languages", IptvOrg.LANGUAGES_URL)) }
            .getOrDefault(emptyMap())

    private suspend fun loadFamelackSections(sections: List<Famelack.Section>): List<Channel> = coroutineScope {
        val limit = Semaphore(8)
        sections.map { section ->
            async {
                limit.withPermit {
                    runCatching {
                        val source = Famelack.source(section.country)
                        Famelack.parseChannels(
                            downloadCached(source, Famelack.countryUrl(section.country)),
                            channelInfo,
                            section = section.title,
                            languages = section.languages,
                        )
                    }.getOrDefault(emptyList())
                }
            }
        }.awaitAll().flatten()
    }

    /** Logos and categories for Famelack channels, bundled with the app. */
    private val channelInfo: Map<String, Famelack.Info> by lazy {
        runCatching {
            Famelack.parseInfo(appContext.assets.open("channel_info.json").bufferedReader().use { it.readText() })
        }.getOrDefault(emptyMap())
    }

    /** Every playlist iptv-org publishes, for "Find playlists online". */
    suspend fun loadPlaylistCatalogue(): Result<List<IptvOrg.Listing>> = withContext(Dispatchers.IO) {
        runCatching {
            IptvOrg.parseCatalogue(downloadCached("iptv:catalogue", IptvOrg.CATALOGUE_URL))
                .also { require(it.isNotEmpty()) { "No playlists found." } }
        }
    }

    /** Countries that have free channels, for the country picker. */
    suspend fun loadCountries(): Result<List<Famelack.Country>> = withContext(Dispatchers.IO) {
        runCatching { Famelack.parseCountries(downloadCached("countries", Famelack.COUNTRIES_URL)) }
    }

    /**
     * Downloads [url], keeping a copy on disk. When the download fails, the last
     * good copy is used so the app still starts offline.
     */
    private fun downloadCached(key: String, url: String): String {
        val cache = File(appContext.cacheDir, "src_" + key.hashCode().toUInt().toString(16))
        return try {
            download(url).also { cache.writeText(it) }
        } catch (e: Exception) {
            if (cache.exists()) cache.readText() else throw e
        }
    }

    /** Cable TV starts on its built-in channels; Stream Player Plus has none until a playlist is added. */
    private fun defaultSource(): String = if (Edition.LIVE_TV) Famelack.SOURCE_MIX else ""

    private fun readAsset(): String =
        appContext.assets.open("sample.m3u").bufferedReader().use { it.readText() }

    private fun readContentUri(uri: Uri): String =
        appContext.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
            ?: error("Could not open the playlist file.")

    private fun download(url: String): String {
        var current = URL(url)
        // HttpURLConnection does not follow http <-> https redirects on its own.
        repeat(5) {
            val conn = (current.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 30_000
                instanceFollowRedirects = true
                setRequestProperty("User-Agent", USER_AGENT)
            }
            try {
                when (val code = conn.responseCode) {
                    in 200..299 -> return conn.inputStream.bufferedReader().use { it.readText() }
                    in 300..399 -> {
                        val location = conn.getHeaderField("Location") ?: error("Redirect without location")
                        current = URL(current, location)
                    }
                    else -> error("Playlist download failed (HTTP $code).")
                }
            } finally {
                conn.disconnect()
            }
        }
        error("Too many redirects.")
    }

    companion object {
        const val USER_AGENT = Edition.USER_AGENT
        const val SOURCE_SAMPLE = "sample"
        private const val KEY_SOURCE = "playlist_source"
        private const val KEY_FAVORITES = "favorites"
        private const val KEY_LAST_CHANNEL = "last_channel"
        private const val KEY_LANGUAGES = "languages"
        private const val KEY_PLAYLISTS = "playlists"
        private const val KEY_PROVIDER = "provider"
        private const val KEY_MTA = "mta"
        const val PROVIDER_FAMELACK = "famelack"
        const val PROVIDER_CHECKED = "checked"
        const val PAKISTAN_LIVE_URL = "https://tv.bulkbazaar.ca/PakistanLive.m3u"

        /** "92 News HD" and "92 News" are the same channel. */
        fun nameKey(name: String) = name.lowercase().filter { it.isLetterOrDigit() }.removeSuffix("hd")

        /** The names a live channel replaces: its own, and its old one ("Aaj TV" for "Aaj News"). */
        fun liveNames(name: String): List<String> =
            listOfNotNull(nameKey(name), OLD_NAMES[nameKey(name)])

        private val OLD_NAMES = mapOf("aajnews" to "aajtv")
    }
}
