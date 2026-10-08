package com.livetv.app

import android.app.Activity
import android.app.ActivityManager
import android.app.ApplicationExitInfo
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
    private const val K_EXITS_SEEN = "exitsSeen"

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
            sendSilentExits(appContext, code)
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
        // Only our own sideloaded apps send reports (not the Google Play editions).
        if (context.packageName != "com.naseerbabar.livetv" && context.packageName != "com.naseerbabar.livetvmax") return
        Thread {
            if (post(body)) prefs.edit().remove(K_REPORT).apply()
        }.start()
    }

    /**
     * The closes our own crash catcher can't see (Android 11 and newer): the app frozen and closed as
     * "not responding", a crash inside the video player, web page or other native code, or Android
     * closing it for running out of memory. Android remembers why the app last closed, so each start
     * sends the ones not sent before, as crash reports with the reason in the error line.
     */
    private fun sendSilentExits(context: Context, code: Long) {
        if (Build.VERSION.SDK_INT < 30) return
        if (context.packageName != "com.naseerbabar.livetv" && context.packageName != "com.naseerbabar.livetvmax") return
        Thread {
            runCatching {
                val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val am = context.getSystemService(ActivityManager::class.java) ?: return@runCatching
                val exits = am.getHistoricalProcessExitReasons(context.packageName, 0, 10)
                val seen = prefs.getLong(K_EXITS_SEEN, 0L)
                val fresh = exits.filter { it.timestamp > seen && silentReason(it.reason) != null }
                // The first time (no earlier start of this check), only the last day's closes are worth sending.
                val since = if (seen == 0L) System.currentTimeMillis() - 24 * 3600_000L else 0L
                var sent = true
                for (exit in fresh.filter { it.timestamp > since }.sortedBy { it.timestamp }) {
                    // Offline: try them all again next start.
                    if (!post(exitReport(context, code, exit).toString())) { sent = false; break }
                }
                if (sent) exits.maxOfOrNull { it.timestamp }?.let { if (it > seen) prefs.edit().putLong(K_EXITS_SEEN, it).apply() }
            }
        }.start()
    }

    /** A short name for the kinds of close worth reporting, null for the normal ones (closed by the viewer, updated, ...). */
    private fun silentReason(reason: Int): String? = when (reason) {
        ApplicationExitInfo.REASON_ANR -> "Not responding (ANR)"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "Native crash"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "Closed by Android: low memory"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "Closed by Android: too much CPU or memory"
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "Failed to start"
        else -> null
    }

    private fun exitReport(context: Context, code: Long, exit: ApplicationExitInfo): JSONObject {
        // ANRs come with the threads' stacks as text; native crashes' traces are binary, so just the reason then.
        val trace = if (exit.reason == ApplicationExitInfo.REASON_ANR) {
            runCatching { exit.traceInputStream?.bufferedReader()?.use { it.readText() } }.getOrNull()
        } else null
        val stack = buildString {
            append("Process ").append(exit.processName).append(", importance ").append(exit.importance)
            append(", memory ").append(exit.pss / 1024).append(" MB (rss ").append(exit.rss / 1024).append(" MB)")
            append(", status ").append(exit.status).append('\n')
            trace?.let { append(mainThread(it)) }
        }
        val time = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date(exit.timestamp))
        val version = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull()
        fun str(v: String?) = JSONObject().put("stringValue", v ?: "")
        val error = silentReason(exit.reason) + (exit.description?.let { ": $it" } ?: "")
        return JSONObject().put(
            "fields", JSONObject()
                .put("app", str(context.packageName))
                .put("version", str(version))
                .put("code", JSONObject().put("integerValue", code.toString()))
                .put("device", str("${Build.MANUFACTURER} ${Build.MODEL}".take(100)))
                .put("android", str("${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"))
                .put("time", JSONObject().put("timestampValue", time))
                .put("error", str(error.take(500)))
                .put("stack", str(stack.take(8000)))
                .put("onStart", JSONObject().put("booleanValue", false)),
        )
    }

    /** The main thread's part of an ANR trace (the one that froze), else the trace's start. */
    internal fun mainThread(trace: String): String {
        val start = trace.indexOf("\"main\"")
        if (start < 0) return trace
        val end = trace.indexOf("\n\n", start).takeIf { it > 0 } ?: trace.length
        return trace.substring(start, end)
    }

    /** Sends one report (a Firestore document body); true when it was taken or refused for good. */
    private fun post(body: String): Boolean = runCatching {
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
        // 4xx means the report itself is refused (for example the rules aren't published yet).
        code in 200..499
    }.getOrDefault(false)

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
