package com.livetv.app.data

import android.content.Context
import android.os.SystemClock
import android.widget.Toast
import com.livetv.app.account.Account
import com.livetv.app.account.FirebaseConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The owner's test updates. Every new build first goes to the owner-only "test" release; nobody else
 * gets it until the owner has tried it and said it is good. Signed in with the owner's account (or after seven
 * quick taps on the version number) test updates are on and a "Try test version" button shows in Settings.
 * Our other apps ask [com.livetv.app.OwnerProvider] whether this is the owner's device.
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

    /** Whether this is the owner's device: signed in with the owner's account, or test updates switched on here. */
    fun isOwner(context: Context): Boolean {
        val admin = runCatching { FirebaseConfig.configured && Account.get(context).isAdmin }.getOrDefault(false)
        if (admin && !isOn(context)) set(context, true)
        return admin || isOn(context)
    }

    /**
     * The owner's "Try test version" button: downloads the newest test build and opens the installer.
     * Returns what to tell the owner. If the test build closes by itself, CrashGuard offers the last good version.
     */
    suspend fun tryNewest(context: Context, onProgress: (Float) -> Unit): String {
        set(context, true)
        val updater = Updater(context)
        val release = withContext(Dispatchers.IO) { updater.testRelease() }
            ?: return "No newer test version right now. You have ${Updater.label(updater.installedVersion)}."
        val apk = runCatching { updater.download(release, onProgress = onProgress) }
            .getOrElse { return it.message ?: "The test version could not be downloaded." }
        if (!updater.ensureInstallAllowed()) return "Allow installing apps, then press Try test version again."
        return runCatching { updater.install(apk); "Installing ${release.version}." }
            .getOrElse { it.message ?: "The installer could not be opened." }
    }

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
}
