package com.livetv.app.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import com.livetv.app.Edition
import java.net.HttpURLConnection
import java.net.URL

/**
 * Checks GitHub for a newer release of the app, downloads its APK and hands it to
 * the system installer. Releases are tagged "v<versionName>-build<n>" by CI.
 */
class Updater(context: Context) {

    private val appContext = context.applicationContext

    data class Release(val version: String, val apkUrl: String, val size: Long)

    val installedVersion: String =
        runCatching { appContext.packageManager.getPackageInfo(appContext.packageName, 0).versionName }
            .getOrNull() ?: "0"

    /** The latest release when it is newer than the installed app, or null when up to date. */
    suspend fun checkForUpdate(): Release? = withContext(Dispatchers.IO) {
        testRelease()?.let { return@withContext it }
        val json = JSONObject(fetchText(if (Edition.MAX) MAX_RELEASE_API else LATEST_RELEASE_API))
        // Live TV Max's fixed release is named "Live TV Max 1.0.0"; NextGen Cable's tags carry the version.
        val version = if (Edition.MAX) json.getString("name").substringAfterLast(' ') else versionFromTag(json.getString("tag_name"))
        val assets = json.getJSONArray("assets")
        val apk = (0 until assets.length()).map { assets.getJSONObject(it) }
            .firstOrNull { it.getString("name").endsWith(".apk") }
            ?: error("The latest release has no app file.")
        Release(version, apk.getString("browser_download_url"), apk.optLong("size"))
            .takeIf { isNewer(it.version, installedVersion) }
    }

    /**
     * The owner's newer test build, only when test updates are on for this device (see [OwnerTest]).
     * Signing in with the owner's account turns them on by itself.
     */
    fun testRelease(): Release? {
        if (!OwnerTest.isOwner(appContext)) return null
        val version = runCatching {
            JSONObject(fetchText(OwnerTest.VERSIONS)).optString(if (Edition.MAX) "live-tv-max" else "cable-tv")
        }.getOrNull()?.takeIf { it.isNotBlank() && isNewer(it, installedVersion) } ?: return null
        return Release(label(version).let { if ("test" in it) it else "$it (test)" }, OwnerTest.BASE + if (Edition.MAX) "LiveTVMax.apk" else "LiveTV.apk", 0)
    }

    /** Downloads the release's APK, reporting progress from 0 to 1. */
    suspend fun download(release: Release, name: String = "LiveTV.apk", onProgress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val dir = File(appContext.cacheDir, "updates").apply { mkdirs() }
        val file = File(dir, name)
        val conn = open(release.apkUrl)
        try {
            val total = conn.contentLengthLong.takeIf { it > 0 } ?: release.size
            conn.inputStream.use { input ->
                file.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var done = 0L
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        output.write(buffer, 0, n)
                        done += n
                        if (total > 0) onProgress((done.toFloat() / total).coerceIn(0f, 1f))
                    }
                }
            }
        } finally {
            conn.disconnect()
        }
        if (release.size > 0 && file.length() != release.size) {
            file.delete()
            error("The download was incomplete. Please try again.")
        }
        file
    }

    /**
     * On Android 8+ the user must allow this app to install apps once. Returns false
     * after opening that setting, so the caller can ask the user to press Update again.
     */
    fun ensureInstallAllowed(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        if (appContext.packageManager.canRequestPackageInstalls()) return true
        val opened = runCatching {
            appContext.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${appContext.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }.isSuccess
        // Some TVs have no such screen; the installer then asks by itself.
        return !opened
    }

    /** Opens the system installer for the downloaded APK. */
    fun install(apk: File) {
        val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            FileProvider.getUriForFile(appContext, "${appContext.packageName}.updates", apk)
        } else {
            // Before Android 7 the installer only opens plain files it can read.
            val shared = File(appContext.externalCacheDir ?: error("No storage for the update."), apk.name)
            apk.copyTo(shared, overwrite = true)
            Uri.fromFile(shared)
        }
        appContext.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    private fun fetchText(url: String): String {
        val conn = open(url)
        return try {
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    /** Opens [url], following redirects (GitHub sends downloads to another host). */
    private fun open(url: String): HttpURLConnection {
        var current = URL(url)
        repeat(5) {
            val conn = (current.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 30_000
                instanceFollowRedirects = true
                setRequestProperty("User-Agent", ChannelRepository.USER_AGENT)
                setRequestProperty("Accept", "application/vnd.github+json, */*")
            }
            when (val code = conn.responseCode) {
                in 200..299 -> return conn
                in 300..399 -> {
                    val location = conn.getHeaderField("Location") ?: error("Redirect without location")
                    conn.disconnect()
                    current = URL(current, location)
                }
                else -> {
                    conn.disconnect()
                    error("Could not reach the update server (HTTP $code).")
                }
            }
        }
        error("Too many redirects.")
    }

    companion object {
        private const val LATEST_RELEASE_API =
            "https://api.github.com/repos/NaseerBabar786/live-tv-app/releases/latest"

        /** Live TV Max's newest build is always in the release tagged "live-tv-max" (see build-apk.yml). */
        private const val MAX_RELEASE_API =
            "https://api.github.com/repos/NaseerBabar786/live-tv-app/releases/tags/live-tv-max"

        /** "v1.6.2-build31" -> "1.6.2". */
        fun versionFromTag(tag: String): String = tag.removePrefix("v").substringBefore("-")

        /**
         * How a version is shown. Test builds are named "<coming public version>.<test number>" by CI
         * (tools/public_version.py), so "1.11.0.5" reads "1.11.0 test 5"; public versions show as they are.
         */
        fun label(version: String): String {
            val parts = version.split(".")
            return if (parts.size == 4) parts.take(3).joinToString(".") + " test " + parts[3] else version
        }

        /** Compares dotted versions number by number, so "1.10.0" is newer than "1.9.9". */
        fun isNewer(candidate: String, installed: String): Boolean {
            val a = candidate.split(".").map { it.toIntOrNull() ?: 0 }
            val b = installed.split(".").map { it.toIntOrNull() ?: 0 }
            for (i in 0 until maxOf(a.size, b.size)) {
                val x = a.getOrElse(i) { 0 }
                val y = b.getOrElse(i) { 0 }
                if (x != y) return x > y
            }
            return false
        }
    }
}
