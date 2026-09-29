package com.livetv.app.data

import android.content.Context
import android.net.Uri
import androidx.core.content.edit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Loads channels from the configured playlist source and stores user settings.
 *
 * The playlist source is one of:
 *  - empty: the bundled sample playlist (assets/sample.m3u)
 *  - an http(s) URL to an M3U playlist
 *  - a content:// URI to a playlist file the user picked on the device
 */
class ChannelRepository(context: Context) {

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("live_tv", Context.MODE_PRIVATE)
    private val cacheFile = File(appContext.filesDir, "playlist_cache.m3u")

    var playlistSource: String
        get() = prefs.getString(KEY_SOURCE, "") ?: ""
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
            val text = when {
                source.isEmpty() -> readAsset()
                source.startsWith("content://") -> readContentUri(Uri.parse(source))
                else -> try {
                    download(source).also { cacheFile.writeText(it) }
                } catch (e: Exception) {
                    if (cacheFile.exists()) cacheFile.readText() else throw e
                }
            }
            val channels = M3uParser.parse(text)
            require(channels.isNotEmpty()) { "The playlist has no channels." }
            channels
        }
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
        private const val KEY_SOURCE = "playlist_source"
        private const val KEY_FAVORITES = "favorites"
        private const val KEY_LAST_CHANNEL = "last_channel"
    }
}
