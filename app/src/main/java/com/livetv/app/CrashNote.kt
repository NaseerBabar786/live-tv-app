package com.livetv.app

import android.content.Context
import java.io.File

/**
 * When the app closes because of an error, the reason is kept on the device, and the next start shows it
 * once (1.9.58), so a photo of the screen tells us what went wrong on a TV we can't test on.
 */
object CrashNote {
    private fun file(context: Context) = File(context.filesDir, "last-crash.txt")

    private var installed = false

    fun install(context: Context) {
        if (installed) return
        installed = true
        val app = context.applicationContext
        val before = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                val trace = error.stackTraceToString().lines().take(14).joinToString("\n")
                file(app).writeText("${BuildConfig.VERSION_NAME} on ${android.os.Build.MODEL}\n$trace")
            }
            before?.uncaughtException(thread, error)
        }
    }

    /** The reason the app closed last time, once; null when it didn't. */
    fun takeLast(context: Context): String? = runCatching {
        val f = file(context)
        if (!f.exists()) null else f.readText().also { f.delete() }
    }.getOrNull()
}
