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
        Palette(
            "Ocean", true,
            primary = Color(0xFF00A8C6), secondary = Color(0xFFFFD166),
            background = Color(0xFF051A24), surface = Color(0xFF0B2A38), surfaceVariant = Color(0xFF123A4C),
            onSurface = Color(0xFFE0F4FA), onSurfaceVariant = Color(0xFFC3E2EE),
            accent = Color(0xFF07303F), accentText = Color(0xFF7FD3E8), focus = Color(0xFFFFD166),
            panel = Color(0xFF06202C), line = Color(0xFF16455A), muted = Color(0xFF7FB3C7), soft = Color(0xFFB8DDEA),
            homeTop = Color(0xFF041620), homeBottom = Color(0xFF0B3648),
        ),
        Palette(
            "Crimson", true,
            primary = Color(0xFFD7263D), secondary = Color(0xFFF4A259),
            background = Color(0xFF170609), surface = Color(0xFF2A0D12), surfaceVariant = Color(0xFF3B141B),
            onSurface = Color(0xFFFBE7EA), onSurfaceVariant = Color(0xFFEFCBD1),
            accent = Color(0xFF3A0B13), accentText = Color(0xFFFF8A9A), focus = Color(0xFFFFC94A),
            panel = Color(0xFF1E080C), line = Color(0xFF4A1A22), muted = Color(0xFFC98993), soft = Color(0xFFEDC1C8),
            homeTop = Color(0xFF150508), homeBottom = Color(0xFF3A0C15),
        ),
        Palette(
            "Graphite", true,
            primary = Color(0xFF26C6DA), secondary = Color(0xFFB0BEC5),
            background = Color(0xFF15181C), surface = Color(0xFF20252B), surfaceVariant = Color(0xFF2C333B),
            onSurface = Color(0xFFE8ECEF), onSurfaceVariant = Color(0xFFC5CDD4),
            accent = Color(0xFF263038), accentText = Color(0xFF8FE3EE), focus = Color(0xFF4DD0E1),
            panel = Color(0xFF181C21), line = Color(0xFF333B44), muted = Color(0xFF94A1AD), soft = Color(0xFFC6D0D8),
            homeTop = Color(0xFF121518), homeBottom = Color(0xFF2A3038),
        ),
        Palette(
            "Black gold", true,
            primary = Color(0xFFD4AF37), secondary = Color(0xFFE53935),
            background = Color(0xFF0A0906), surface = Color(0xFF17140C), surfaceVariant = Color(0xFF242014),
            onSurface = Color(0xFFF5EFDC), onSurfaceVariant = Color(0xFFDCD2B4),
            accent = Color(0xFF221C0A), accentText = Color(0xFFE8C766), focus = Color(0xFFFFD54A),
            panel = Color(0xFF0E0C07), line = Color(0xFF3A3218), muted = Color(0xFFB5A472), soft = Color(0xFFE2D6AE),
            homeTop = Color(0xFF080705), homeBottom = Color(0xFF2A2210),
        ),
        Palette(
            "Plum", true,
            primary = Color(0xFFE0569B), secondary = Color(0xFFFFB86B),
            background = Color(0xFF1A0A17), surface = Color(0xFF2B1226), surfaceVariant = Color(0xFF3C1A35),
            onSurface = Color(0xFFFAE6F3), onSurfaceVariant = Color(0xFFEBCBE0),
            accent = Color(0xFF3A1032), accentText = Color(0xFFF59AC9), focus = Color(0xFFFFB86B),
            panel = Color(0xFF210C1D), line = Color(0xFF4A2142), muted = Color(0xFFC690B6), soft = Color(0xFFEBC4DD),
            homeTop = Color(0xFF170914), homeBottom = Color(0xFF3F1438),
        ),
    )

    /** Text sizes: name to scale. */
    val sizes = listOf("Normal" to 1f, "Large" to 1.15f, "Extra large" to 1.3f)

    /** The theme the viewer picked (kept even while their package doesn't have Themes). */
    private var chosen by mutableStateOf(all.first())

    /** Whether the viewer's package has Themes (Cable TV's Gold, 1.10.16); the first theme shows otherwise. */
    var unlocked by mutableStateOf(true)

    val current: Palette get() = if (unlocked) chosen else all.first()
    var textScale by mutableFloatStateOf(1f)
        private set

    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences("theme", Context.MODE_PRIVATE)
        prefs = p
        chosen = all.firstOrNull { it.name == p.getString(K_THEME, null) } ?: all.first()
        textScale = sizes.firstOrNull { it.first == p.getString(K_SIZE, null) }?.second ?: 1f
    }

    fun pick(palette: Palette) {
        chosen = palette
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
