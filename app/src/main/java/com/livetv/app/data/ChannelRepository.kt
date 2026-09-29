package com.livetv.app.data

import android.content.Context
import android.net.Uri
import androidx.core.content.edit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

/**
 * Loads channels from the configured playlist source and stores user settings.
 *
 * The playlist source is one of:
 *  - "famelack:<country>": free channels for a country from [Famelack] (the default)
 *  - "sample": the bundled sample playlist (assets/sample.m3u)
 *  - an http(s) URL to an M3U playlist
 *  - a content:// URI to a playlist file the user picked on the device
 */
class ChannelRepository(context: Context) {

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("live_tv", Context.MODE_PRIVATE)

    /** Defaults to free channels for the phone's country. */
    var playlistSource: String
        get() = prefs.getString(KEY_SOURCE, null)?.ifBlank { null } ?: defaultSource()
        set(value) = prefs.edit { putString(KEY_SOURCE, value.trim()) }

    var favorites: Set<String>
        get() = prefs.getStringSet(KEY_FAVORITES, emptySet())?.toSet() ?: emptySet()
        set(value) = prefs.edit { putStringSet(KEY_FAVORITES, value) }

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
            val channels = when {
                source == SOURCE_SAMPLE -> M3uParser.parse(readAsset())
                source.startsWith("content://") -> M3uParser.parse(readContentUri(Uri.parse(source)))
                country != null -> Famelack.parseChannels(
                    downloadCached(source, Famelack.countryUrl(country)),
                    channelInfo,
                )
                else -> M3uParser.parse(downloadCached(source, source))
            }
            require(channels.isNotEmpty()) { "No playable channels found for this source." }
            channels
        }
    }

    /** Logos and categories for Famelack channels, bundled with the app. */
    private val channelInfo: Map<String, Famelack.Info> by lazy {
        runCatching {
            Famelack.parseInfo(appContext.assets.open("channel_info.json").bufferedReader().use { it.readText() })
        }.getOrDefault(emptyMap())
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

    private fun defaultSource(): String {
        val country = Locale.getDefault().country.lowercase()
        return Famelack.source(if (country.length == 2) country else "us")
    }

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
        const val USER_AGENT = "LiveTV-Android/1.0"
        const val SOURCE_SAMPLE = "sample"
        private const val KEY_SOURCE = "playlist_source"
        private const val KEY_FAVORITES = "favorites"
        private const val KEY_LAST_CHANNEL = "last_channel"
    }
}
