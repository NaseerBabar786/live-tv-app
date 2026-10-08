package com.livetv.app.data

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Viewers' "Did it play properly?" answers (owner, 2026-10-08): after every Library video the viewer says
 * Yes or No, and the answer goes to the owner's Firebase ("reports"), with nothing personal in it.
 * Every morning the Library build reads them (tools/library_check.py): a programme with more "No"
 * than "Yes" answers is taken off every Library list. The "Channel not working" report uses the same
 * collection with kind "channel".
 */
object LibraryReports {

    /** The owner's Firebase project (public by design; the Firestore rules decide what can be written). */
    private const val URL_REPORTS = "https://firestore.googleapis.com/v1/projects/live-tv-b2164/databases/(default)/documents/" +
        "reports?key=AIzaSyAukJcRHwIV_W3TKtr3_5XiVJZe-7491KE"

    fun send(context: Context, channel: Channel, ok: Boolean, kind: String = "library") {
        val version = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull()
        val time = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date())
        fun str(v: String?) = JSONObject().put("stringValue", v.orEmpty())
        val body = JSONObject().put(
            "fields", JSONObject()
                .put("kind", str(kind))
                .put("name", str(channel.name.take(200)))
                .put("url", str(channel.url.take(500)))
                .put("ok", JSONObject().put("booleanValue", ok))
                .put("app", str(context.packageName))
                .put("version", str(version))
                .put("time", JSONObject().put("timestampValue", time)),
        ).toString()
        Thread {
            runCatching {
                val conn = (URL(URL_REPORTS).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = 15_000
                    readTimeout = 15_000
                    setRequestProperty("Content-Type", "application/json")
                }
                conn.outputStream.use { it.write(body.toByteArray()) }
                conn.responseCode
                conn.disconnect()
            }
        }.start()
    }
}
