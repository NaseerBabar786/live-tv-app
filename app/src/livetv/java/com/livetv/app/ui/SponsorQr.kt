package com.livetv.app.ui

import android.graphics.Bitmap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter

/** QR codes for sponsors: a phone number opens the dialer, a website opens the browser. */
object SponsorQr {
    /** What the code should open for a sponsor's contact, or null when it's neither a phone number nor a website. */
    fun link(contact: String): String? {
        val c = contact.trim()
        if (c.isEmpty()) return null
        val digits = c.filter { it.isDigit() }
        if (c.all { it.isDigit() || it in " +-().".toSet() } && digits.length >= 7) {
            // North American numbers without the country code get +1.
            val number = if (c.startsWith("+")) "+$digits" else if (digits.length == 10) "+1$digits" else digits
            return "tel:$number"
        }
        if (' ' !in c && '.' in c) return if (c.startsWith("http://") || c.startsWith("https://")) c else "https://$c"
        return null
    }

    fun bitmap(contact: String): ImageBitmap? = runCatching {
        val text = link(contact) ?: return null
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, mapOf(EncodeHintType.MARGIN to 0))
        val w = matrix.width
        val h = matrix.height
        val pixels = IntArray(w * h) { if (matrix[it % w, it / w]) 0xFF000000.toInt() else 0xFFFFFFFF.toInt() }
        Bitmap.createBitmap(pixels, w, h, Bitmap.Config.ARGB_8888).asImageBitmap()
    }.getOrNull()
}
