package com.iqraquran.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** True on a TV or other wide screen, where things are laid out side by side. */
@Composable
fun isWide(): Boolean = LocalConfiguration.current.screenWidthDp >= 720

@Composable
fun TopBar(title: String, onBack: (() -> Unit)?, actions: @Composable RowScope.() -> Unit = {}) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(palette.bar)
            .statusBarsPadding()
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack, modifier = Modifier.focusRing(CircleShape)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = S.back.get(), tint = palette.onBar)
            }
        }
        Text(
            title,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 8.dp),
            style = MaterialTheme.typography.titleLarge,
            color = palette.onBar,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        actions()
    }
}

/** Quran or Qaida text: the Quran font, right to left, right aligned. */
@Composable
fun ArabicText(
    text: String,
    size: TextUnit,
    modifier: Modifier = Modifier,
    color: Color = palette.arabic,
    align: TextAlign = TextAlign.Right,
) {
    Text(
        text,
        modifier = modifier,
        fontFamily = QuranFont,
        fontSize = size,
        lineHeight = size * (1.9f + 0.35f * LocalLineSpacing.current),
        color = color,
        textAlign = align,
        style = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Rtl),
    )
}

/** A big coloured card for the home screen and lesson map. */
@Composable
fun BigTile(
    title: String,
    subtitle: String,
    color: Color,
    icon: ImageVector?,
    modifier: Modifier = Modifier,
    badge: @Composable (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .focusRing()
            .clip(TileShape)
            .background(color)
            .clickable(onClick = onClick)
            .padding(18.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (icon != null) Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp))
            Text(title, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = Color.White.copy(alpha = 0.85f), fontSize = 15.sp)
            if (badge != null) badge()
        }
    }
}

@Composable
fun Stars(count: Int, size: Int = 22) {
    Row {
        repeat(3) { i ->
            Icon(
                if (i < count) Icons.Filled.Star else Icons.Filled.StarBorder,
                contentDescription = null,
                tint = if (i < count) Gold else LocalContentColor.current.copy(alpha = 0.55f),
                modifier = Modifier.size(size.dp),
            )
        }
    }
}

/** A pill button that is highlighted when [selected]. */
@Composable
fun Choice(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        modifier = Modifier
            .focusRing(RoundedCornerShape(50))
            .clip(RoundedCornerShape(50))
            .background(if (selected) palette.accent else MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        color = if (selected) palette.onAccent else palette.text,
        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
    )
}

/** A small round button with an icon, for players and steppers. */
@Composable
fun RoundButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    color: Color = palette.accent,
    size: Int = 56,
    tint: Color = palette.onAccent,
) {
    Box(
        modifier = Modifier
            .focusRing(CircleShape)
            .size(size.dp)
            .clip(CircleShape)
            .background(color)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size((size * 0.55f).dp))
    }
}

/** A number with − and + buttons. */
@Composable
fun Stepper(label: String, value: Int, range: IntRange, suffix: String = "", onChange: (Int) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(label, modifier = Modifier.weight(1f), fontSize = 18.sp)
        StepButton("−") { if (value > range.first) onChange(value - 1) }
        Text("$value$suffix", fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 4.dp))
        StepButton("+") { if (value < range.last) onChange(value + 1) }
    }
}

@Composable
private fun StepButton(text: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .focusRing(CircleShape)
            .size(48.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, fontSize = 26.sp, color = palette.text)
    }
}
