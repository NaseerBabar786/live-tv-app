package com.iqraquran.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Reading themes: a tile per theme showing "بسم اللہ" in its own colours,
 * then (for Custom) background and text colour swatches, then line spacing.
 */
@Composable
fun ThemePicker(vm: AppViewModel, compact: Boolean = false) {
    val custom = Palettes.custom(vm.customBackground, vm.customText, vm.customExtra)
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (!vm.themeLocked) ThemeChoices(vm, custom, compact)
        Text(S.lineSpacing.get(), fontWeight = FontWeight.SemiBold)
        ChoiceRow {
            listOf(S.normal, S.wide, S.wider).forEachIndexed { i, label ->
                Choice(label.get(), vm.lineSpacing == i) { vm.chooseLineSpacing(i) }
            }
        }
    }
}

/** The theme tiles and, for Custom, its colour rows. */
@Composable
private fun ThemeChoices(vm: AppViewModel, custom: Palette, compact: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ChoiceRow {
            (Palettes.presets + custom).forEach { p ->
                ThemeTile(p, selected = vm.themeId == p.id, compact = compact) { vm.chooseTheme(p) }
            }
        }
        if (vm.themeId != "custom") {
            ChoiceRow { Choice(S.customizeTheme.get(), false) { vm.customizeCurrent() } }
        } else {
            val p = vm.palette
            ColourRow(S.background.get(), Palettes.backgrounds, p.background) { vm.chooseCustomColors(background = it) }
            ColourRow(S.cardColour.get(), Palettes.backgrounds, p.card) { vm.chooseCustomColor("card", it) }
            ColourRow(S.quranColour.get(), Palettes.textColors, p.arabic) { vm.chooseCustomColor("arabic", it) }
            ColourRow(S.textColour.get(), Palettes.textColors, p.text) { vm.chooseCustomColors(text = it) }
            ColourRow(S.accentColour.get(), Palettes.accents, p.accent) { vm.chooseCustomColor("accent", it) }
            ColourRow(S.highlightColour.get(), Palettes.highlights, p.highlight) { vm.chooseCustomColor("highlight", it) }
            ColourRow(S.barColour.get(), HomeTiles.swatches, p.bar) { vm.chooseCustomColor("bar", it) }
            ColourRow(S.letterCardColour.get(), Palettes.backgrounds, p.letterCard) { vm.chooseCustomColor("letterCard", it) }
            ColourRow(S.letterTextColour.get(), Palettes.textColors, p.letterText) { vm.chooseCustomColor("letterText", it) }
        }
    }
}

/** A label and a row of colour swatches, the one in use ticked. */
@Composable
private fun ColourRow(label: String, colours: List<Color>, current: Color, onPick: (Color) -> Unit) {
    Text(label, fontWeight = FontWeight.SemiBold)
    ChoiceRow {
        (listOf(current) + colours).distinct().forEach { c -> Swatch(c, current == c) { onPick(c) } }
    }
}

@Composable
private fun ThemeTile(p: Palette, selected: Boolean, compact: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = Modifier
            .focusRing(shape)
            .width(if (compact) 110.dp else 132.dp)
            .clip(shape)
            .background(p.background)
            .border(if (selected) 3.dp else 1.dp, if (selected) palette.accent else p.muted.copy(alpha = 0.5f), shape)
            .clickable(onClick = onClick)
            .padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "بِسۡمِ اللّٰهِ",
            fontFamily = QuranFont,
            fontSize = if (compact) 20.sp else 24.sp,
            color = p.arabic,
            textAlign = TextAlign.Center,
        )
        Text(
            tr(p.en, p.ur),
            fontSize = 13.sp,
            color = p.text,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            textAlign = TextAlign.Center,
            maxLines = 1,
        )
    }
}

@Composable
fun Swatch(c: Color, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .focusRing(CircleShape)
            .size(44.dp)
            .clip(CircleShape)
            .background(c)
            .border(if (selected) 3.dp else 1.dp, if (selected) palette.accent else Color.Gray, CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            Icon(
                Icons.Filled.Check,
                contentDescription = null,
                tint = if (c.luminance() < 0.4f) Color.White else Color.Black,
            )
        }
    }
}
