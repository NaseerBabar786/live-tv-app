package com.appbazaar.app.ui

import android.graphics.Bitmap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter

/** QR codes for links, drawn black on white. */
object Qr {
    fun bitmap(text: String): ImageBitmap? = runCatching {
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, mapOf(EncodeHintType.MARGIN to 0))
        val w = matrix.width
        val h = matrix.height
        val pixels = IntArray(w * h) { if (matrix[it % w, it / w]) 0xFF000000.toInt() else 0xFFFFFFFF.toInt() }
        Bitmap.createScaledBitmap(Bitmap.createBitmap(pixels, w, h, Bitmap.Config.ARGB_8888), w * 8, h * 8, false).asImageBitmap()
    }.getOrNull()
}
