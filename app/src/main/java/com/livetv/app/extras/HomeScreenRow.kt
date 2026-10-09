package com.livetv.app.extras

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.tv.TvContract
import android.net.Uri
import android.os.Build
import androidx.annotation.RequiresApi
import com.livetv.app.Edition
import com.livetv.app.MainActivity
import com.livetv.app.data.Channel
import com.livetv.app.data.MyChannel

/**
 * Cable TV on the TV's own home screen (owner, 2026-10-09). Google TV shows apps only in "Continue watching", so
 * the channel watched last goes there; older Android TV home screens also get a "Cable TV" row of our Spark
 * channels and the viewer's favourites. Clicking one opens Cable TV on that channel. Android 8 and up, TVs only;
 * anything the TV refuses is skipped quietly.
 */
object HomeScreenRow {
    /** The intent extra with the channel's link, read by [MainActivity]. */
    const val EXTRA_CHANNEL = "com.livetv.app.CHANNEL_URL"
    private const val ACTION_PLAY = "com.livetv.app.PLAY_CHANNEL"

    private fun supported(context: Context) =
        Edition.LIVE_TV && context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)

    private fun playIntent(context: Context, channel: Channel): String =
        Intent(context, MainActivity::class.java)
            .setAction(ACTION_PLAY)
            .putExtra(EXTRA_CHANNEL, channel.url)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            .toUri(Intent.URI_INTENT_SCHEME)

    /** The channel watched last goes to "Continue watching" (replacing the one there before). */
    fun watched(context: Context, channel: Channel) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !supported(context)) return
        val app = context.applicationContext
        Thread { addWatchNext(app, channel) }.start()
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun addWatchNext(app: Context, channel: Channel) {
        runCatching {
            val prefs = app.getSharedPreferences("extras", Context.MODE_PRIVATE)
            val old = prefs.getLong(K_WATCH_NEXT, -1L)
            if (old >= 0) runCatching { app.contentResolver.delete(TvContract.buildWatchNextProgramUri(old), null, null) }
            val values = ContentValues().apply {
                put(C_TYPE, TYPE_CHANNEL)
                put("watch_next_type", 0)
                put(C_TITLE, title(channel))
                put("short_description", "Live on ${Edition.APP_NAME}")
                put(C_LIVE, 1)
                put("last_engagement_time_utc_millis", System.currentTimeMillis())
                put(C_INTENT, playIntent(app, channel))
                put(C_PROVIDER_ID, channel.url)
                channel.logo?.let { put(C_POSTER, it) }
                put(C_ASPECT, ASPECT_16_9)
            }
            app.contentResolver.insert(TvContract.WatchNextPrograms.CONTENT_URI, values)?.let {
                prefs.edit().putLong(K_WATCH_NEXT, ContentUris.parseId(it)).apply()
            }
        }
    }

    /** The "Cable TV" row (older Android TV home screens): our channels, then the viewer's favourites, at most 30. */
    fun update(context: Context, channels: List<Channel>, favorites: Set<String>) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !supported(context) || channels.isEmpty()) return
        val app = context.applicationContext
        val shown = (channels.filter { MyChannel.isMine(it) } + channels.filter { it.id in favorites && !MyChannel.isMine(it) })
            .distinctBy { it.id }.take(30)
        Thread { fillRow(app, shown) }.start()
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun fillRow(app: Context, shown: List<Channel>) {
        runCatching {
            val prefs = app.getSharedPreferences("extras", Context.MODE_PRIVATE)
            val resolver = app.contentResolver
            var id = prefs.getLong(K_ROW, -1L)
            // The row is gone (the viewer removed it, or the TV was reset): make it again.
            if (id >= 0) {
                val exists = runCatching {
                    resolver.query(TvContract.buildChannelUri(id), arrayOf("_id"), null, null, null)
                        ?.use { it.moveToFirst() } ?: false
                }.getOrDefault(false)
                if (!exists) id = -1L
            }
            if (id < 0) {
                val values = ContentValues().apply {
                    put(C_TYPE, "TYPE_PREVIEW")
                    put("display_name", Edition.APP_NAME)
                    put("app_link_intent_uri", Intent(app, MainActivity::class.java).toUri(Intent.URI_INTENT_SCHEME))
                }
                val uri: Uri = resolver.insert(TvContract.Channels.CONTENT_URI, values) ?: return@runCatching
                id = ContentUris.parseId(uri)
                prefs.edit().putLong(K_ROW, id).apply()
                runCatching { TvContract.requestChannelBrowsable(app, id) }
            }
            // Its programmes are put in again each time (the list or favourites changed).
            runCatching { resolver.delete(TvContract.buildPreviewProgramsUriForChannel(id), null, null) }
            shown.forEachIndexed { i, channel ->
                val values = ContentValues().apply {
                    put("channel_id", id)
                    put(C_TYPE, TYPE_CHANNEL)
                    put(C_TITLE, title(channel))
                    put(C_LIVE, 1)
                    put("weight", shown.size - i)
                    put(C_INTENT, playIntent(app, channel))
                    put(C_PROVIDER_ID, channel.url)
                    channel.logo?.let { put(C_POSTER, it) }
                    put(C_ASPECT, ASPECT_16_9)
                }
                runCatching { resolver.insert(TvContract.PreviewPrograms.CONTENT_URI, values) }
            }
        }
    }

    private fun title(channel: Channel) =
        (if (channel.number > 0) "${channel.number}  " else "") + MyChannel.brand(channel.name)

    // TvContract's column names and values, spelled out: most are declared on interfaces Kotlin can't reach
    // through the WatchNextPrograms and PreviewPrograms classes.
    private const val C_TYPE = "type"
    private const val C_TITLE = "title"
    private const val C_LIVE = "live"
    private const val C_INTENT = "intent_uri"
    private const val C_PROVIDER_ID = "internal_provider_id"
    private const val C_POSTER = "poster_art_uri"
    private const val C_ASPECT = "poster_art_aspect_ratio"
    private const val TYPE_CHANNEL = 6
    private const val ASPECT_16_9 = 0

    private const val K_WATCH_NEXT = "watch_next_id"
    private const val K_ROW = "home_row_id"
}
