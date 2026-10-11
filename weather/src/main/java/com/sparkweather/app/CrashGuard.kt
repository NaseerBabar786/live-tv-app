package com.sparkweather.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import org.json.JSONObject
import java.io.PrintWriter
import java.io.StringWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Crash rollback (owner's rule for every app): when a new version closes by itself while starting,
 * the next start opens [RescueActivity] instead, which offers one tap back to the last good version.
 * Call [start] right after super.onCreate in the main screen; it returns true when it opened the
 * rescue screen (the caller then returns at once).
 *
 * Every crash (at any time) is also saved as a crash report: the error, app, version, device model and
 * Android version, with nothing personal. The next start sends it to the owner's crash list
 * (Firestore "crashReports", tv.bulkbazaar.ca/crashes).
 */
object CrashGuard {

    private const val PREFS = "crash_guard"
    private const val K_CODE = "code"
    private const val K_CRASHES = "crashes"
    private const val K_REPORT = "report"
    private const val K_ERROR = "lastError"

    /** The owner's Firebase project (public by design; the Firestore rules decide who reads what). */
    private const val REPORTS_URL = "https://firestore.googleapis.com/v1/projects/live-tv-b2164/databases/(default)/documents/" +
        "crashReports?key=AIzaSyAukJcRHwIV_W3TKtr3_5XiVJZe-7491KE"

    /** A crash this soon after the app starts counts as "the update doesn't start". */
    private const val START_WINDOW_MS = 30_000L

    private var installed = false

    fun start(activity: Activity): Boolean {
        val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val code = versionCode(activity)
        if (prefs.getLong(K_CODE, -1) == code && prefs.getInt(K_CRASHES, 0) > 0) {
            sendSavedReport(activity)
            activity.startActivity(Intent(activity, RescueActivity::class.java))
            activity.finish()
            return true
        }
        if (!installed) {
            installed = true
            val started = SystemClock.elapsedRealtime()
            val previous = Thread.getDefaultUncaughtExceptionHandler()
            val appContext = activity.applicationContext
            Thread.setDefaultUncaughtExceptionHandler { thread, error ->
                runCatching {
                    val onStart = SystemClock.elapsedRealtime() - started < START_WINDOW_MS
                    val edit = prefs.edit()
                        .putString(K_REPORT, report(appContext, code, error, onStart).toString())
                        .putString(K_ERROR, (error.javaClass.simpleName + ": " + (error.message ?: "")).take(300))
                    if (onStart) edit.putLong(K_CODE, code).putInt(K_CRASHES, prefs.getInt(K_CRASHES, 0) + 1)
                    edit.commit()
                }
                previous?.uncaughtException(thread, error)
            }
            sendSavedReport(activity)
            // Started fine: forget older crashes.
            Handler(Looper.getMainLooper()).postDelayed({ reset(appContext) }, START_WINDOW_MS)
        }
        return false
    }

    /** The last crash's error in one line, for the rescue screen. */
    fun lastError(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(K_ERROR, null)

    private fun report(context: Context, code: Long, error: Throwable, onStart: Boolean): JSONObject {
        val stack = StringWriter().also { error.printStackTrace(PrintWriter(it)) }.toString()
        val version = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull()
        val time = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date())
        fun str(v: String?) = JSONObject().put("stringValue", v ?: "")
        return JSONObject().put(
            "fields", JSONObject()
                .put("app", str(context.packageName))
                .put("version", str(version))
                .put("code", JSONObject().put("integerValue", code.toString()))
                .put("device", str("${Build.MANUFACTURER} ${Build.MODEL}".take(100)))
                .put("android", str("${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"))
                .put("time", JSONObject().put("timestampValue", time))
                .put("error", str((error.javaClass.name + ": " + (error.message ?: "")).take(500)))
                .put("stack", str(stack.take(8000)))
                .put("onStart", JSONObject().put("booleanValue", onStart)),
        )
    }

    /** Sends the crash report saved last time, in the background; it is kept for next time if that fails. */
    private fun sendSavedReport(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val body = prefs.getString(K_REPORT, null) ?: return
        Thread {
            runCatching {
                val conn = (URL(REPORTS_URL).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = 15_000
                    readTimeout = 15_000
                    setRequestProperty("Content-Type", "application/json")
                }
                conn.outputStream.use { it.write(body.toByteArray()) }
                val code = conn.responseCode
                conn.disconnect()
                // 4xx means the report itself is refused (for example the rules aren't published yet): drop it.
                if (code in 200..499) prefs.edit().remove(K_REPORT).apply()
            }
        }.start()
    }

    fun reset(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(K_CRASHES).apply()
    }

    @Suppress("DEPRECATION")
    private fun versionCode(context: Context): Long = runCatching {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
    }.getOrDefault(0L)

    /** Whether this device gets the owner's test builds (see OwnerTest). */
    fun ownerTesting(context: Context): Boolean =
        context.getSharedPreferences("owner_test", Context.MODE_PRIVATE).getBoolean("on", false)
}
