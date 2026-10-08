package com.livetv.app.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.livetv.app.data.Location
import com.livetv.app.data.WeatherApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale
import kotlin.math.cos
import kotlin.math.sin

// The Weather section's own colours (1.10.20): deep blue like the big weather apps, whatever the app theme.
private val SkyBottom = Color(0xFF141C48)
private val Panel = Color(0x730A122D)
private val TabOn = Color(0xFF2F5BD3)
private val Yellow = Color(0xFFFFD000)
private val Soft = Color(0xFFC9D2EE)
private val Dim = Color(0xFF97A3CC)
private val PanelShape = RoundedCornerShape(22.dp)
private val TileShape = RoundedCornerShape(16.dp)

/** See-through glass over the sky, lit a little from the top left (1.10.23). */
private fun Modifier.glass(shape: androidx.compose.ui.graphics.Shape) = this
    .background(Brush.linearGradient(listOf(Color.White.copy(alpha = 0.15f), Color.White.copy(alpha = 0.05f))), shape)
    .border(1.dp, Color.White.copy(alpha = 0.16f), shape)

private enum class Tab(val label: String) {
    Weather("☀️ Weather"),
    Hourly("🕒 Hourly"),
    Week("📅 7 Days"),
    TwoWeeks("🗓 14 Days"),
    Maps("🛰 Maps"),
    News("📰 News"),
    Video("▶ Video"),
}

/**
 * The Weather section, next to Modes, Library and Games. Since 1.10.20 it looks and works like The Weather
 * Network's app (owner's screenshots, 2026-10-08), without ads: tabs for the weather now, Hourly, 7 Days
 * (parts of the day), 14 Days, a moving rain radar, weather news with pictures and weather videos, for the
 * viewer's own place and any places they add. The remote's arrows move around and OK opens; on a phone
 * everything is tapped. Back closes a story, then goes to the first tab, then closes the section.
 */
@Composable
fun WeatherScreen(onClose: () -> Unit) {
    val locationVersion by Location.version.collectAsStateWithLifecycle()
    var mine by remember { mutableStateOf<Location.Place?>(null) }
    var added by remember { mutableStateOf(WeatherApp.places()) }
    var selected by rememberSaveable { mutableIntStateOf(WeatherApp.selected) }
    var report by remember { mutableStateOf<WeatherApp.Report?>(null) }
    var stories by remember { mutableStateOf<List<WeatherApp.Story>>(emptyList()) }
    var videos by remember { mutableStateOf<List<WeatherApp.Video>?>(null) }
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    var adding by remember { mutableStateOf(false) }
    var page by remember { mutableStateOf<Pair<String, String>?>(null) }
    var openDay by remember { mutableStateOf<String?>(null) }
    var uvReport by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<Location.Place?>(null) }
    var playing by remember { mutableStateOf<WeatherApp.Video?>(null) }
    var tabName by rememberSaveable { mutableStateOf(Tab.Weather.name) }
    val tab = Tab.valueOf(tabName)

    LaunchedEffect(locationVersion) { mine = withContext(Dispatchers.IO) { Location.current() } }
    // A place the viewer added that is where they are already shows first, as their own place, so it isn't listed twice.
    val others = added.filterNot { p -> mine?.let { WeatherApp.same(it, p) } == true }
    val places = listOfNotNull(mine) + others
    val index = selected.coerceIn(0, (places.size - 1).coerceAtLeast(0))
    val place = places.getOrNull(index)
    val mineCount = if (mine != null) 1 else 0

    LaunchedEffect(place?.latitude, place?.longitude, reload) {
        val p = place ?: return@LaunchedEffect
        loading = true
        failed = false
        val r = withContext(Dispatchers.IO) { WeatherApp.load(p, reload > 0) }
        if (r != null) report = r
        failed = r == null
        loading = false
        stories = withContext(Dispatchers.IO) { WeatherApp.stories(p) }
    }
    LaunchedEffect(tab) {
        if (tab == Tab.Video && videos == null) videos = withContext(Dispatchers.IO) { WeatherApp.videos() }
    }
    // The weather now is kept fresh while the section is open.
    LaunchedEffect(Unit) {
        while (true) {
            delay(15 * 60_000L)
            reload++
        }
    }

    // A weather video plays full screen in our locked film page; Back comes back here.
    playing?.let { v ->
        YouTubePlayer(v.id, v.title, onBack = { playing = null })
        return
    }

    fun pick(i: Int) {
        if (i == selected) return
        selected = i
        WeatherApp.selected = i
        report = null
        stories = emptyList()
    }

    BackHandler {
        when {
            page != null -> page = null
            openDay != null -> openDay = null
            uvReport -> uvReport = false
            tab != Tab.Weather -> tabName = Tab.Weather.name
            else -> onClose()
        }
    }

    val wide = LocalConfiguration.current.screenWidthDp >= 840
    val firstFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        delay(80)
        runCatching { firstFocus.requestFocus() }
    }
    val r = report?.takeIf { place != null && WeatherApp.same(it.place, place) }
    val canRemove = place != null && index >= mineCount

    CompositionLocalProvider(LocalContentColor provides Color.White) {
        Box(Modifier.fillMaxSize().background(SkyBottom)) {
            SkyBackdrop(r?.current?.code, r?.current?.day ?: true)
            Column(Modifier.fillMaxSize().safeDrawingPadding().padding(horizontal = if (wide) 24.dp else 12.dp, vertical = 10.dp)) {
                Header(
                    place = place,
                    mine = index < mineCount,
                    tab = tab,
                    wide = wide,
                    firstFocus = firstFocus,
                    onTab = { tabName = it.name },
                    onClose = onClose,
                )
                LazyRow(
                    contentPadding = PaddingValues(vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    itemsIndexed(places) { i, p ->
                        Chip((if (i < mineCount) "📍 " else "") + p.city.ifBlank { "My place" }, on = i == index) { pick(i) }
                    }
                    item { Chip("＋ Add a place", on = false) { adding = true } }
                    r?.let { rep ->
                        item { Chip(if (rep.fahrenheit) "Show °C" else "Show °F", on = false) { WeatherApp.fahrenheitChoice = !rep.fahrenheit; reload++ } }
                    }
                    item { Chip("⟳ Refresh", on = false) { reload++ } }
                    if (canRemove) item { Chip("✕ Remove place", on = false) { removing = place } }
                }
                Box(Modifier.fillMaxWidth().weight(1f)) {
                    when {
                        r == null -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                            if (place == null) Text("Finding where you are…", color = Soft)
                            if (loading || !failed) {
                                CircularProgressIndicator(color = Yellow)
                            } else {
                                Text("The weather can't be reached right now.", color = Soft)
                                if (WeatherApp.lastError.isNotBlank()) Text(WeatherApp.lastError, color = Dim, fontSize = 12.sp)
                                TextButton(onClick = { reload++ }, modifier = Modifier.focusGlow()) { Text("Try again", color = Yellow) }
                            }
                        }
                        tab == Tab.Weather -> HomeTab(
                            r, stories, wide,
                            onTab = { tabName = it.name },
                            onStory = { page = it.title to it.link },
                            onUv = { uvReport = true },
                        )
                        tab == Tab.Hourly -> HourlyTab(r)
                        tab == Tab.Week -> WeekTab(r, wide) { openDay = it }
                        tab == Tab.TwoWeeks -> TwoWeeksTab(r, wide) { openDay = it }
                        tab == Tab.Maps -> MapsTab(r, wide) { page = "Weather map · ${r.place.city}" to WeatherApp.radarUrl(r.place, r.fahrenheit) }
                        tab == Tab.News -> NewsTab(stories, wide) { page = it.title to it.link }
                        tab == Tab.Video -> VideoTab(videos, wide) { playing = it }
                    }
                    if (loading && r != null) {
                        CircularProgressIndicator(Modifier.align(Alignment.TopEnd).padding(8.dp).size(22.dp), color = Yellow, strokeWidth = 2.dp)
                    }
                }
                Text(
                    "Weather: Open-Meteo.com · Radar: RainViewer · " +
                        (if (r?.place?.country == "US") "Warnings: US National Weather Service · " else "") +
                        "News: Bing News, Google News · No ads",
                    fontSize = 10.sp,
                    color = Dim,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }

    if (adding) {
        AddPlaceDialog(
            onDismiss = { adding = false },
            onPick = { p ->
                adding = false
                val own = mine
                if (own != null && WeatherApp.same(own, p)) {
                    // Already there, as the viewer's own place.
                    pick(0)
                } else {
                    WeatherApp.addPlace(p)
                    added = WeatherApp.places()
                    pick(mineCount + added.filterNot { a -> own?.let { WeatherApp.same(it, a) } == true }.indexOfFirst { WeatherApp.same(it, p) })
                }
            },
        )
    }
    removing?.let { p ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text("Remove ${p.city}?") },
            text = { Text("It comes off your list of places. You can add it again any time.") },
            confirmButton = {
                TextButton(onClick = {
                    WeatherApp.removePlace(p)
                    added = WeatherApp.places()
                    removing = null
                    pick(0)
                }, modifier = Modifier.focusGlow()) { Text("Remove") }
            },
            dismissButton = { TextButton(onClick = { removing = null }, modifier = Modifier.focusGlow()) { Text("Keep it") } },
        )
    }
    if (r != null) {
        openDay?.let { DayDialog(r, it, onDismiss = { openDay = null }) }
        if (uvReport) UvDialog(r, onDismiss = { uvReport = false })
    }
    page?.let { (title, url) -> WebPage(url, title, onClose = { page = null }) }
}

@Composable
private fun Header(
    place: Location.Place?,
    mine: Boolean,
    tab: Tab,
    wide: Boolean,
    firstFocus: FocusRequester,
    onTab: (Tab) -> Unit,
    onClose: () -> Unit,
) {
    val tabs = @Composable {
        Row(
            Modifier.background(Panel, PillShape).padding(5.dp).horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Tab.entries.forEach { t ->
                val on = t == tab
                Text(
                    t.label,
                    fontWeight = FontWeight.Bold,
                    fontSize = if (wide) 15.sp else 14.sp,
                    color = if (on) Color.White else Soft,
                    maxLines = 1,
                    modifier = Modifier
                        .then(if (on) Modifier.focusRequester(firstFocus) else Modifier)
                        .focusGlow(PillShape)
                        .background(if (on) TabOn else Color.Transparent, PillShape)
                        .clickable { onTab(t) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
        }
    }
    val title = @Composable {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose, modifier = Modifier.focusGlow()) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back to channels", tint = Color.White)
            }
            Row(
                Modifier.background(Panel, PillShape).padding(horizontal = 18.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(place?.city?.ifBlank { null } ?: "Weather", fontSize = 22.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val sub = if (mine) "📍 where you are" else place?.region.orEmpty()
                if (sub.isNotBlank()) Text("  $sub", fontSize = 13.sp, color = Soft, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
    if (wide) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { title() }
            tabs()
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            title()
            tabs()
        }
    }
}

@Composable
private fun Chip(label: String, on: Boolean, onClick: () -> Unit) {
    Text(
        label,
        fontWeight = FontWeight.Bold,
        fontSize = 14.sp,
        color = if (on) SkyBottom else Color.White,
        maxLines = 1,
        modifier = Modifier
            .focusGlow(PillShape)
            .background(if (on) Color.White else Panel, PillShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 7.dp),
    )
}

@Composable
private fun PanelBox(modifier: Modifier = Modifier, title: String? = null, more: (() -> Unit)? = null, content: @Composable () -> Unit) {
    Column(modifier.glass(PanelShape).padding(16.dp)) {
        if (title != null) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 10.dp)) {
                Text(title, fontSize = 19.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                if (more != null) {
                    Text(
                        "Show more ›",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Soft,
                        modifier = Modifier.focusGlow(PillShape).clickable(onClick = more).padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
        }
        content()
    }
}

// ---------------------------------------------------------------- Weather (home)

@Composable
private fun HomeTab(
    r: WeatherApp.Report,
    stories: List<WeatherApp.Story>,
    wide: Boolean,
    onTab: (Tab) -> Unit,
    onStory: (WeatherApp.Story) -> Unit,
    onUv: () -> Unit,
) {
    val alerts = r.alerts + r.headsUp()
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            if (wide) {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(Modifier.fillMaxWidth().height(290.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Hero(r, Modifier.weight(1f).fillMaxHeight()) { onTab(Tab.Hourly) }
                        PanelBox(Modifier.weight(1.4f).fillMaxHeight(), "Next 24 Hours", more = { onTab(Tab.Hourly) }) {
                            TempGraph(r.hoursFromNow(24), Modifier.fillMaxSize())
                        }
                    }
                    Row(Modifier.fillMaxWidth().height(270.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        PanelBox(Modifier.weight(1f).fillMaxHeight(), "7 Days", more = { onTab(Tab.Week) }) { WeekBars(r) }
                        PanelBox(Modifier.weight(1f).fillMaxHeight(), "Radar Map", more = { onTab(Tab.Maps) }) {
                            Radar(r.place, mini = true, modifier = Modifier.fillMaxSize().clip(TileShape))
                        }
                        PanelBox(Modifier.weight(1f).fillMaxHeight(), "Monthly", more = { onTab(Tab.TwoWeeks) }) { Month(r) }
                    }
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    NowPanel(r, Modifier.fillMaxWidth()) { onTab(Tab.Hourly) }
                    PanelBox(Modifier.fillMaxWidth().height(260.dp), "Radar Map", more = { onTab(Tab.Maps) }) {
                        Radar(r.place, mini = true, modifier = Modifier.fillMaxSize().clip(TileShape))
                    }
                    PanelBox(Modifier.fillMaxWidth(), "Monthly", more = { onTab(Tab.TwoWeeks) }) { Month(r) }
                }
            }
        }
        if (alerts.isNotEmpty()) items(alerts) { AlertRow(it) }
        item {
            PanelBox(Modifier.fillMaxWidth(), "Short Term", more = { onTab(Tab.Week) }) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(r.partsFromNow(5)) { PartCard(it, r) }
                }
            }
        }
        if (!wide) item {
            PanelBox(Modifier.fillMaxWidth(), "Hourly", more = { onTab(Tab.Hourly) }) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(r.hoursFromNow(24)) { HourChip(it, r) }
                }
            }
        }
        item { Observations(r, wide) }
        item { Outdoor(r, wide, onUv) }
        if (stories.isNotEmpty()) {
            item {
                PanelBox(Modifier.fillMaxWidth(), "Weather News", more = { onTab(Tab.News) }) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        stories.take(if (wide) 4 else 2).forEach { s -> NewsCard(s, Modifier.weight(1f)) { onStory(s) } }
                    }
                }
            }
        }
    }
}

/** Today's weather straight on the sky, big and thin like the phone weather apps (1.10.23). */
@Composable
private fun Hero(r: WeatherApp.Report, modifier: Modifier, onNowcast: () -> Unit) {
    val c = r.current
    val today = r.today
    Column(modifier.padding(horizontal = 6.dp, vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${c.temperature}°", fontSize = 104.sp, fontWeight = FontWeight.ExtraLight, lineHeight = 104.sp)
            Spacer(Modifier.width(8.dp))
            WeatherIcon(c.code, c.day, 112.dp)
        }
        Text(c.sky, fontSize = 22.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            "Feels like ${c.feelsLike}°" + (today?.let { " · H ${it.high}° · L ${it.low}°" } ?: ""),
            fontSize = 15.sp, color = Soft, maxLines = 1,
        )
        Spacer(Modifier.weight(1f))
        r.nowcast()?.let { line ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .focusGlow(PillShape)
                    .glass(PillShape)
                    .clickable(onClick = onNowcast)
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(if (line.startsWith("No ")) "🌂" else "☂️", fontSize = 15.sp)
                Text("  $line", fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("›", fontSize = 18.sp, color = Soft)
            }
        }
        Text("👕 ${r.tip()}", fontSize = 13.sp, color = Soft, modifier = Modifier.padding(top = 6.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("Updated ${WeatherApp.clock(r.now)} local time", fontSize = 11.sp, color = Dim, modifier = Modifier.padding(top = 2.dp))
    }
}

/** The week as colour bars from each day's low to high, on the week's whole range. */
@Composable
private fun WeekBars(r: WeatherApp.Report) {
    val days = r.days.take(7)
    if (days.isEmpty()) return
    val today = r.now.take(10)
    val low = days.minOf { it.low }
    val high = days.maxOf { it.high }
    val span = (high - low).coerceAtLeast(1).toFloat()
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.SpaceBetween) {
        days.forEach { d ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (d.date == today) "Today" else WeatherApp.dayName(d.date, "").take(3), fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(52.dp), maxLines = 1)
                WeatherIcon(d.code, true, 22.dp)
                Text("${d.low}°", fontSize = 13.sp, color = Soft, modifier = Modifier.width(36.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
                Canvas(Modifier.weight(1f).height(8.dp).padding(horizontal = 8.dp)) {
                    val h = size.height
                    drawRoundRect(Color.White.copy(alpha = 0.14f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(h / 2))
                    val from = (d.low - low) / span * size.width
                    val to = ((d.high - low) / span * size.width).coerceAtLeast(from + h)
                    drawRoundRect(
                        Brush.horizontalGradient(listOf(Color(0xFF5BC0FF), Color(0xFFFFD23F), Color(0xFFFF8A3D)), 0f, size.width),
                        Offset(from, 0f), Size(to - from, h), androidx.compose.ui.geometry.CornerRadius(h / 2),
                    )
                }
                Text("${d.high}°", fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(34.dp))
            }
        }
    }
}

@Composable
private fun NowPanel(r: WeatherApp.Report, modifier: Modifier, onNowcast: () -> Unit) {
    val c = r.current
    val today = r.today
    Column(modifier.glass(PanelShape).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            WeatherIcon(c.code, c.day, 64.dp)
            Spacer(Modifier.width(10.dp))
            Text("${c.temperature}", fontSize = 76.sp, fontWeight = FontWeight.Light)
            Text("°${r.unit}", fontSize = 26.sp, modifier = Modifier.align(Alignment.Top).padding(top = 14.dp))
            Spacer(Modifier.width(14.dp))
            Column {
                Text(c.sky, fontSize = 19.sp, fontWeight = FontWeight.Bold, maxLines = 2)
                Text("Feels ${c.feelsLike}", fontSize = 15.sp, color = Soft)
                today?.let { Text("H ${it.high}° · L ${it.low}°", fontSize = 15.sp, color = Soft, maxLines = 1) }
            }
        }
        r.nowcast()?.let { line ->
            Row(
                Modifier
                    .padding(top = 8.dp)
                    .fillMaxWidth()
                    .focusGlow(TileShape)
                    .glass(TileShape)
                    .clickable(onClick = onNowcast)
                    .padding(horizontal = 12.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(if (line.startsWith("No ")) "🌂" else "☂️", fontSize = 16.sp)
                Text("  $line", fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("›", fontSize = 18.sp, color = Soft)
            }
        }
        Text("👕 ${r.tip()}", fontSize = 13.sp, color = Soft, modifier = Modifier.padding(top = 8.dp), maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text("Updated ${WeatherApp.clock(r.now)} local time", fontSize = 11.sp, color = Dim, modifier = Modifier.padding(top = 4.dp))
    }
}

/** The weeks around today: what each past day reached (white) and the forecast highs (yellow). */
@Composable
private fun Month(r: WeatherApp.Report) {
    val today = r.now.take(10)
    val days = r.calendar
    val todayAt = days.indexOfFirst { it.date == today }.takeIf { it >= 0 } ?: return
    // Weeks start on Sunday: from the Sunday of last week, three weeks.
    val weekday = WeatherApp.weekday(today)
    val start = (todayAt - weekday - 7).coerceAtLeast(0)
    val shown = days.drop(start).take(21)
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row {
            listOf("S", "M", "T", "W", "T", "F", "S").forEach {
                Text(it, fontSize = 12.sp, color = Dim, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        }
        // Blanks before the first day when the data starts mid-week.
        val lead = (WeatherApp.weekday(shown.first().date))
        val cells: List<WeatherApp.Day?> = List(lead) { null } + shown
        cells.chunked(7).forEach { week ->
            Row {
                week.forEach { d ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        if (d != null) {
                            val isToday = d.date == today
                            Text(
                                d.date.takeLast(2).trimStart('0'),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isToday) SkyBottom else Dim,
                                modifier = if (isToday) Modifier.background(Yellow, CircleShape).padding(horizontal = 5.dp) else Modifier,
                            )
                            Text("${d.high}°", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = if (d.date < today) Color.White else Yellow)
                        }
                    }
                }
                repeat(7 - week.size) { Spacer(Modifier.weight(1f)) }
            }
        }
        Text("White: what it reached · Yellow: forecast high", fontSize = 10.sp, color = Dim, modifier = Modifier.padding(top = 2.dp))
    }
}

@Composable
private fun AlertRow(a: WeatherApp.Alert) {
    val color = if (a.severe) Color(0xFFB71C1C) else Color(0xFF8D6E00)
    Column(
        Modifier
            .fillMaxWidth()
            .focusGlow(TileShape)
            .background(color.copy(alpha = 0.55f), TileShape)
            .clickable { }
            .padding(12.dp),
    ) {
        Text((if (a.severe) "🔴 " else "🟡 ") + a.title, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        if (a.text.isNotBlank()) Text(a.text, fontSize = 14.sp, color = Color.White.copy(alpha = 0.9f), maxLines = 4, overflow = TextOverflow.Ellipsis)
        Text(a.source, fontSize = 11.sp, color = Color.White.copy(alpha = 0.65f))
    }
}

@Composable
private fun PartCard(p: WeatherApp.Part, r: WeatherApp.Report) {
    val today = r.now.take(10)
    Column(
        Modifier
            .width(150.dp)
            .focusGlow(TileShape)
            .glass(TileShape)
            .clickable { }
            .padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(p.name, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Text(WeatherApp.dayName(p.date, today), fontSize = 12.sp, color = Dim)
        WeatherIcon(p.code, p.day, 44.dp, Modifier.padding(vertical = 2.dp))
        Text("${p.temperature}°", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Text("Feels ${p.feelsLike}", fontSize = 12.sp, color = Soft)
        Text(p.sky, fontSize = 13.sp, color = Soft, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("☔ ${p.rain}%", fontSize = 13.sp, color = Yellow)
    }
}

@Composable
private fun HourChip(h: WeatherApp.Hour, r: WeatherApp.Report) {
    val isNow = h.time.take(13) == r.now.take(13)
    Column(
        Modifier
            .width(76.dp)
            .focusGlow(TileShape)
            .then(if (isNow) Modifier.background(TabOn, TileShape) else Modifier.glass(TileShape))
            .clickable { }
            .padding(vertical = 10.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(if (isNow) "Now" else h.label, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        WeatherIcon(h.code, h.day, 34.dp)
        Text("${h.temperature}°", fontSize = 19.sp, fontWeight = FontWeight.Bold)
        Text("☔ ${h.rain}%", fontSize = 11.sp, color = Yellow)
    }
}

// ---------------------------------------------------------------- Today's observations

@Composable
private fun Observations(r: WeatherApp.Report, wide: Boolean) {
    val c = r.current
    val tiles = buildList<@Composable (Modifier) -> Unit> {
        add { m ->
            val (value, unit) = r.pressureText()
            val trend = r.pressureTrend()
            ObsTile(m, "Pressure", value, unit + when (trend) { "Rising" -> " ↑"; "Falling" -> " ↓"; else -> "" }, trend) {
                Gauge(((if (c.pressureHpa > 0) c.pressureHpa else c.pressure.toDouble()) - 970) / 80.0)
            }
        }
        add { m ->
            val feel = when {
                c.humidity >= 70 -> "Humid"
                c.humidity >= 35 -> "Comfortable"
                else -> "Dry"
            }
            ObsTile(m, "Humidity", "${c.humidity}", "%", "$feel · dew point ${c.dewPoint}°") {
                Ring(c.humidity / 100f, listOf(Color(0xFF4FC3F7), Color(0xFF7C8CFF)), 76.dp) { Drop(c.humidity / 100f, 22.dp) }
            }
        }
        c.visibility?.let { v ->
            add { m ->
                val words = when {
                    v >= 10 -> "Clear view"
                    v >= 4 -> "A little hazy"
                    v >= 1 -> "Poor"
                    else -> "Very poor (fog)"
                }
                ObsTile(m, "Visibility", "$v", r.distance, words) { Eye((v / 25f).coerceIn(0.1f, 1f)) }
            }
        }
        add { m ->
            val (value, unit) = r.cloudCeiling()
            ObsTile(m, "Cloud ceiling", value, unit, "${c.clouds}% cloud cover · estimated") {
                Ceiling(if (unit.isEmpty()) 1f else ((value.toIntOrNull() ?: 0) / (if (r.fahrenheit) 10000f else 3000f)).coerceIn(0.1f, 1f))
            }
        }
        add { m ->
            ObsTile(m, "Wind", "${c.wind}", r.speed, "From ${c.windFrom}" + if (c.gusts > c.wind) " · gusts ${c.gusts} ${r.speed}" else "") {
                Compass(c.windDegrees)
            }
        }
        r.today?.let { d ->
            add { m ->
                ObsTile(m, "Sunrise · Sunset", WeatherApp.clock(d.sunrise).removeSuffix(" AM").removeSuffix(" PM"), "",
                    "Sunset ${WeatherApp.clock(d.sunset)}") { SunArc(r.now, d.sunrise, d.sunset) }
            }
        }
        r.yesterday?.let { y ->
            add { m -> YesterdayTile(m, y) }
        }
    }
    PanelBox(Modifier.fillMaxWidth(), "Today's Observations") {
        val perRow = if (wide) 4 else 2
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            tiles.chunked(perRow).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { it(Modifier.weight(1f)) }
                    repeat(perRow - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun ObsTile(modifier: Modifier, name: String, value: String, unit: String, note: String, picture: @Composable () -> Unit) {
    Column(
        modifier
            .height(190.dp)
            .focusGlow(TileShape)
            .glass(TileShape)
            .clickable { }
            .padding(12.dp),
    ) {
        Text(name, fontSize = 14.sp, color = Soft, fontWeight = FontWeight.Bold)
        Row(verticalAlignment = Alignment.Bottom) {
            Text(value, fontSize = 28.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            if (unit.isNotEmpty()) Text(" $unit", fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 4.dp))
        }
        Box(Modifier.fillMaxWidth().weight(1f).padding(vertical = 4.dp), contentAlignment = Alignment.Center) { picture() }
        Text(note, fontSize = 11.sp, color = Dim, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun YesterdayTile(modifier: Modifier, y: WeatherApp.Day) {
    Column(
        modifier
            .height(190.dp)
            .focusGlow(TileShape)
            .glass(TileShape)
            .clickable { }
            .padding(12.dp),
    ) {
        Text("Yesterday", fontSize = 14.sp, color = Soft, fontWeight = FontWeight.Bold)
        Text("${WeatherApp.dayName(y.date, "")}, ${WeatherApp.shortDate(y.date)}", fontSize = 13.sp, color = Dim)
        Spacer(Modifier.weight(1f))
        Row(verticalAlignment = Alignment.Bottom) {
            Text("H ", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color(0xFF9DB4FF))
            Text("${y.high}°", fontSize = 34.sp, fontWeight = FontWeight.Bold)
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Text("L ", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color(0xFF9DB4FF))
            Text("${y.low}°", fontSize = 34.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.weight(1f))
        Text(y.sky, fontSize = 11.sp, color = Dim, maxLines = 1)
    }
}

/** A half-round dial for the air pressure, low (left) to high (right). */
@Composable
private fun Gauge(fraction: Double) {
    Canvas(Modifier.size(110.dp, 64.dp)) {
        val stroke = 12.dp.toPx()
        val box = Size(size.width - stroke, (size.width - stroke))
        val topLeft = Offset(stroke / 2, stroke / 2)
        val colors = listOf(Color(0xFF8BC34A), Color(0xFFFFC107), Color(0xFFFF7043))
        colors.forEachIndexed { i, col ->
            drawArc(col, 180f + i * 60f, 59f, false, topLeft, box, style = Stroke(stroke))
        }
        val angle = Math.toRadians(180.0 + 180.0 * fraction.coerceIn(0.0, 1.0))
        val center = Offset(size.width / 2, topLeft.y + box.height / 2)
        val len = box.width / 2 - stroke
        drawLine(Color(0xFFE53935), center, Offset(center.x + (len * cos(angle)).toFloat(), center.y + (len * sin(angle)).toFloat()), 4.dp.toPx(), StrokeCap.Round)
        drawCircle(Yellow, 7.dp.toPx(), center)
    }
}

/** A raindrop filled up to the humidity. */
@Composable
private fun Drop(fraction: Float, width: Dp = 52.dp) {
    Canvas(Modifier.size(width, width * 1.35f)) {
        val w = size.width
        val h = size.height
        val path = Path().apply {
            moveTo(w / 2, 0f)
            cubicTo(w * 0.95f, h * 0.45f, w, h * 0.62f, w, h * 0.68f)
            cubicTo(w, h * 0.9f, w * 0.78f, h, w / 2, h)
            cubicTo(w * 0.22f, h, 0f, h * 0.9f, 0f, h * 0.68f)
            cubicTo(0f, h * 0.62f, w * 0.05f, h * 0.45f, w / 2, 0f)
            close()
        }
        drawPath(path, Color(0x334FC3F7))
        drawPath(path, Color(0xFF4FC3F7), style = Stroke(2.dp.toPx()))
        val top = h * (1 - fraction.coerceIn(0f, 1f))
        clipRectHeight(top) { drawPath(path, Color(0xFF4FC3F7)) }
    }
}

private inline fun androidx.compose.ui.graphics.drawscope.DrawScope.clipRectHeight(top: Float, block: androidx.compose.ui.graphics.drawscope.DrawScope.() -> Unit) {
    drawContext.canvas.save()
    drawContext.canvas.clipRect(0f, top, size.width, size.height)
    block()
    drawContext.canvas.restore()
}

/** An eye looking down a beam as long as the view is far. */
@Composable
private fun Eye(fraction: Float) {
    Canvas(Modifier.size(150.dp, 56.dp)) {
        val cy = size.height / 2
        val eyeW = 48.dp.toPx()
        val beamEnd = eyeW + (size.width - eyeW) * fraction
        drawPath(Path().apply {
            moveTo(eyeW * 0.8f, cy)
            lineTo(beamEnd, cy - size.height / 2 * fraction.coerceAtLeast(0.4f))
            lineTo(beamEnd, cy + size.height / 2 * fraction.coerceAtLeast(0.4f))
            close()
        }, Brush.horizontalGradient(listOf(Color(0xFF3F6FE0), Color(0x553F6FE0)), startX = eyeW, endX = beamEnd))
        drawOval(Color.White, Offset(0f, cy - 13.dp.toPx()), Size(eyeW, 26.dp.toPx()))
        drawCircle(Color(0xFF2F5BD3), 9.dp.toPx(), Offset(eyeW / 2, cy))
        drawCircle(SkyBottom, 4.dp.toPx(), Offset(eyeW / 2, cy))
    }
}

/** The ground, and a cloud as high up as the cloud ceiling. */
@Composable
private fun Ceiling(fraction: Float) {
    Canvas(Modifier.size(120.dp, 76.dp)) {
        val ground = size.height - 14.dp.toPx()
        drawArc(Color(0xFF2F6BFF), 180f, 180f, true, Offset(size.width * 0.1f, ground), Size(size.width * 0.8f, 28.dp.toPx()))
        drawArc(Color(0xFF6BCB5B), 200f, 40f, true, Offset(size.width * 0.1f, ground), Size(size.width * 0.8f, 28.dp.toPx()))
        drawArc(Color(0xFF6BCB5B), 290f, 40f, true, Offset(size.width * 0.1f, ground), Size(size.width * 0.8f, 28.dp.toPx()))
        val cloudY = ground - (ground - 12.dp.toPx()) * fraction
        drawLine(Color.White, Offset(size.width / 2, ground), Offset(size.width / 2, cloudY), 2.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
        drawOval(Color.White, Offset(size.width / 2 - 18.dp.toPx(), cloudY - 8.dp.toPx()), Size(36.dp.toPx(), 16.dp.toPx()))
    }
}

/** A compass with the arrow pointing where the wind blows to. */
@Composable
private fun Compass(fromDegrees: Int) {
    Box(Modifier.size(84.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(Color.White.copy(alpha = 0.35f), size.minDimension / 2 - 2.dp.toPx(), style = Stroke(2.dp.toPx()))
            rotate(fromDegrees + 180f) {
                val c = center
                val len = size.minDimension / 2 - 12.dp.toPx()
                drawLine(Yellow, Offset(c.x, c.y + len), Offset(c.x, c.y - len), 4.dp.toPx(), StrokeCap.Round)
                drawPath(Path().apply {
                    moveTo(c.x, c.y - len - 4.dp.toPx())
                    lineTo(c.x - 8.dp.toPx(), c.y - len + 8.dp.toPx())
                    lineTo(c.x + 8.dp.toPx(), c.y - len + 8.dp.toPx())
                    close()
                }, Yellow)
            }
        }
        Text("N", fontSize = 10.sp, color = Soft, modifier = Modifier.align(Alignment.TopCenter))
        Text("S", fontSize = 10.sp, color = Soft, modifier = Modifier.align(Alignment.BottomCenter))
        Text("W", fontSize = 10.sp, color = Soft, modifier = Modifier.align(Alignment.CenterStart).padding(start = 2.dp))
        Text("E", fontSize = 10.sp, color = Soft, modifier = Modifier.align(Alignment.CenterEnd).padding(end = 2.dp))
    }
}

/** The sun's path from sunrise to sunset, with the sun where it is now. */
@Composable
private fun SunArc(now: String, sunrise: String, sunset: String) {
    fun minutes(t: String) = if (t.length >= 16) t.substring(11, 13).toInt() * 60 + t.substring(14, 16).toInt() else -1
    val n = minutes(now)
    val up = minutes(sunrise)
    val down = minutes(sunset)
    val fraction = if (up < 0 || down <= up) -1f else ((n - up).toFloat() / (down - up))
    SunPath(fraction, Modifier.size(150.dp, 70.dp))
}

// ---------------------------------------------------------------- Outdoor

@Composable
private fun Outdoor(r: WeatherApp.Report, wide: Boolean, onUv: () -> Unit) {
    val uv = r.today?.uv ?: r.current.uv
    val tiles = buildList<@Composable (Modifier) -> Unit> {
        add { m -> OutdoorTile(m, "🔆 UV index", "$uv · ${WeatherApp.uvLabel(uv)}", "OK for today's UV report", onUv) { UvScale(uv, Modifier.fillMaxWidth().height(18.dp)) } }
        r.airQuality?.let { a ->
            add { m ->
                OutdoorTile(m, "🫁 Air quality", "${WeatherApp.airLabel(a)} · $a", "US air quality index", {}) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
                        Ring(a / 200f, listOf(Color(0xFF7BD389), Color(0xFFFFE14D), Color(0xFFFF7043)), 44.dp) {
                            Text("$a", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
        r.pollen?.let { p -> add { m -> OutdoorTile(m, "🌸 Pollen", WeatherApp.pollenLabel(p), "$p grains/m³ at most", {}) } }
        r.today?.let { d ->
            add { m -> OutdoorTile(m, "🌧 Rain today", if (d.rainAmount > 0) amountText(d.rainAmount, r.fahrenheit) else "None", "Chance ${d.rain}%", {}) }
        }
    }
    PanelBox(Modifier.fillMaxWidth(), "Outdoor") {
        val perRow = if (wide) 4 else 2
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            tiles.chunked(perRow).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { it(Modifier.weight(1f)) }
                    repeat(perRow - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

private fun amountText(v: Double, fahrenheit: Boolean) =
    if (fahrenheit) "%.2f in".format(Locale.US, v) else if (v < 1) "Under 1 mm" else "${v.toInt()} mm"

@Composable
private fun OutdoorTile(modifier: Modifier, name: String, value: String, note: String, onClick: () -> Unit, picture: (@Composable () -> Unit)? = null) {
    Column(
        modifier
            .focusGlow(TileShape)
            .glass(TileShape)
            .clickable(onClick = onClick)
            .padding(12.dp),
    ) {
        Text(name, fontSize = 14.sp, color = Soft, fontWeight = FontWeight.Bold)
        Text(value, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        picture?.let { Box(Modifier.padding(vertical = 6.dp)) { it() } }
        Text(note, fontSize = 11.sp, color = Dim, maxLines = 1)
    }
}

@Composable
private fun UvDialog(r: WeatherApp.Report, onDismiss: () -> Unit) {
    val hours = r.uvHours()
    WeatherDialog("🔆 UV report · today", onDismiss) {
        val top = r.today?.uv ?: 0
        Text(
            "Highest today: $top (${WeatherApp.uvLabel(top)}). " + when {
                top >= 8 -> "Stay in the shade at midday, wear a hat, sunglasses and sunscreen."
                top >= 3 -> "Use sunscreen and sunglasses if you're out for long around midday."
                else -> "Little risk from the sun today."
            },
            color = Soft,
            fontSize = 14.sp,
        )
        if (hours.isEmpty()) {
            Text("No sun strong enough to measure today.", color = Dim)
        } else {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(hours) { h ->
                    Column(
                        Modifier.width(70.dp).focusGlow(TileShape).glass(TileShape).clickable { }.padding(8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(h.label, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Box(Modifier.padding(vertical = 6.dp).width(16.dp).height(70.dp).background(Color.White.copy(alpha = 0.15f), RoundedCornerShape(4.dp))) {
                            Box(
                                Modifier.align(Alignment.BottomCenter).fillMaxWidth().fillMaxHeight((h.uv / 11f).coerceIn(0.05f, 1f))
                                    .background(uvColor(h.uv), RoundedCornerShape(4.dp)),
                            )
                        }
                        Text("${h.uv}", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                        Text(WeatherApp.uvLabel(h.uv), fontSize = 10.sp, color = Dim, maxLines = 1)
                    }
                }
            }
        }
    }
}

private fun uvColor(uv: Int) = when {
    uv <= 2 -> Color(0xFF8BC34A)
    uv <= 5 -> Color(0xFFFFEB3B)
    uv <= 7 -> Color(0xFFFF9800)
    uv <= 10 -> Color(0xFFF44336)
    else -> Color(0xFF9C27B0)
}

// ---------------------------------------------------------------- Hourly, 7 Days, 14 Days

@Composable
private fun HourlyTab(r: WeatherApp.Report) {
    val hours = r.hoursFromNow(48)
    val today = r.now.take(10)
    LazyColumn(
        Modifier.fillMaxSize().glass(PanelShape),
        contentPadding = PaddingValues(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        hours.groupBy { it.date }.forEach { (date, list) ->
            item {
                Text(
                    "${WeatherApp.dayName(date, today)}, ${WeatherApp.shortDate(date)}",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.fillMaxWidth().background(SkyBottom, TileShape).padding(horizontal = 14.dp, vertical = 6.dp),
                )
            }
            items(list) { h ->
                val isNow = h.time.take(13) == r.now.take(13)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .focusGlow(TileShape)
                        .then(if (isNow) Modifier.background(TabOn.copy(alpha = 0.6f), TileShape) else Modifier.glass(TileShape))
                        .clickable { }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(if (isNow) "Now" else h.label, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(80.dp))
                    WeatherIcon(h.code, h.day, 34.dp, Modifier.padding(end = 14.dp))
                    Text("${h.temperature}°", fontSize = 24.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(70.dp))
                    Text(WeatherApp.describe(h.code), fontSize = 14.sp, color = Soft, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text("Feels like ${h.feelsLike}", fontSize = 14.sp, color = Soft, modifier = Modifier.width(110.dp))
                    Text("☔ ${h.rain}%", fontSize = 14.sp, color = Yellow, modifier = Modifier.width(70.dp))
                    Text("💨 ${h.wind} ${r.speed}", fontSize = 14.sp, color = Soft, maxLines = 1, modifier = Modifier.width(100.dp))
                }
            }
        }
    }
}

/** 7 Days: each day in its parts (Morning, Noon, Afternoon, Evening, Night), OK for its hours. */
@Composable
private fun WeekTab(r: WeatherApp.Report, wide: Boolean, onDay: (String) -> Unit) {
    val today = r.now.take(10)
    LazyColumn(
        Modifier.fillMaxSize().glass(PanelShape),
        contentPadding = PaddingValues(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(r.days.take(7)) { d ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .focusGlow(TileShape)
                    .glass(TileShape)
                    .clickable { onDay(d.date) }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.width(96.dp)) {
                    Text(WeatherApp.dayName(d.date, today), fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Text(WeatherApp.shortDate(d.date), fontSize = 12.sp, color = Dim)
                    Text("H ${d.high}° · L ${d.low}°", fontSize = 12.sp, color = Soft)
                }
                val parts = r.partsOf(d.date).let { p -> if (wide) p else p.filter { it.name != WeatherApp.NOON } }
                parts.forEach { p ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(p.name, fontSize = 12.sp, color = Dim)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            WeatherIcon(p.code, p.day, 30.dp)
                            Text(" ${p.temperature}°", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        }
                        Text("☔ ${p.rain}%", fontSize = 12.sp, color = Yellow)
                    }
                }
                if (wide) {
                    Column(Modifier.width(96.dp), horizontalAlignment = Alignment.End) {
                        Text(d.sky, fontSize = 12.sp, color = Soft, maxLines = 2)
                        if (d.rainAmount > 0) Text("💧 ${amountText(d.rainAmount, r.fahrenheit)}", fontSize = 12.sp, color = Soft)
                    }
                }
            }
        }
        item { Text("OK on a day shows it hour by hour.", fontSize = 12.sp, color = Dim) }
    }
}

@Composable
private fun TwoWeeksTab(r: WeatherApp.Report, wide: Boolean, onDay: (String) -> Unit) {
    val today = r.now.take(10)
    val perRow = if (wide) 7 else 3
    LazyColumn(
        Modifier.fillMaxSize().glass(PanelShape),
        contentPadding = PaddingValues(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { Text("14 Days", fontSize = 19.sp, fontWeight = FontWeight.Bold) }
        r.days.take(14).chunked(perRow).forEach { row ->
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { d ->
                        Column(
                            Modifier
                                .weight(1f)
                                .focusGlow(TileShape)
                                .glass(TileShape)
                                .clickable { onDay(d.date) }
                                .padding(vertical = 12.dp, horizontal = 6.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(WeatherApp.dayName(d.date, today), fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                            Text(WeatherApp.shortDate(d.date), fontSize = 12.sp, color = Dim)
                            WeatherIcon(d.code, true, 46.dp, Modifier.padding(vertical = 4.dp))
                            Text("${d.high}°", fontSize = 24.sp, fontWeight = FontWeight.Bold)
                            Text("${d.low}°", fontSize = 17.sp, color = Soft)
                            Text("☔ ${d.rain}%", fontSize = 12.sp, color = Yellow)
                            Text(d.sky, fontSize = 11.sp, color = Dim, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    repeat(perRow - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
        item { Text("The further ahead, the less certain. OK on a day shows it hour by hour.", fontSize = 12.sp, color = Dim) }
    }
}

// ---------------------------------------------------------------- Maps

@Composable
private fun MapsTab(r: WeatherApp.Report, wide: Boolean, onWeatherMap: () -> Unit) {
    var web by remember { mutableStateOf<WebView?>(null) }
    var playing by remember { mutableStateOf(true) }
    PanelBox(Modifier.fillMaxSize(), "Radar") {
        Column {
            Radar(r.place, mini = false, modifier = Modifier.fillMaxWidth().weight(1f).clip(TileShape)) { web = it }
            Row(
                Modifier.fillMaxWidth().padding(top = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Chip("◀ Back", on = false) { web?.evaluateJavascript("step(-1)", null); playing = false }
                Chip(if (playing) "⏸ Pause" else "▶ Play", on = true) {
                    web?.evaluateJavascript("toggle()", null)
                    playing = !playing
                }
                Chip("Forward ▶", on = false) { web?.evaluateJavascript("step(1)", null); playing = false }
                Spacer(Modifier.weight(1f))
                if (wide) Legend()
                Chip("🗺 Wind & temperature map", on = false, onClick = onWeatherMap)
            }
        }
    }
}

@Composable
private fun Legend() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Light", fontSize = 12.sp, color = Soft)
        Box(
            Modifier.width(110.dp).height(8.dp).background(
                Brush.horizontalGradient(listOf(Color(0xFF9BE7FF), Color(0xFF1E88E5), Color(0xFF0D47A1), Color(0xFFFFEB3B), Color(0xFFFF5722), Color(0xFFD50000))),
                RoundedCornerShape(4.dp),
            ),
        )
        Text("Heavy", fontSize = 12.sp, color = Soft)
        Box(Modifier.size(10.dp).background(Color.White, CircleShape))
        Text("Snow", fontSize = 12.sp, color = Soft)
    }
}

/**
 * The moving rain radar (assets/weather/radar.html: RainViewer's free radar over a dark map). It takes no
 * remote keys itself; the Maps tab steps and pauses it through [onWeb].
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun Radar(place: Location.Place, mini: Boolean, modifier: Modifier, onWeb: (WebView) -> Unit = {}) {
    var failed by remember(place.latitude, place.longitude) { mutableStateOf(false) }
    Box(modifier.background(Color(0xFF1C2233))) {
        if (failed) {
            Text("The radar can't be shown on this device.", color = Soft, modifier = Modifier.align(Alignment.Center).padding(16.dp))
            return@Box
        }
        androidx.compose.runtime.key(place.latitude, place.longitude, mini) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    runCatching {
                        val html = context.assets.open("weather/radar.html").bufferedReader().use { it.readText() }
                            .replace("__LAT__", "%.4f".format(Locale.US, place.latitude))
                            .replace("__LON__", "%.4f".format(Locale.US, place.longitude))
                            .replace("__ZOOM__", if (mini) "6" else "7")
                            .replace("__MINI__", if (mini) "1" else "0")
                        WebView(context).apply {
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            isFocusable = false
                            isFocusableInTouchMode = false
                            setBackgroundColor(android.graphics.Color.rgb(28, 34, 51))
                            webViewClient = object : WebViewClient() {
                                // Nothing on the radar opens another page.
                                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
                                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                                    (view.parent as? android.view.ViewGroup)?.removeView(view)
                                    view.destroy()
                                    failed = true
                                    return true
                                }
                            }
                            loadDataWithBaseURL("https://tv.bulkbazaar.ca/weather/", html, "text/html", "utf-8", null)
                            onWeb(this)
                        }
                    }.getOrElse {
                        failed = true
                        android.view.View(context)
                    }
                },
                onRelease = { (it as? WebView)?.destroy() },
            )
        }
    }
}

// ---------------------------------------------------------------- News and videos

@Composable
private fun NewsTab(stories: List<WeatherApp.Story>, wide: Boolean, onStory: (WeatherApp.Story) -> Unit) {
    if (stories.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Yellow) }
        return
    }
    val lead = stories.firstOrNull { it.image.isNotBlank() } ?: stories.first()
    val rest = stories - lead
    val perRow = if (wide) 3 else 2
    LazyColumn(
        Modifier.fillMaxSize().glass(PanelShape),
        contentPadding = PaddingValues(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Text("Weather News", fontSize = 19.sp, fontWeight = FontWeight.Bold) }
        item {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(if (wide) 280.dp else 200.dp)
                    .focusGlow(TileShape)
                    .clip(TileShape)
                    .clickable { onStory(lead) },
            ) {
                StoryPicture(lead, Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xDD000000)))))
                Column(Modifier.align(Alignment.BottomStart).padding(16.dp)) {
                    Text(lead.title, fontSize = if (wide) 26.sp else 19.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(listOf(lead.source, WeatherApp.ago(lead.published)).filter { it.isNotBlank() }.joinToString(" · "), fontSize = 13.sp, color = Soft)
                }
            }
        }
        rest.chunked(perRow).forEach { row ->
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { s -> NewsCard(s, Modifier.weight(1f)) { onStory(s) } }
                    repeat(perRow - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun NewsCard(s: WeatherApp.Story, modifier: Modifier, onClick: () -> Unit) {
    Column(modifier.focusGlow(TileShape).clickable(onClick = onClick).padding(4.dp)) {
        StoryPicture(s, Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(TileShape))
        Text(s.title, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
        Text(listOf(s.source, WeatherApp.ago(s.published)).filter { it.isNotBlank() }.joinToString(" · "), fontSize = 12.sp, color = Dim, maxLines = 1)
    }
}

@Composable
private fun StoryPicture(s: WeatherApp.Story, modifier: Modifier) {
    Box(modifier.background(Brush.linearGradient(listOf(TabOn, SkyBottom))), contentAlignment = Alignment.Center) {
        Text("📰", fontSize = 34.sp)
        if (s.image.isNotBlank()) {
            AsyncImage(model = s.image, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

@Composable
private fun VideoTab(videos: List<WeatherApp.Video>?, wide: Boolean, onPlay: (WeatherApp.Video) -> Unit) {
    when {
        videos == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Yellow) }
        videos.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No weather videos right now. Please look again later.", color = Soft)
        }
        else -> {
            val perRow = if (wide) 4 else 2
            LazyColumn(
                Modifier.fillMaxSize().glass(PanelShape),
                contentPadding = PaddingValues(14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item { Text("Weather Videos", fontSize = 19.sp, fontWeight = FontWeight.Bold) }
                videos.chunked(perRow).forEach { row ->
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            row.forEach { v ->
                                Column(Modifier.weight(1f).focusGlow(TileShape).clickable { onPlay(v) }.padding(4.dp)) {
                                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(TileShape).glass(TileShape), contentAlignment = Alignment.Center) {
                                        AsyncImage(model = v.thumbnail, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                                        Text("▶", fontSize = 22.sp, modifier = Modifier.background(Color(0x99000000), CircleShape).padding(horizontal = 14.dp, vertical = 6.dp))
                                    }
                                    Text(v.title, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                                    Text(listOf(v.channel, WeatherApp.ago(v.published)).filter { it.isNotBlank() }.joinToString(" · "), fontSize = 12.sp, color = Dim, maxLines = 1)
                                }
                            }
                            repeat(perRow - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Dialogs

@Composable
private fun WeatherDialog(title: String, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        delay(80)
        runCatching { focus.requestFocus() }
    }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            Modifier.fillMaxWidth(0.92f).widthIn(max = 1100.dp),
            shape = PanelShape,
            color = SkyBottom,
            contentColor = Color.White,
        ) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text(
                        "Close",
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.focusRequester(focus).focusGlow(PillShape).glass(PillShape)
                            .clickable(onClick = onDismiss).padding(horizontal = 14.dp, vertical = 8.dp),
                    )
                }
                content()
            }
        }
    }
}

/** One day's parts and hours, over the screen. */
@Composable
private fun DayDialog(r: WeatherApp.Report, date: String, onDismiss: () -> Unit) {
    val day = r.days.firstOrNull { it.date == date } ?: return
    val today = r.now.take(10)
    WeatherDialog("${WeatherApp.dayName(date, today)}, ${WeatherApp.shortDate(date)}", onDismiss) {
        Text(
            "${day.sky} · High ${day.high}° · Low ${day.low}° · ☔ ${day.rain}% · Wind up to ${day.wind} ${r.speed}" +
                (if (day.gusts > day.wind) ", gusts ${day.gusts}" else "") +
                " · UV ${day.uv} · Sunrise ${WeatherApp.clock(day.sunrise)} · Sunset ${WeatherApp.clock(day.sunset)}",
            color = Soft,
            fontSize = 14.sp,
        )
        val parts = r.partsOf(date)
        if (parts.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) { items(parts) { PartCard(it, r) } }
        val hours = r.hoursOf(date)
        if (hours.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { items(hours) { HourChip(it, r) } }
    }
}

@Composable
private fun AddPlaceDialog(onDismiss: () -> Unit, onPick: (Location.Place) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Location.Place>?>(null) }
    var searching by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    fun search() {
        if (query.isBlank() || searching) return
        searching = true
        scope.launch {
            results = withContext(Dispatchers.IO) { Location.search(query) }
            searching = false
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add a place") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Type a city or town, then pick it from the list.", style = MaterialTheme.typography.bodySmall)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("e.g. Lahore") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { search() }),
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { search() }, modifier = Modifier.padding(start = 6.dp).focusGlow()) {
                        Text(if (searching) "…" else "Search")
                    }
                }
                when {
                    results?.isEmpty() == true -> Text("No place found. Check the spelling and try again.")
                    results != null -> LazyColumn(Modifier.heightIn(max = 320.dp)) {
                        items(results!!) { place ->
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .focusGlow(ChipShape)
                                    .clickable { onPick(place) }
                                    .padding(vertical = 8.dp, horizontal = 4.dp),
                            ) {
                                Text(place.city, fontWeight = FontWeight.Bold)
                                if (place.region.isNotBlank()) {
                                    Text(place.region, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Back") } },
    )
}

/**
 * A weather story or the wind and temperature map, full screen inside the app (Google TV has no web
 * browser). The arrows scroll, OK opens a link, Back goes back a page and then closes it.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun WebPage(url: String, title: String, onClose: () -> Unit) {
    var web by remember { mutableStateOf<WebView?>(null) }
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        BackHandler {
            val w = web
            if (w != null && w.canGoBack()) w.goBack() else onClose()
        }
        Column(Modifier.fillMaxSize().background(Color.White)) {
            Row(
                Modifier.fillMaxWidth().background(SkyBottom).padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text("Back: return to Weather", color = Color.White.copy(alpha = 0.75f), fontSize = 12.sp, maxLines = 1,
                    modifier = Modifier.clickable(onClick = onClose).padding(start = 12.dp))
            }
            Box(Modifier.fillMaxWidth().weight(1f)) {
                if (failed) {
                    Text("This page can't be shown on this device. Press Back to return to Weather.", color = Color.Black,
                        fontSize = 16.sp, modifier = Modifier.align(Alignment.Center).padding(24.dp))
                } else {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { context ->
                            runCatching {
                                WebView(context).apply {
                                    settings.javaScriptEnabled = true
                                    settings.domStorageEnabled = true
                                    settings.loadWithOverviewMode = true
                                    settings.useWideViewPort = true
                                    settings.mediaPlaybackRequiresUserGesture = true
                                    isFocusable = true
                                    isFocusableInTouchMode = true
                                    webViewClient = object : WebViewClient() {
                                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                            val scheme = request.url.scheme
                                            return scheme != "http" && scheme != "https"
                                        }
                                        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) { loading = true }
                                        override fun onPageFinished(view: WebView, url: String?) { loading = false }
                                        // Its renderer running out of memory must not close the whole app.
                                        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                                            (view.parent as? android.view.ViewGroup)?.removeView(view)
                                            view.destroy()
                                            if (web === view) web = null
                                            failed = true
                                            return true
                                        }
                                    }
                                    loadUrl(url)
                                    requestFocus()
                                    web = this
                                }
                            }.getOrElse {
                                failed = true
                                android.view.View(context)
                            }
                        },
                        onRelease = { (it as? WebView)?.destroy() },
                    )
                    if (loading) CircularProgressIndicator(Modifier.align(Alignment.Center), color = TabOn)
                }
            }
        }
    }
}
