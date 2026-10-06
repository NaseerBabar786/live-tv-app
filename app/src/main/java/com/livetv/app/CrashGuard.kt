package com.livetv.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

/**
 * Crash rollback (owner's rule for every app): when a new version closes by itself while starting,
 * the next start opens [RescueActivity] instead, which offers one tap back to the last good version.
 * Call [start] right after super.onCreate in the main screen; it returns true when it opened the
 * rescue screen (the caller then returns at once).
 */
object CrashGuard {

    private const val PREFS = "crash_guard"
    private const val K_CODE = "code"
    private const val K_CRASHES = "crashes"

    /** A crash this soon after the app starts counts as "the update doesn't start". */
    private const val START_WINDOW_MS = 30_000L

    private var installed = false

    fun start(activity: Activity): Boolean {
        val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val code = versionCode(activity)
        if (prefs.getLong(K_CODE, -1) == code && prefs.getInt(K_CRASHES, 0) > 0) {
            activity.startActivity(Intent(activity, RescueActivity::class.java))
            activity.finish()
            return true
        }
        if (!installed) {
            installed = true
            val started = SystemClock.elapsedRealtime()
            val previous = Thread.getDefaultUncaughtExceptionHandler()
            Thread.setDefaultUncaughtExceptionHandler { thread, error ->
                if (SystemClock.elapsedRealtime() - started < START_WINDOW_MS) {
                    runCatching {
                        prefs.edit().putLong(K_CODE, code).putInt(K_CRASHES, prefs.getInt(K_CRASHES, 0) + 1).commit()
                    }
                }
                previous?.uncaughtException(thread, error)
            }
            // Started fine: forget older crashes.
            Handler(Looper.getMainLooper()).postDelayed({ reset(activity) }, START_WINDOW_MS)
        }
        return false
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
