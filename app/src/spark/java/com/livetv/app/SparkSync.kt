package com.livetv.app

import android.content.Context
import com.livetv.app.data.MyChannel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Fetches Spark TV's schedules: tv.bulkbazaar.ca/channel/play/<id>.json, made from our channels' schedules
 * with every YouTube video taken out (tools/build_play_schedules.py). No sign-in and no Firebase: the files
 * are public. Quietly keeps the saved schedules when offline.
 */
object SparkSync {
    private const val BASE = "https://tv.bulkbazaar.ca/channel/play/"

    /**
     * The schedules built into the app (docs/channel/play at build time), for each channel the app has no
     * saved schedule for yet: a first start, or one without internet, still has every channel.
     */
    suspend fun seed(context: Context) = withContext(Dispatchers.IO) {
        MyChannel.init(context)
        for (station in MyChannel.PLAY_STATIONS) {
            if (MyChannel.configs.value.containsKey(station.id)) continue
            runCatching {
                val json = context.assets.open("${station.id}.json").bufferedReader().use { it.readText() }
                MyChannel.update(station.id, JSONObject(json))
            }
        }
    }

    suspend fun refresh() = withContext(Dispatchers.IO) {
        for (station in MyChannel.PLAY_STATIONS) {
            runCatching { MyChannel.update(station.id, JSONObject(get("$BASE${station.id}.json"))) }
        }
    }

    private fun get(url: String): String {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 15_000
            c.readTimeout = 20_000
            c.useCaches = false
            c.setRequestProperty("User-Agent", Edition.USER_AGENT)
            if (c.responseCode !in 200..299) error("HTTP ${c.responseCode} for $url")
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally {
            c.disconnect()
        }
    }
}
