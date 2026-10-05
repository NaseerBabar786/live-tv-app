package com.iqraquran.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.iqraquran.app.R

val Green = Color(0xFF0B5D45)
val GreenDark = Color(0xFF06261D)
val GreenCard = Color(0xFF0F3B2E)
val Gold = Color(0xFFF2C14E)
val Cream = Color(0xFFFFF8E7)
val FocusColor = Color(0xFFFFD54F)
val Good = Color(0xFF43A047)
val Bad = Color(0xFFE53935)
val TileShape: Shape = RoundedCornerShape(18.dp)

/** Bright colours for the kids' lesson tiles and profiles. */
val KidColors = listOf(
    Color(0xFF26A69A), Color(0xFFEF6C00), Color(0xFF7E57C2), Color(0xFF29B6F6),
    Color(0xFFEC407A), Color(0xFF9CCC65), Color(0xFFFFA726), Color(0xFF5C6BC0),
)

/** Scheherazade New (SIL Open Font License): a font made for the Quran's full set of marks. */
val QuranFont = FontFamily(Font(R.font.scheherazade))

/**
 * A reading theme: the colours of the whole app around the Quran text. Some are made to be
 * easy on the eyes for long reading (paper, sepia, soft dark, warm night); the "Custom" theme
 * takes the background and text colours the reader picks.
 */
data class Palette(
    val id: String,
    val en: String,
    val ur: String,
    val background: Color,
    val card: Color,
    val cardAlt: Color,
    /** Quran text. */
    val arabic: Color,
    /** Ordinary text. */
    val text: Color,
    /** Translations, tips and other quieter text. */
    val muted: Color,
    /** Headings, ayah numbers, selected buttons. */
    val accent: Color,
    /** Text and icons on an [accent] background. */
    val onAccent: Color,
    /** Background of the ayah being recited. */
    val highlight: Color,
    val dark: Boolean,
)

object Palettes {
    val classic = Palette(
        "classic", "Classic green", "سبز (اصل)",
        background = GreenDark, card = GreenCard, cardAlt = Color(0xFF16483A),
        arabic = Cream, text = Color.White, muted = Color(0xFFCFE3DA),
        accent = Gold, onAccent = GreenDark, highlight = Color(0xFF1F6B52), dark = true,
    )
    val paper = Palette(
        "paper", "Paper", "کاغذ",
        background = Color(0xFFF6F3EA), card = Color(0xFFFFFDF7), cardAlt = Color(0xFFE9E4D6),
        arabic = Color(0xFF222222), text = Color(0xFF2B2B2B), muted = Color(0xFF5E5A52),
        accent = Color(0xFF0B5D45), onAccent = Color.White, highlight = Color(0xFFE3F0E6), dark = false,
    )
    val sepia = Palette(
        "sepia", "Sepia", "سیپیا",
        background = Color(0xFFEFE3C8), card = Color(0xFFF7EDD5), cardAlt = Color(0xFFE2D3B2),
        arabic = Color(0xFF3E2C1C), text = Color(0xFF3E2C1C), muted = Color(0xFF6B5843),
        accent = Color(0xFF8A5A2B), onAccent = Color.White, highlight = Color(0xFFE6D2A8), dark = false,
    )
    val mushaf = Palette(
        "mushaf", "Mushaf green", "مصحف سبز",
        background = Color(0xFFE6EFE2), card = Color(0xFFF3F8F0), cardAlt = Color(0xFFD5E3CF),
        arabic = Color(0xFF14301F), text = Color(0xFF1B3325), muted = Color(0xFF4A6354),
        accent = Color(0xFF2E7D4F), onAccent = Color.White, highlight = Color(0xFFCDE5D2), dark = false,
    )
    val softDark = Palette(
        "soft_dark", "Soft dark", "ہلکا اندھیرا",
        background = Color(0xFF1E1F22), card = Color(0xFF2A2C30), cardAlt = Color(0xFF34373C),
        arabic = Color(0xFFE6E1D6), text = Color(0xFFE6E1D6), muted = Color(0xFFADA89E),
        accent = Color(0xFF8FC1B5), onAccent = Color(0xFF14201D), highlight = Color(0xFF33423E), dark = true,
    )
    val night = Palette(
        "night", "Night (warm)", "رات (گرم روشنی)",
        background = Color(0xFF0B0A09), card = Color(0xFF17130F), cardAlt = Color(0xFF241D16),
        arabic = Color(0xFFE9C79A), text = Color(0xFFD9BC94), muted = Color(0xFF9C8466),
        accent = Color(0xFFD9A55B), onAccent = Color(0xFF1A1208), highlight = Color(0xFF2E2418), dark = true,
    )
    val contrast = Palette(
        "contrast", "High contrast", "واضح (ہائی کنٹراسٹ)",
        background = Color.Black, card = Color(0xFF121212), cardAlt = Color(0xFF262626),
        arabic = Color.White, text = Color.White, muted = Color(0xFFE0E0E0),
        accent = Color(0xFFFFEB3B), onAccent = Color.Black, highlight = Color(0xFF263238), dark = true,
    )

    val sky = Palette(
        "sky", "Sky", "آسمانی",
        background = Color(0xFFE8EEF4), card = Color(0xFFF5F8FB), cardAlt = Color(0xFFD6E1EB),
        arabic = Color(0xFF16263A), text = Color(0xFF1B2A3A), muted = Color(0xFF4F6275),
        accent = Color(0xFF2F6690), onAccent = Color.White, highlight = Color(0xFFD3E4F2), dark = false,
    )
    val grey = Palette(
        "grey", "Soft grey (e-ink)", "ہلکا سرمئی",
        background = Color(0xFFE4E4E0), card = Color(0xFFEFEFEB), cardAlt = Color(0xFFD3D3CE),
        arabic = Color(0xFF1C1C1C), text = Color(0xFF1E1E1E), muted = Color(0xFF55554F),
        accent = Color(0xFF3D3D3D), onAccent = Color.White, highlight = Color(0xFFD0D0CA), dark = false,
    )
    val midnight = Palette(
        "midnight", "Midnight blue", "گہرا نیلا",
        background = Color(0xFF0F1B2D), card = Color(0xFF17263D), cardAlt = Color(0xFF203350),
        arabic = Color(0xFFF1E6C8), text = Color(0xFFDCE6F2), muted = Color(0xFF9FB1C7),
        accent = Color(0xFF7FB2E5), onAccent = Color(0xFF0B1422), highlight = Color(0xFF243A5A), dark = true,
    )

    val presets = listOf(classic, paper, sepia, mushaf, sky, grey, softDark, midnight, night, contrast)

    /** Background choices for the Custom theme. */
    val backgrounds = listOf(
        Color(0xFFFFFFFF), Color(0xFFF6F3EA), Color(0xFFEFE3C8), Color(0xFFE6EFE2), Color(0xFFE3ECF5),
        Color(0xFF2A2C30), Color(0xFF06261D), Color(0xFF14213D), Color(0xFF0B0A09), Color(0xFF000000),
    )

    /** Text colour choices for the Custom theme. */
    val textColors = listOf(
        Color(0xFF000000), Color(0xFF222222), Color(0xFF3E2C1C), Color(0xFF14301F), Color(0xFF0D2B52),
        Color(0xFFFFFFFF), Color(0xFFFFF8E7), Color(0xFFE9C79A), Color(0xFFB9F6CA), Color(0xFFFFEB3B),
    )

    /** A theme built from the reader's own background and text colours. */
    fun custom(background: Color, text: Color): Palette {
        val dark = background.luminance() < 0.4f
        val accent = if (dark) Gold else Green
        return Palette(
            "custom", "Custom", "اپنی پسند",
            background = background,
            card = lerp(background, text, 0.05f),
            cardAlt = lerp(background, text, 0.12f),
            arabic = text,
            text = text,
            muted = lerp(text, background, 0.3f),
            accent = accent,
            onAccent = if (dark) GreenDark else Color.White,
            highlight = lerp(background, accent, 0.22f),
            dark = dark,
        )
    }

    fun byId(id: String?, customBackground: Color, customText: Color): Palette =
        if (id == "custom") custom(customBackground, customText) else presets.firstOrNull { it.id == id } ?: classic
}

val LocalPalette = staticCompositionLocalOf { Palettes.classic }

/** Extra space between lines of Quran text: 0 normal, 1 wide, 2 wider. */
val LocalLineSpacing = staticCompositionLocalOf { 0 }

/** The reading theme in use. */
val palette: Palette
    @Composable
    @ReadOnlyComposable
    get() = LocalPalette.current

@Composable
fun IqraTheme(p: Palette, content: @Composable () -> Unit) {
    val scheme = if (p.dark) {
        darkColorScheme(
            primary = p.accent, onPrimary = p.onAccent, secondary = p.accent,
            background = p.background, onBackground = p.text,
            surface = p.card, onSurface = p.text,
            surfaceVariant = p.cardAlt, onSurfaceVariant = p.muted,
        )
    } else {
        lightColorScheme(
            primary = p.accent, onPrimary = p.onAccent, secondary = p.accent,
            background = p.background, onBackground = p.text,
            surface = p.card, onSurface = p.text,
            surfaceVariant = p.cardAlt, onSurfaceVariant = p.muted,
        )
    }
    CompositionLocalProvider(LocalPalette provides p) {
        MaterialTheme(colorScheme = scheme) {
            Surface(color = p.background, contentColor = p.text, content = content)
        }
    }
}

/**
 * Outline and slight zoom on whatever the TV remote is on. No effect on touch,
 * where nothing takes focus.
 */
fun Modifier.focusRing(shape: Shape = TileShape): Modifier = composed {
    var focused by remember { mutableStateOf(false) }
    // Yellow stands out on dark themes; on light ones a deep orange does.
    val ring = if (LocalPalette.current.dark) FocusColor else Color(0xFFE65100)
    val scale by animateFloatAsState(if (focused) 1.04f else 1f, label = "focusScale")
    this
        .onFocusChanged { focused = it.hasFocus }
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .then(if (focused) Modifier.border(3.dp, ring, shape) else Modifier)
}
