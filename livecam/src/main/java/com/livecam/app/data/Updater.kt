package com.livecam.app.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Checks GitHub for a newer Live Cam release, downloads its APK and hands it to the
 * system installer. Live Cam shares its repository with Cable TV, so it looks through the
 * recent releases for the highest "livecam-v…" tag rather than GitHub's "latest".
 */
class Updater(context: Context) {

    private val appContext = context.applicationContext

    data class Release(val version: String, val apkUrl: String, val size: Long)

    val installedVersion: String =
        runCatching { appContext.packageManager.getPackageInfo(appContext.packageName, 0).versionName }
            .getOrNull() ?: "0"

    /** The newest Live Cam release when it is newer than the installed app, or null when up to date. */
    suspend fun checkForUpdate(): Release? = withContext(Dispatchers.IO) {
        testRelease()?.let { return@withContext it }
        val releases = JSONArray(fetchText(RELEASES_API))
        val newest = (0 until releases.length())
            .map { releases.getJSONObject(it) }
            .filter { !it.optBoolean("draft") && !it.optBoolean("prerelease") }
            .mapNotNull { r ->
                val version = UpdateVersions.versionFromTag(r.optString("tag_name")) ?: return@mapNotNull null
                val assets = r.getJSONArray("assets")
                val apk = (0 until assets.length()).map { assets.getJSONObject(it) }
                    .firstOrNull { it.getString("name").endsWith(".apk") } ?: return@mapNotNull null
                Release(version, apk.getString("browser_download_url"), apk.optLong("size"))
            }
            .maxWithOrNull { a, b -> UpdateVersions.compare(a.version, b.version) }
        newest?.takeIf { UpdateVersions.isNewer(it.version, installedVersion) }
    }

    /** The owner's newer test build, only when test updates are on for this device (see [OwnerTest]). */
    fun testRelease(): Release? {
        if (!OwnerTest.isOwner(appContext)) return null
        val version = runCatching { JSONObject(fetchText(OwnerTest.VERSIONS)).optString("live-cam") }.getOrNull()
            ?.takeIf { it.isNotBlank() && UpdateVersions.isNewer(it, installedVersion) } ?: return null
        return Release("$version (test)", OwnerTest.BASE + "LiveCam.apk", 0)
    }

    /** Downloads the release's APK, reporting progress from 0 to 1. */
    suspend fun download(release: Release, onProgress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val dir = File(appContext.cacheDir, "updates").apply { mkdirs() }
        val file = File(dir, "LiveCam.apk")
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
            error("The download was incomplete. It will try again next time the app starts.")
        }
        file
    }

    /** Whether Android already lets this app install updates. */
    fun canInstall(): Boolean = appContext.packageManager.canRequestPackageInstalls()

    /** Opens the one-time "Install unknown apps" setting for Live Cam. Returns false if the TV has none. */
    fun openInstallPermission(): Boolean = runCatching {
        appContext.startActivity(
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${appContext.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }.isSuccess

    /** Opens the system installer for the downloaded APK. Android always asks the user to confirm. */
    fun install(apk: File) {
        val uri = FileProvider.getUriForFile(appContext, "${appContext.packageName}.updates", apk)
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
                setRequestProperty("User-Agent", "LiveCam-Android")
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
        private const val RELEASES_API =
            "https://api.github.com/repos/NaseerBabar786/live-tv-app/releases?per_page=50"
    }
}
