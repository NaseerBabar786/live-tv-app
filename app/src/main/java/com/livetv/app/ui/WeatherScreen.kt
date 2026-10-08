package com.livetv.app.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.data.Location
import com.livetv.app.data.WeatherApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The Weather section (1.10.11), next to Modes, Library and Games: the viewer's own place and any
 * places they add, each with the weather now, the parts of the day, the next 24 hours, 10 days,
 * details (wind, UV, air quality, sunrise...), warnings and weather stories. The remote's arrows
 * move around and OK opens; on a phone everything is tapped. Back closes a story, then the section.
 */
@Composable
fun WeatherScreen(onClose: () -> Unit) {
    val palette = Themes.current
    val scope = rememberCoroutineScope()
    val locationVersion by Location.version.collectAsStateWithLifecycle()
    var mine by remember { mutableStateOf<Location.Place?>(null) }
    var added by remember { mutableStateOf(WeatherApp.places()) }
    var selected by rememberSaveable { mutableIntStateOf(WeatherApp.selected) }
    var report by remember { mutableStateOf<WeatherApp.Report?>(null) }
    var stories by remember { mutableStateOf<List<WeatherApp.Story>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    var adding by remember { mutableStateOf(false) }
    var page by remember { mutableStateOf<Pair<String, String>?>(null) }
    var openDay by remember { mutableStateOf<String?>(null) }
    var removing by remember { mutableStateOf<Location.Place?>(null) }

    LaunchedEffect(locationVersion) { mine = withContext(Dispatchers.IO) { Location.current() } }
    val places = listOfNotNull(mine) + added
    val index = selected.coerceIn(0, (places.size - 1).coerceAtLeast(0))
    val place = places.getOrNull(index)

    LaunchedEffect(place?.latitude, place?.longitude, reload) {
        val p = place ?: return@LaunchedEffect
        loading = true
        failed = false
        val fresh = reload > 0
        val r = withContext(Dispatchers.IO) { WeatherApp.load(p, fresh) }
        if (r != null) report = r
        failed = r == null
        loading = false
        stories = withContext(Dispatchers.IO) { WeatherApp.stories(p) }
    }
    // The weather now is kept fresh while the section is open.
    LaunchedEffect(Unit) {
        while (true) {
            delay(15 * 60_000L)
            reload++
        }
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
            else -> onClose()
        }
    }

    val wide = LocalConfiguration.current.screenWidthDp >= 600
    val firstFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        delay(80)
        runCatching { firstFocus.requestFocus() }
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.fillMaxSize().safeDrawingPadding()) {
            if (wide) {
                Row(Modifier.fillMaxSize()) {
                    PlacesRail(
                        places = places,
                        mineCount = if (mine != null) 1 else 0,
                        selected = index,
                        firstFocus = firstFocus,
                        onPick = ::pick,
                        onAdd = { adding = true },
                        onClose = onClose,
                    )
                    WeatherBody(
                        report = report?.takeIf { place != null && WeatherApp.same(it.place, place) },
                        stories = stories,
                        loading = loading,
                        failed = failed,
                        canRemove = place != null && index >= (if (mine != null) 1 else 0),
                        header = null,
                        onRefresh = { reload++ },
                        onRemove = { removing = place },
                        onDay = { openDay = it },
                        onStory = { page = it.title to it.link },
                        onRadar = { r -> page = "Weather map · ${r.place.city}" to WeatherApp.radarUrl(r.place, r.fahrenheit) },
                        onUnit = { r -> WeatherApp.fahrenheitChoice = !r.fahrenheit; reload++ },
                        modifier = Modifier.weight(1f),
                    )
                }
            } else {
                Column(Modifier.fillMaxSize()) {
                    Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = onClose, modifier = Modifier.focusGlow()) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back to channels")
                        }
                        Text("☀️ Weather", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    }
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        itemsIndexed(places) { i, p ->
                            PlaceChip(
                                (if (i == 0 && mine != null) "📍 " else "") + p.city.ifBlank { "My place" },
                                on = i == index,
                                modifier = if (i == index) Modifier.focusRequester(firstFocus) else Modifier,
                            ) { pick(i) }
                        }
                        item { PlaceChip("＋ Add a place", on = false) { adding = true } }
                    }
                    WeatherBody(
                        report = report?.takeIf { place != null && WeatherApp.same(it.place, place) },
                        stories = stories,
                        loading = loading,
                        failed = failed,
                        canRemove = place != null && index >= (if (mine != null) 1 else 0),
                        header = null,
                        onRefresh = { reload++ },
                        onRemove = { removing = place },
                        onDay = { openDay = it },
                        onStory = { page = it.title to it.link },
                        onRadar = { r -> page = "Weather map · ${r.place.city}" to WeatherApp.radarUrl(r.place, r.fahrenheit) },
                        onUnit = { r -> WeatherApp.fahrenheitChoice = !r.fahrenheit; reload++ },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            if (place == null && !loading) {
                Text(
                    "Finding where you are…",
                    color = palette.muted,
                    modifier = Modifier.align(Alignment.Center),
                )
            }
        }
    }

    if (adding) {
        AddPlaceDialog(
            onDismiss = { adding = false },
            onPick = { p ->
                WeatherApp.addPlace(p)
                added = WeatherApp.places()
                val i = (if (mine != null) 1 else 0) + added.indexOfFirst { WeatherApp.same(it, p) }
                adding = false
                pick(i)
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
    val r = report
    if (openDay != null && r != null) DayDialog(r, openDay!!, onDismiss = { openDay = null })
    page?.let { (title, url) -> WebPage(url, title, onClose = { page = null }) }
}

@Composable
private fun PlacesRail(
    places: List<Location.Place>,
    mineCount: Int,
    selected: Int,
    firstFocus: FocusRequester,
    onPick: (Int) -> Unit,
    onAdd: () -> Unit,
    onClose: () -> Unit,
) {
    val palette = Themes.current
    Column(
        Modifier.width(250.dp).fillMaxHeight().background(palette.panel).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose, modifier = Modifier.focusGlow()) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back to channels")
            }
            Text("☀️ Weather", fontSize = 22.sp, fontWeight = FontWeight.Bold)
        }
        Text("Your places", color = palette.muted, fontSize = 13.sp, modifier = Modifier.padding(start = 6.dp, top = 6.dp))
        LazyColumn(Modifier.weight(1f, fill = false), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            itemsIndexed(places) { i, p ->
                val on = i == selected
                Column(
                    Modifier
                        .fillMaxWidth()
                        .then(if (on) Modifier.focusRequester(firstFocus) else Modifier)
                        .focusGlow(CardShape)
                        .background(if (on) palette.accent else Color.Transparent, CardShape)
                        .clickable { onPick(i) }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                ) {
                    Text(
                        (if (i < mineCount) "📍 " else "") + p.city.ifBlank { "My place" },
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = if (on) palette.onSurface else palette.soft,
                    )
                    val sub = if (i < mineCount) "Where you are" else p.region
                    if (sub.isNotBlank()) Text(sub, fontSize = 12.sp, color = palette.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Text(
            "＋ Add a place",
            fontWeight = FontWeight.Bold,
            color = palette.accentText,
            modifier = Modifier
                .fillMaxWidth()
                .focusGlow(CardShape)
                .clickable(onClick = onAdd)
                .padding(horizontal = 12.dp, vertical = 10.dp),
        )
    }
}

@Composable
private fun PlaceChip(label: String, on: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val palette = Themes.current
    Text(
        label,
        fontWeight = FontWeight.Bold,
        fontSize = 14.sp,
        color = if (on) Color.White else palette.soft,
        modifier = modifier
            .focusGlow(ChipShape)
            .background(if (on) palette.primary else palette.surfaceVariant, ChipShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    )
}

@Composable
private fun WeatherBody(
    report: WeatherApp.Report?,
    stories: List<WeatherApp.Story>,
    loading: Boolean,
    failed: Boolean,
    canRemove: Boolean,
    header: (@Composable () -> Unit)?,
    onRefresh: () -> Unit,
    onRemove: () -> Unit,
    onDay: (String) -> Unit,
    onStory: (WeatherApp.Story) -> Unit,
    onRadar: (WeatherApp.Report) -> Unit,
    onUnit: (WeatherApp.Report) -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = Themes.current
    Box(modifier.fillMaxHeight()) {
        if (report == null) {
            Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                if (loading || !failed) {
                    CircularProgressIndicator(color = palette.primary)
                } else {
                    Text("The weather can't be reached right now.", color = palette.soft)
                    TextButton(onClick = onRefresh, modifier = Modifier.focusGlow()) { Text("Try again") }
                }
            }
            return@Box
        }
        val r = report
        val alerts = r.alerts + r.headsUp()
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            header?.let { item { it() } }
            item { NowCard(r, canRemove, onRefresh, onRemove, onRadar, onUnit) }
            if (alerts.isNotEmpty()) {
                item { SectionTitle("⚠️ Warnings and heads-up") }
                items(alerts) { AlertRow(it) }
            }
            item { SectionTitle("Through the day") }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(r.partsFromNow()) { p -> PartCard(p, r) }
                }
            }
            item { SectionTitle("Hourly") }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(r.hoursFromNow(24)) { h -> HourCard(h, r) }
                }
            }
            item { SectionTitle("10-day forecast  ·  OK on a day for its hours") }
            val lowest = r.days.minOfOrNull { it.low } ?: 0
            val highest = r.days.maxOfOrNull { it.high } ?: 1
            items(r.days) { d -> DayRow(d, r, lowest, highest) { onDay(d.date) } }
            item { SectionTitle("Details") }
            item { Details(r) }
            if (stories.isNotEmpty()) {
                item { SectionTitle("📰 Weather news") }
                items(stories) { s -> StoryRow(s) { onStory(s) } }
            }
            item {
                Text(
                    "Weather by Open-Meteo.com · Air quality by Open-Meteo / CAMS" +
                        (if (r.place.country == "US") " · Warnings by the US National Weather Service" else "") +
                        " · Stories by Google News",
                    fontSize = 11.sp,
                    color = palette.muted,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
        if (loading) CircularProgressIndicator(Modifier.align(Alignment.TopEnd).padding(16.dp).size(22.dp), color = palette.primary, strokeWidth = 2.dp)
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Themes.current.soft, modifier = Modifier.padding(top = 4.dp))
}

@Composable
private fun NowCard(
    r: WeatherApp.Report,
    canRemove: Boolean,
    onRefresh: () -> Unit,
    onRemove: () -> Unit,
    onRadar: (WeatherApp.Report) -> Unit,
    onUnit: (WeatherApp.Report) -> Unit,
) {
    val palette = Themes.current
    val c = r.current
    val today = r.today
    Column(
        Modifier
            .fillMaxWidth()
            .background(Brush.linearGradient(listOf(palette.homeTop, palette.homeBottom)), RoundedCornerShape(18.dp))
            .padding(20.dp),
    ) {
        Text(r.place.label.ifBlank { "Your place" }, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text("Now · ${WeatherApp.clock(r.now)} local time", fontSize = 13.sp, color = palette.soft)
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 6.dp)) {
            Text(c.icon, fontSize = 64.sp)
            Spacer(Modifier.width(14.dp))
            Text("${c.temperature}°${r.unit}", fontSize = 64.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Spacer(Modifier.width(20.dp))
            Column {
                Text(c.sky, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color.White)
                Text("Feels like ${c.feelsLike}°", fontSize = 15.sp, color = palette.soft)
                today?.let { Text("High ${it.high}° · Low ${it.low}°", fontSize = 15.sp, color = palette.soft) }
            }
        }
        Text("👕 ${r.tip()}", fontSize = 15.sp, color = Color.White)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 10.dp)) {
            CardButton("🗺 Weather map") { onRadar(r) }
            CardButton(if (r.fahrenheit) "Show °C" else "Show °F") { onUnit(r) }
            CardButton("⟳ Refresh", onClick = onRefresh)
            if (canRemove) CardButton("✕ Remove place", onClick = onRemove)
        }
    }
}

@Composable
private fun CardButton(label: String, onClick: () -> Unit) {
    Text(
        label,
        fontWeight = FontWeight.Bold,
        fontSize = 14.sp,
        color = Color.White,
        modifier = Modifier
            .focusGlow(ChipShape)
            .background(Color.White.copy(alpha = 0.14f), ChipShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    )
}

@Composable
private fun AlertRow(a: WeatherApp.Alert) {
    val color = if (a.severe) Color(0xFFB71C1C) else Color(0xFF8D6E00)
    Column(
        Modifier
            .fillMaxWidth()
            .focusGlow(CardShape)
            .background(color.copy(alpha = 0.35f), CardShape)
            .clickable { }
            .padding(12.dp),
    ) {
        Text((if (a.severe) "🔴 " else "🟡 ") + a.title, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color.White)
        if (a.text.isNotBlank()) Text(a.text, fontSize = 14.sp, color = Color.White.copy(alpha = 0.9f), maxLines = 4, overflow = TextOverflow.Ellipsis)
        Text(a.source, fontSize = 11.sp, color = Color.White.copy(alpha = 0.65f))
    }
}

@Composable
private fun PartCard(p: WeatherApp.Part, r: WeatherApp.Report) {
    val palette = Themes.current
    val today = r.now.take(10)
    Column(
        Modifier
            .width(150.dp)
            .focusGlow(CardShape)
            .background(palette.surface, CardShape)
            .clickable { }
            .padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(p.name, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Text(if (p.date == today) "Today" else WeatherApp.dayName(p.date, today), fontSize = 12.sp, color = palette.muted)
        Text(p.icon, fontSize = 34.sp)
        Text("${p.temperature}°", fontSize = 26.sp, fontWeight = FontWeight.Bold)
        Text(p.sky, fontSize = 13.sp, color = palette.soft, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("💧 ${p.rain}%", fontSize = 13.sp, color = palette.accentText)
    }
}

@Composable
private fun HourCard(h: WeatherApp.Hour, r: WeatherApp.Report) {
    val palette = Themes.current
    val isNow = h.time.take(13) == r.now.take(13)
    Column(
        Modifier
            .width(78.dp)
            .focusGlow(CardShape)
            .background(if (isNow) palette.accent else palette.surface, CardShape)
            .clickable { }
            .padding(vertical = 10.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(if (isNow) "Now" else h.label, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        Text(h.icon, fontSize = 26.sp)
        Text("${h.temperature}°", fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text("💧${h.rain}%", fontSize = 11.sp, color = palette.accentText)
        // A small bar for the chance of rain.
        Box(Modifier.padding(top = 4.dp).width(46.dp).height(4.dp).background(palette.line, RoundedCornerShape(2.dp))) {
            Box(Modifier.fillMaxHeight().fillMaxWidth(h.rain / 100f).background(palette.accentText, RoundedCornerShape(2.dp)))
        }
    }
}

@Composable
private fun DayRow(d: WeatherApp.Day, r: WeatherApp.Report, lowest: Int, highest: Int, onClick: () -> Unit) {
    val palette = Themes.current
    val today = r.now.take(10)
    Row(
        Modifier
            .fillMaxWidth()
            .focusGlow(CardShape)
            .background(palette.surface, CardShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(110.dp)) {
            Text(WeatherApp.dayName(d.date, today), fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text(WeatherApp.shortDate(d.date), fontSize = 12.sp, color = palette.muted)
        }
        Text(d.icon, fontSize = 26.sp, modifier = Modifier.width(46.dp))
        Text(d.sky, fontSize = 14.sp, color = palette.soft, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(150.dp))
        Text("💧${d.rain}%", fontSize = 13.sp, color = palette.accentText, modifier = Modifier.width(64.dp))
        Text("${d.low}°", fontSize = 16.sp, color = palette.soft, modifier = Modifier.width(40.dp))
        // The day's low to high, against the coldest and warmest of the 10 days.
        BoxWithConstraints(Modifier.weight(1f).height(8.dp).background(palette.line, RoundedCornerShape(4.dp))) {
            val span = (highest - lowest).coerceAtLeast(1).toFloat()
            val start = maxWidth * ((d.low - lowest) / span)
            val width = (maxWidth * ((d.high - d.low) / span)).coerceAtLeast(8.dp)
            Box(
                Modifier
                    .padding(start = start)
                    .width(width)
                    .fillMaxHeight()
                    .background(Brush.horizontalGradient(listOf(Color(0xFF4FC3F7), Color(0xFFFFB300), Color(0xFFE53935))), RoundedCornerShape(4.dp)),
            )
        }
        Text("${d.high}°", fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 10.dp).width(44.dp))
    }
}

@Composable
private fun Details(r: WeatherApp.Report) {
    val c = r.current
    val today = r.today
    val tiles = buildList {
        add(Triple("💧", "Humidity", "${c.humidity}%"))
        add(Triple("🌬️", "Wind", "${c.wind} ${r.speed} from ${c.windFrom}" + if (c.gusts > c.wind) "\nGusts ${c.gusts} ${r.speed}" else ""))
        add(Triple("🔆", "UV index", "${today?.uv ?: c.uv} · ${WeatherApp.uvLabel(today?.uv ?: c.uv)}"))
        r.airQuality?.let { add(Triple("🫁", "Air quality", "$it · ${WeatherApp.airLabel(it)}")) }
        today?.let {
            add(Triple("🌅", "Sunrise", WeatherApp.clock(it.sunrise)))
            add(Triple("🌇", "Sunset", WeatherApp.clock(it.sunset)))
        }
        add(Triple("⏲️", "Pressure", "${c.pressure} hPa"))
        c.visibility?.let { add(Triple("👁️", "Visibility", "$it ${r.distance}")) }
        add(Triple("🌡️", "Dew point", "${c.dewPoint}°"))
        add(Triple("☁️", "Cloud cover", "${c.clouds}%"))
    }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val perRow = (maxWidth / 170.dp).toInt().coerceIn(2, 5)
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            tiles.chunked(perRow).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { (icon, name, value) -> DetailTile(icon, name, value, Modifier.weight(1f)) }
                    repeat(perRow - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun DetailTile(icon: String, name: String, value: String, modifier: Modifier) {
    val palette = Themes.current
    Column(
        modifier
            .heightIn(min = 86.dp)
            .focusGlow(CardShape)
            .background(palette.surface, CardShape)
            .clickable { }
            .padding(12.dp),
    ) {
        Text("$icon  $name", fontSize = 13.sp, color = palette.muted)
        Text(value, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun StoryRow(s: WeatherApp.Story, onClick: () -> Unit) {
    val palette = Themes.current
    Column(
        Modifier
            .fillMaxWidth()
            .focusGlow(CardShape)
            .background(palette.surface, CardShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(s.title, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(
            listOf(s.source, WeatherApp.ago(s.published)).filter { it.isNotBlank() }.joinToString(" · "),
            fontSize = 12.sp,
            color = palette.muted,
        )
    }
}

/** One day's hours and parts of the day, over the screen. */
@Composable
private fun DayDialog(r: WeatherApp.Report, date: String, onDismiss: () -> Unit) {
    val palette = Themes.current
    val day = r.days.firstOrNull { it.date == date } ?: return
    val today = r.now.take(10)
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        delay(80)
        runCatching { focus.requestFocus() }
    }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            Modifier.fillMaxWidth(0.92f).widthIn(max = 1100.dp),
            shape = RoundedCornerShape(18.dp),
            color = palette.background,
            contentColor = palette.onSurface,
        ) {
        Column(
            Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${day.icon}  ${WeatherApp.dayName(date, today)}, ${WeatherApp.shortDate(date)}", fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text(
                    "Close",
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.focusRequester(focus).focusGlow(ChipShape).background(palette.surfaceVariant, ChipShape)
                        .clickable(onClick = onDismiss).padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
            Text(
                "${day.sky} · High ${day.high}° · Low ${day.low}° · 💧 ${day.rain}% · Wind up to ${day.wind} ${r.speed} · " +
                    "UV ${day.uv} · Sunrise ${WeatherApp.clock(day.sunrise)} · Sunset ${WeatherApp.clock(day.sunset)}",
                color = palette.soft,
                fontSize = 14.sp,
            )
            val parts = r.partsOf(date)
            if (parts.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) { items(parts) { PartCard(it, r) } }
            }
            val hours = r.hoursOf(date)
            if (hours.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { items(hours) { HourCard(it, r) } }
            }
        }
        }
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
 * A weather story or the weather map, full screen inside the app (Google TV has no web browser).
 * The arrows scroll, OK opens a link, Back goes back a page and then closes it.
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
                Modifier.fillMaxWidth().background(Themes.current.panel).padding(horizontal = 16.dp, vertical = 6.dp),
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
                    if (loading) CircularProgressIndicator(Modifier.align(Alignment.Center), color = Themes.current.primary)
                }
            }
        }
    }
}
