package com.appbazaar.app.data

import android.content.Context
import android.os.SystemClock
import android.widget.Toast
import org.json.JSONObject

/**
 * The owner's test updates. Every new build first goes to the owner-only "test" release; nobody else
 * gets it until the owner has tried it and said it is good. Seven quick taps on the version number
 * turn test updates on (or off again) on this device; then the app offers each newer test build.
 */
object OwnerTest {

    const val BASE = "https://github.com/NaseerBabar786/live-tv-app/releases/download/test/"
    const val VERSIONS = BASE + "versions.json"

    private const val PREFS = "owner_test"
    private const val KEY = "on"

    fun isOn(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY, false)

    fun set(context: Context, on: Boolean) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY, on).apply()

    private var taps = 0
    private var lastTap = 0L

    /** Counts taps on the version number; the seventh quick one switches test updates. */
    fun tap(context: Context) {
        val now = SystemClock.elapsedRealtime()
        taps = if (now - lastTap < 1500) taps + 1 else 1
        lastTap = now
        if (taps < 7) return
        taps = 0
        val on = !isOn(context)
        set(context, on)
        Toast.makeText(
            context,
            if (on) "Test updates ON (owner only). Close and open the app to get the newest test build."
            else "Test updates OFF. Only approved updates from now on.",
            Toast.LENGTH_LONG,
        ).show()
    }

    /** apps.json id -> (key in the test build's versions.json, test APK name). */
    private val TEST_APKS = mapOf(
        "live-tv" to ("cable-tv" to "LiveTV.apk"),
        "live-tv-max" to ("live-tv-max" to "LiveTVMax.apk"),
        "app-bazaar" to ("app-bazaar" to "AppBazaar.apk"),
        "iqra-quran" to ("iqra-quran" to "IqraQuran.apk"),
        "live-cam" to ("live-cam" to "LiveCam.apk"),
        "multi-chat" to ("multi-chat" to "MultiChat.apk"),
        "notes-for-claude" to ("notes-for-claude" to "NotesForClaude.apk"),
    )

    /** [apps] with each app that has a newer test build pointing at that test build. Call off the main thread. */
    fun withTestBuilds(apps: List<StoreApp>): List<StoreApp> {
        val versions = JSONObject(Net.fetchText(VERSIONS + "?t=" + System.currentTimeMillis()))
        return apps.map { app ->
            val (key, apk) = TEST_APKS[app.id] ?: return@map app
            val test = versions.optString(key)
            if (test.isBlank() || !Versions.isNewer(test, app.version)) app
            else app.copy(version = test, apkUrl = BASE + apk, whatsNew = "TEST build (owner only). " + app.whatsNew)
        }
    }
}
