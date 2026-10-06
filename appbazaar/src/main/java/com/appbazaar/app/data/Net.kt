package com.appbazaar.app.data

import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Plain HTTP helpers that follow redirects (GitHub sends APK downloads to another host). */
object Net {

    fun fetchText(url: String): String {
        val conn = open(url)
        return try {
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    /** Downloads [url] into [file], reporting progress from 0 to 1 when the size is known. */
    fun download(url: String, file: File, onProgress: (Float) -> Unit) {
        val conn = open(url)
        try {
            val total = conn.contentLengthLong
            conn.inputStream.use { input ->
                file.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var done = 0L
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
                                onProgress((done.toFloat() / total).coerceIn(0f, 1f))
                            }
                        }
                    }
                    if (total > 0 && done != total) {
                        error("The download was cut off. Please try again.")
                    }
                }
            }
        } finally {
            conn.disconnect()
        }
    }

    private fun open(url: String): HttpURLConnection {
        var current = URL(url)
        repeat(6) {
            val conn = (current.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 30_000
                instanceFollowRedirects = false
                useCaches = false
                setRequestProperty("User-Agent", "AppBazaar-Android")
                setRequestProperty("Cache-Control", "no-cache")
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
                    error("The server answered HTTP $code. Please try again later.")
                }
            }
        }
        error("Too many redirects.")
    }
}
