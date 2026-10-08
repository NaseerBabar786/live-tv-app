package com.livetv.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.livetv.app.Plans

private val RowShape = RoundedCornerShape(16.dp)
private val TileShape = RoundedCornerShape(14.dp)

/**
 * Settings: one clean row for Themes & styles. It shows a small picture of the theme in use,
 * its name and the text size; OK (or a tap) opens the themes screen.
 */
@Composable
fun ThemeSection(onPick: () -> Unit) {
    val p = Themes.current
    Row(
        Modifier
            .fillMaxWidth()
            .softGlow(RowShape)
            .clip(RowShape)
            .background(p.surfaceVariant)
            .clickable(onClick = onPick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ThemeMini(p, Modifier.width(96.dp))
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text("Themes & styles", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            Text(
                "${p.name} · Text size ${Themes.sizeName}" +
                    if (Plans.has(Plans.Feature.Themes)) "" else " · Gold: try one for 1 minute",
                style = MaterialTheme.typography.bodySmall,
                color = p.onSurfaceVariant.copy(alpha = 0.75f),
            )
        }
        Text("›", fontSize = 28.sp, color = p.onSurfaceVariant.copy(alpha = 0.7f), modifier = Modifier.padding(horizontal = 8.dp))
    }
}

/**
 * The themes screen: every theme as a card with a small picture of the app in its colours,
 * and the text size at the top. OK on a card uses that theme straight away; Back closes.
 */
@Composable
fun ThemePicker(onDismiss: () -> Unit) {
    val p = Themes.current
    val phone = rememberIsPhone()
    val columns = if (phone) 2 else 5
    val firstFocus = remember { FocusRequester() }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier
                .fillMaxSize()
                .background(p.background)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = if (phone) 16.dp else 48.dp, vertical = if (phone) 16.dp else 32.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Themes & styles",
                    fontWeight = FontWeight.Bold,
                    fontSize = 26.sp,
                    color = p.onSurface,
                    modifier = Modifier.weight(1f),
                )
                if (!phone) TextSizeChoice()
                Spacer(Modifier.width(12.dp))
                Text(
                    "Done",
                    color = p.onSurface,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .softGlow(CircleShape)
                        .clip(CircleShape)
                        .background(p.surfaceVariant)
                        .clickable(onClick = onDismiss)
                        .padding(horizontal = 18.dp, vertical = 8.dp),
                )
            }
            if (phone) {
                Spacer(Modifier.height(12.dp))
                TextSizeChoice()
            }
            Spacer(Modifier.height(20.dp))
            Themes.all.chunked(columns).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    row.forEach { t ->
                        val mod = if (t === p) Modifier.focusRequester(firstFocus) else Modifier
                        ThemeCard(t, picked = t === p, modifier = mod.weight(1f))
                    }
                    repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                }
                Spacer(Modifier.height(18.dp))
            }
        }
    }
    // The remote starts on the theme in use.
    LaunchedEffect(Unit) { runCatching { firstFocus.requestFocus() } }
}

@Composable
private fun ThemeCard(t: Palette, picked: Boolean, modifier: Modifier) {
    val p = Themes.current
    Box(modifier) {
        Column(
            Modifier
                .fillMaxWidth()
                .softGlow(TileShape)
                .clip(TileShape)
                .background(p.surface)
                .border(2.dp, if (picked) p.primary else Color.Transparent, TileShape)
                // A theme on Free: a minute's try (Plans.ask), then the usual theme comes back.
                .clickable { Plans.ask("Themes", Plans.Feature.Themes); Themes.pick(t) }
                .padding(8.dp),
        ) {
            ThemeMini(t, Modifier.fillMaxWidth())
            Text(
                t.name,
                color = p.onSurface,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 4.dp, top = 8.dp, bottom = 2.dp),
            )
        }
        if (picked) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(4.dp)
                    .size(24.dp)
                    .background(p.primary, CircleShape),
                contentAlignment = Alignment.Center,
            ) { Text("✓", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
        }
    }
}

/** Normal / Large / Extra large as three joined buttons; the one in use is filled. */
@Composable
private fun TextSizeChoice() {
    val p = Themes.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("Text size", color = p.onSurfaceVariant.copy(alpha = 0.75f), modifier = Modifier.padding(end = 10.dp))
        Row(
            Modifier
                .background(p.surface, CircleShape)
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Themes.sizes.forEach { (name, _) ->
                val on = name == Themes.sizeName
                Text(
                    name,
                    color = if (on) Color.White else p.onSurfaceVariant,
                    fontWeight = if (on) FontWeight.Bold else FontWeight.Normal,
                    modifier = Modifier
                        .softGlow(CircleShape)
                        .clip(CircleShape)
                        .background(if (on) p.primary else Color.Transparent)
                        .clickable { Themes.setSize(name) }
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                )
            }
        }
    }
}

/**
 * A small picture of the app in a theme: top bar, the player with a play sign, and the channel
 * list with the picked channel in the theme's main colour.
 */
@Composable
fun ThemeMini(t: Palette, modifier: Modifier = Modifier) {
    Column(
        modifier
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(8.dp))
            .background(t.background),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .weight(0.14f)
                .background(t.surface)
                .padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.fillMaxHeight(0.45f).aspectRatio(1.6f).background(t.primary, RoundedCornerShape(2.dp)))
            Spacer(Modifier.width(5.dp))
            Box(Modifier.fillMaxHeight(0.3f).fillMaxWidth(0.35f).background(t.surfaceVariant, RoundedCornerShape(2.dp)))
        }
        Row(
            Modifier
                .fillMaxWidth()
                .weight(0.86f)
                .padding(5.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Box(
                Modifier
                    .weight(3f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(4.dp))
                    .background(Brush.linearGradient(listOf(t.homeTop, t.homeBottom, t.surfaceVariant))),
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.fillMaxHeight(0.3f).aspectRatio(0.85f).background(t.focus, PlayShape))
            }
            Column(
                Modifier
                    .weight(1.3f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(4.dp))
                    .background(t.surface)
                    .padding(3.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                repeat(5) { i ->
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .background(if (i == 1) t.primary else t.surfaceVariant, RoundedCornerShape(2.dp)),
                    )
                }
            }
        }
    }
}

private val PlayShape: Shape = GenericShape { size, _ ->
    moveTo(0f, 0f)
    lineTo(size.width, size.height / 2f)
    lineTo(0f, size.height)
    close()
}

/** Remote focus for this screen: a soft white outline and glow, growing a little (no yellow fill). */
private fun Modifier.softGlow(shape: Shape): Modifier = composed {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (focused) 1.05f else 1f, label = "softGlow")
    this
        .onFocusChanged { focused = it.hasFocus }
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .then(
            if (focused) {
                Modifier
                    .border(6.dp, Color.White.copy(alpha = 0.18f), shape)
                    .border(3.dp, Color.White, shape)
            } else {
                Modifier
            }
        )
}
