package com.appbazaar.app.data

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/** Downloads APKs, hands them to the system installer, and opens or removes installed apps. */
class Installer(context: Context) {

    private val ctx = context.applicationContext
    private val pm = ctx.packageManager

    val ownPackage: String = ctx.packageName

    /** The installed versionName of [packageName], or null when it isn't installed. */
    fun installedVersion(packageName: String?): String? {
        if (packageName.isNullOrBlank()) return null
        return runCatching { packageInfo(packageName).versionName ?: "0" }.getOrNull()
    }

    @Suppress("DEPRECATION")
    private fun packageInfo(packageName: String): PackageInfo =
        if (Build.VERSION.SDK_INT >= 33) pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
        else pm.getPackageInfo(packageName, 0)

    /** Whether Android already lets App Bazaar install apps (always true before Android 8). */
    fun canInstall(): Boolean = Build.VERSION.SDK_INT < 26 || pm.canRequestPackageInstalls()

    /** Opens the one-time "Install unknown apps" switch for App Bazaar. False when the device has none. */
    fun openInstallPermission(): Boolean = runCatching {
        if (Build.VERSION.SDK_INT < 26) error("not needed")
        ctx.startActivity(
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$ownPackage"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }.isSuccess

    suspend fun download(app: StoreApp, onProgress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val url = app.apkUrl ?: error("${app.name} has no Android download.")
        val dir = File(ctx.cacheDir, "downloads").apply { mkdirs() }
        dir.listFiles()?.forEach { if (it.lastModified() < System.currentTimeMillis() - 86_400_000L) it.delete() }
        val file = File(dir, app.id.replace(Regex("[^A-Za-z0-9_-]"), "_") + ".apk")
        val part = File(dir, file.name + ".part")
        try {
            Net.download(url, part, onProgress)
            if (part.length() < 1024) error("The download was empty. Please try again.")
            file.delete()
            if (!part.renameTo(file)) error("Could not save the download.")
        } finally {
            part.delete()
        }
        file
    }

    private val sessionAction = "$ownPackage.INSTALL_RESULT"
    private val results = ConcurrentHashMap<Int, (status: Int, message: String?) -> Unit>()

    /** Hears back from Android's installer about each install session. */
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            val id = i.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1)
            val status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
            if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                // Android wants the user to press Install: show its confirm screen. The final result comes later.
                val confirm = if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                else @Suppress("DEPRECATION") i.getParcelableExtra(Intent.EXTRA_INTENT)
                if (confirm == null || runCatching { ctx.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isFailure) {
                    results.remove(id)?.invoke(PackageInstaller.STATUS_FAILURE, "The installer could not open.")
                }
                return
            }
            results.remove(id)?.invoke(status, i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE))
        }
    }

    init {
        ContextCompat.registerReceiver(ctx, receiver, IntentFilter(sessionAction), ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    /**
     * Installs [apk] through an install session. On Android 12 and newer, updates to apps that App
     * Bazaar installed itself go through with no Install tap ([silent]); anything else shows Android's
     * normal Install screen. [onResult] gets a PackageInstaller status when the install ends.
     */
    suspend fun installSession(apk: File, silent: Boolean, onResult: (status: Int, message: String?) -> Unit) = withContext(Dispatchers.IO) {
        val installer = pm.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        if (Build.VERSION.SDK_INT >= 31) {
            params.setRequireUserAction(
                if (silent) PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED
                else PackageInstaller.SessionParams.USER_ACTION_REQUIRED,
            )
        }
        val id = installer.createSession(params)
        try {
            installer.openSession(id).use { session ->
                session.openWrite("app.apk", 0, apk.length()).use { out ->
                    apk.inputStream().use { it.copyTo(out) }
                    session.fsync(out)
                }
                results[id] = onResult
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                val sender = PendingIntent.getBroadcast(ctx, id, Intent(sessionAction).setPackage(ownPackage), flags)
                session.commit(sender.intentSender)
            }
        } catch (e: Exception) {
            results.remove(id)
            runCatching { installer.abandonSession(id) }
            throw e
        }
    }

    /** Opens the system installer for the downloaded APK. Android always asks the user to confirm. */
    fun install(apk: File) {
        val uri = FileProvider.getUriForFile(ctx, "$ownPackage.downloads", apk)
        ctx.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    /** Starts an installed app: the TV launcher entry on TVs, the normal one on phones. */
    fun open(packageName: String): Boolean {
        val intent = pm.getLeanbackLaunchIntentForPackage(packageName)?.takeIf { isTv() }
            ?: pm.getLaunchIntentForPackage(packageName)
            ?: pm.getLeanbackLaunchIntentForPackage(packageName)
            ?: return false
        return runCatching { ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess
    }

    fun uninstall(packageName: String): Boolean = runCatching {
        ctx.startActivity(
            Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }.isSuccess

    fun openWeb(url: String): Boolean = runCatching {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }.isSuccess

    fun isTv(): Boolean = Device.isTv(ctx)
}
