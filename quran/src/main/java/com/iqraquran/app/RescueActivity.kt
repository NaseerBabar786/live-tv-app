package com.iqraquran.app

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Shown instead of the app when the installed version closed by itself while starting (see
 * [CrashGuard]). One tap downloads the last good version and opens Android's installer. It is plain
 * Android screens on purpose, so it works even when the app's own screens are what crashes.
 *
 * The last good version is rebuilt by CI with a higher version number, because Android won't install
 * a lower one over a newer one. Owner's test devices go back to the approved version
 * (test/Rollback-<apk>); everyone else to the version approved before the current one (rollback/<apk>).
 */
class RescueActivity : Activity() {

    private val appName: String get() = "Iqra Quran"
    private val apk: String? get() = "IqraQuran.apk"

    private lateinit var status: TextView
    private lateinit var goBack: Button
    private var busy = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(Color.parseColor("#1E1E2E"))
        }
        fun text(s: String, size: Float) = TextView(this).apply {
            text = s
            textSize = size
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, pad / 2)
        }
        root.addView(text("$appName closed by itself", 26f))
        root.addView(text("The new version did not start properly. Go back to the last good version? Your settings are kept.", 18f))
        status = text("", 16f).apply { setTextColor(Color.parseColor("#FFB300")) }
        goBack = Button(this).apply {
            text = "Go back to the last good version"
            setOnClickListener { goBack() }
        }
        val tryAgain = Button(this).apply {
            text = "Try again"
            setOnClickListener {
                CrashGuard.reset(this@RescueActivity)
                packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it) }
                finish()
            }
        }
        if (apkUrl() != null) root.addView(goBack)
        root.addView(tryAgain)
        root.addView(status)
        setContentView(root)
        (if (apkUrl() != null) goBack else tryAgain).requestFocus()
    }

    private fun apkUrl(): String? {
        val file = apk ?: return null
        val base = "https://github.com/NaseerBabar786/live-tv-app/releases/download/"
        return if (CrashGuard.ownerTesting(this)) base + "test/Rollback-" + file else base + "rollback/" + file
    }

    private fun goBack() {
        if (busy) return
        val url = apkUrl() ?: return
        if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
            val opened = runCatching {
                startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            }.isSuccess
            if (opened) {
                status.text = "Allow $appName to install apps, then come back and press the button again."
                return
            }
        }
        busy = true
        status.text = "Downloading the last good version…"
        Thread {
            val result = runCatching { download(url) }
            runOnUiThread {
                busy = false
                result.onSuccess { install(it) }
                    .onFailure { status.text = "Could not download it (${it.message}). Check the internet and try again." }
            }
        }.start()
    }

    private fun download(url: String): File {
        val dir = File(cacheDir, "updates").apply { mkdirs() }
        val file = File(dir, "rollback.apk")
        var current = URL(url)
        repeat(6) {
            val conn = (current.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 30_000
                instanceFollowRedirects = false
                setRequestProperty("User-Agent", "RescueActivity")
            }
            when (val code = conn.responseCode) {
                in 200..299 -> {
                    val total = conn.contentLengthLong
                    var done = 0L
                    conn.inputStream.use { input ->
                        file.outputStream().use { output ->
                            val buffer = ByteArray(64 * 1024)
                            var last = -1
                            while (true) {
                                val n = input.read(buffer)
                                if (n < 0) break
                                output.write(buffer, 0, n)
                                done += n
                                if (total > 0) {
                                    val pct = (done * 100 / total).toInt()
                                    if (pct != last) {
                                        last = pct
                                        runOnUiThread { status.text = "Downloading the last good version… $pct%" }
                                    }
                                }
                            }
                        }
                    }
                    conn.disconnect()
                    if (total > 0 && done != total) error("the download was cut off")
                    if (file.length() < 1024) error("no good version is available yet")
                    return file
                }
                in 300..399 -> {
                    val location = conn.getHeaderField("Location") ?: error("redirect without location")
                    conn.disconnect()
                    current = URL(current, location)
                }
                404 -> error("no good version is available yet")
                else -> error("HTTP $code")
            }
        }
        error("too many redirects")
    }

    private fun install(apk: File) {
        status.text = "Press Install on the next screen, then Open."
        CrashGuard.reset(this)
        runCatching {
            val uri = FileProvider.getUriForFile(this, "$packageName.updates", apk)
            startActivity(
                Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }.onFailure { status.text = "The installer could not be opened (${it.message})." }
    }
}
