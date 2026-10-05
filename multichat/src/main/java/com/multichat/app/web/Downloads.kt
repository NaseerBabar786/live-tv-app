package com.multichat.app.web

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.widget.Toast
import java.io.File

/** Saves a photo, video or document the person downloaded from a chat into the phone's Downloads. */
object Downloads {

    fun save(context: Context, name: String, mime: String, base64: String) {
        val fileName = name.ifBlank { "MultiChat-${System.currentTimeMillis()}" }.replace(Regex("""[\\/:*?"<>|]"""), "_")
        val ok = runCatching {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(MediaStore.Downloads.MIME_TYPE, mime.ifBlank { "application/octet-stream" })
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Multi Chat")
                }
                val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: error("No Downloads folder")
                context.contentResolver.openOutputStream(uri)!!.use { it.write(bytes) }
            } else {
                @Suppress("DEPRECATION")
                val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Multi Chat")
                dir.mkdirs()
                File(dir, fileName).writeBytes(bytes)
            }
        }.isSuccess
        Toast.makeText(
            context,
            if (ok) "Saved to Downloads > Multi Chat" else "The file could not be saved.",
            Toast.LENGTH_SHORT,
        ).show()
    }
}
