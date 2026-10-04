package com.livetv.app.ui

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color

/** One look for the whole app: the colours of every screen, Settings and the News and Home modes. */
class Palette(
    val name: String,
    val dark: Boolean,
    val primary: Color,
    val secondary: Color,
    val background: Color,
    val surface: Color,
    val surfaceVariant: Color,
    val onSurface: Color,
    val onSurfaceVariant: Color,
    /** Behind channel numbers, the selected filter and Settings buttons. */
    val accent: Color,
    /** Text and outlines on Settings. */
    val accentText: Color,
    /** The TV remote's highlight. */
    val focus: Color,
    /** News and Home modes. */
    val panel: Color,
    val line: Color,
    val muted: Color,
    val soft: Color,
    val homeTop: Color,
    val homeBottom: Color,
)

/**
 * The themes to pick from in Settings > Themes and styles, and the text size. Both are read while
 * drawing, so changing them redraws the app straight away.
 */
object Themes {
    val all = listOf(
        Palette(
            "Midnight", true,
            primary = Color(0xFFE53935), secondary = Color(0xFFFFB300),
            background = Color(0xFF121218), surface = Color(0xFF1E1E2E), surfaceVariant = Color(0xFF2A2A3C),
            onSurface = Color(0xFFE6E1E5), onSurfaceVariant = Color(0xFFCACAD8),
            accent = Color(0xFF0D1B3A), accentText = Color(0xFF9DB8F0), focus = Color(0xFFFFD600),
            panel = Color(0xFF0B1222), line = Color(0xFF1E2C4A), muted = Color(0xFF8FA6CF), soft = Color(0xFFB8C6E0),
            homeTop = Color(0xFF0B1022), homeBottom = Color(0xFF1A1F45),
        ),
        Palette(
            "Pure black", true,
            primary = Color(0xFFE53935), secondary = Color(0xFFFFB300),
            background = Color(0xFF000000), surface = Color(0xFF101010), surfaceVariant = Color(0xFF1C1C1C),
            onSurface = Color(0xFFEDEDED), onSurfaceVariant = Color(0xFFC4C4C4),
            accent = Color(0xFF161616), accentText = Color(0xFFD0D0D0), focus = Color(0xFFFFD600),
            panel = Color(0xFF050505), line = Color(0xFF262626), muted = Color(0xFF9A9A9A), soft = Color(0xFFC8C8C8),
            homeTop = Color(0xFF000000), homeBottom = Color(0xFF111111),
        ),
        Palette(
            "Emerald", true,
            primary = Color(0xFF1FA463), secondary = Color(0xFFD4AF37),
            background = Color(0xFF07140F), surface = Color(0xFF0F2A20), surfaceVariant = Color(0xFF163A2C),
            onSurface = Color(0xFFE3F2EA), onSurfaceVariant = Color(0xFFC9E5D6),
            accent = Color(0xFF0B3326), accentText = Color(0xFF8FD3B0), focus = Color(0xFFF2C94C),
            panel = Color(0xFF08201A), line = Color(0xFF1D4436), muted = Color(0xFF86B8A0), soft = Color(0xFFBFDCCB),
            homeTop = Color(0xFF05140F), homeBottom = Color(0xFF0F3326),
        ),
        Palette(
            "Royal", true,
            primary = Color(0xFF8E5CF7), secondary = Color(0xFFFFC857),
            background = Color(0xFF120B24), surface = Color(0xFF1E1436), surfaceVariant = Color(0xFF2A1D4A),
            onSurface = Color(0xFFEDE7FA), onSurfaceVariant = Color(0xFFD6CCF0),
            accent = Color(0xFF22134A), accentText = Color(0xFFB9A3F5), focus = Color(0xFFFFC857),
            panel = Color(0xFF160E2E), line = Color(0xFF33245C), muted = Color(0xFFA493CF), soft = Color(0xFFCFC3EE),
            homeTop = Color(0xFF120B24), homeBottom = Color(0xFF2B1A55),
        ),
        Palette(
            "Sunset", true,
            primary = Color(0xFFFF6B35), secondary = Color(0xFFFFB703),
            background = Color(0xFF1A0E0A), surface = Color(0xFF2C1812), surfaceVariant = Color(0xFF3D2219),
            onSurface = Color(0xFFFBE9E0), onSurfaceVariant = Color(0xFFF0D2C4),
            accent = Color(0xFF3A1A10), accentText = Color(0xFFFFB38A), focus = Color(0xFFFFB703),
            panel = Color(0xFF22120C), line = Color(0xFF4A2A1E), muted = Color(0xFFD19A82), soft = Color(0xFFF2C7B3),
            homeTop = Color(0xFF1A0E0A), homeBottom = Color(0xFF3D1A10),
        ),
        // Light screens and menus; the News, CP24 and Home modes stay dark so they read well on a TV.
        Palette(
            "Light", false,
            primary = Color(0xFFD32F2F), secondary = Color(0xFFB26A00),
            background = Color(0xFFF2F4F8), surface = Color(0xFFFFFFFF), surfaceVariant = Color(0xFFE3E7EF),
            onSurface = Color(0xFF1A1C22), onSurfaceVariant = Color(0xFF4A5263),
            accent = Color(0xFF1E3A8A), accentText = Color(0xFF1E40AF), focus = Color(0xFFFFB300),
            panel = Color(0xFF0B1222), line = Color(0xFF1E2C4A), muted = Color(0xFF8FA6CF), soft = Color(0xFFB8C6E0),
            homeTop = Color(0xFF0B1022), homeBottom = Color(0xFF1A1F45),
        ),
    )

    /** Text sizes: name to scale. */
    val sizes = listOf("Normal" to 1f, "Large" to 1.15f, "Extra large" to 1.3f)

    var current by mutableStateOf(all.first())
        private set
    var textScale by mutableFloatStateOf(1f)
        private set

    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences("theme", Context.MODE_PRIVATE)
        prefs = p
        current = all.firstOrNull { it.name == p.getString(K_THEME, null) } ?: all.first()
        textScale = sizes.firstOrNull { it.first == p.getString(K_SIZE, null) }?.second ?: 1f
    }

    fun pick(palette: Palette) {
        current = palette
        prefs?.edit()?.putString(K_THEME, palette.name)?.apply()
    }

    fun nextSize() {
        val i = sizes.indexOfFirst { it.second == textScale }
        val next = sizes[(i + 1) % sizes.size]
        textScale = next.second
        prefs?.edit()?.putString(K_SIZE, next.first)?.apply()
    }

    val sizeName get() = sizes.firstOrNull { it.second == textScale }?.first ?: sizes.first().first

    private const val K_THEME = "theme"
    private const val K_SIZE = "size"
}
