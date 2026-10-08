package com.iqraquran.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iqraquran.kit.R
import com.iqraquran.app.data.Profile
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import com.iqraquran.app.data.Hijri
import com.iqraquran.app.data.Prayer
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.cos
import kotlin.math.sin

/** Words used only on the home screen. */
private object HS {
    val resume = L("Resume", "پڑھنا جاری رکھیں")
    val start = L("Start", "شروع کریں")
    val startReading = L("Start reading", "پڑھنا شروع کریں")
    val nextPrayer = L("Next prayer", "اگلی نماز")
    val inTime = L("in", "باقی")
    val of = L("of", "میں سے")
    val surahWord = L("Surah", "سورہ")
}

@Composable
fun HomeScreen(vm: AppViewModel) {
    val wide = isWide()
    val first = remember { FocusRequester() }
    var editing by remember { mutableStateOf<Profile?>(null) }
    var adding by remember { mutableStateOf(false) }

    val learners: @Composable () -> Unit = {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.horizontalScroll(rememberScrollState()),
        ) {
            vm.profiles.forEachIndexed { i, p ->
                val selected = vm.profile?.id == p.id
                // Tap a learner to switch to it; tap the selected one again to rename or delete it.
                ProfileChip(
                    name = profileName(p, i),
                    color = KidColors[p.color % KidColors.size],
                    selected = selected,
                    onClick = { if (selected) editing = p else vm.selectProfile(p) },
                )
            }
            if (vm.profiles.size < 6) {
                Box(
                    modifier = Modifier
                        .focusRing(CircleShape)
                        .size(44.dp)
                        .clip(CircleShape)
                        .border(1.5.dp, palette.muted.copy(alpha = 0.45f), CircleShape)
                        .clickable { adding = true },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Add, contentDescription = S.addProfile.get(), tint = palette.muted, modifier = Modifier.size(20.dp)) }
            }
        }
    }

    val tiles = listOf<@Composable (Modifier) -> Unit>(
        { m ->
            HomeTile(S.kids.get(), S.kidsSub.get(), vm.tileColor("kids"), Icons.Filled.Face, wide, m.focusRequester(first)) {
                vm.open(Screen.QaidaMap)
            }
        },
        { m ->
            HomeTile(S.read.get(), S.readSub.get(), vm.tileColor("read"), Icons.AutoMirrored.Filled.MenuBook, wide, m) {
                vm.open(Screen.SurahList(forHifz = false))
            }
        },
        { m ->
            HomeTile(S.hifz.get(), S.hifzSub.get(), vm.tileColor("hifz"), Icons.Filled.Psychology, wide, m) {
                vm.open(Screen.HifzHome)
            }
        },
        { m ->
            HomeTile(PS.namaz.get(), PS.namazSub.get(), vm.tileColor("namaz"), Icons.Filled.AccessTime, wide, m) {
                vm.open(Screen.Prayer)
            }
        },
    )

    Box(Modifier.fillMaxSize().background(palette.background).starPattern(palette.accent)) {
        if (wide) {
            // TV: everything on one screen, kept clear of the edges the TV may cut off.
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(start = 40.dp, end = 40.dp, top = 20.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Header(vm, wide = true) { learners() }
                Row(Modifier.fillMaxWidth().height(176.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    ContinueCard(vm, wide = true, modifier = Modifier.weight(2f).fillMaxHeight())
                    NextPrayerCard(vm, wide = true, modifier = Modifier.weight(1f).fillMaxHeight())
                }
                Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    tiles.forEach { it(Modifier.weight(1f).fillMaxHeight()) }
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Header(vm, wide = false) {}
                learners()
                ContinueCard(vm, wide = false, modifier = Modifier.fillMaxWidth())
                NextPrayerCard(vm, wide = false, modifier = Modifier.fillMaxWidth())
                tiles.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        pair.forEach { it(Modifier.weight(1f).height(150.dp)) }
                    }
                }
            }
        }
    }

    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }

    if (adding || editing != null) {
        ProfileDialog(
            initial = editing,
            canDelete = editing != null && vm.profiles.size > 1,
            onSave = { name ->
                vm.saveProfile(editing?.id, name)
                adding = false
                editing = null
            },
            onDelete = {
                editing?.let(vm::deleteProfile)
                editing = null
            },
            onDismiss = {
                adding = false
                editing = null
            },
        )
    }
}

/** Logo, name, today's date (and the Islamic date), then the learners (on a TV) and Settings. */
@Composable
private fun Header(vm: AppViewModel, wide: Boolean, middle: @Composable () -> Unit) {
    val now = rememberNow()
    val c = Calendar.getInstance().apply { timeInMillis = now }
    val (hd, hm, hy) = Hijri.of(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH), vm.azan.hijriAdjust)
    val month = if (LocalLang.current == Lang.Ur) Hijri.monthsUr[hm - 1] else Hijri.monthsEn[hm - 1]
    val day = SimpleDateFormat("EEEE d MMMM", Locale.getDefault()).format(Date(now))
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Image(
            painterResource(R.drawable.iqra_logo),
            contentDescription = null,
            modifier = Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(S.appName.get(), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = palette.text)
            Text("$day · $hd $month $hy", fontSize = 13.sp, color = palette.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        middle()
        Box(
            modifier = Modifier
                .focusRing(CircleShape)
                .size(44.dp)
                .clip(CircleShape)
                .background(palette.card)
                .clickable { vm.open(Screen.Settings) },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Settings, contentDescription = S.settings.get(), tint = palette.text, modifier = Modifier.size(22.dp)) }
    }
}

/** Where the reader left off, with the surah's name in Arabic, how far they are and a Resume button. */
@Composable
private fun ContinueCard(vm: AppViewModel, wide: Boolean, modifier: Modifier) {
    val q = vm.quran
    val last = vm.lastRead
    val surahNo = last?.first ?: 1
    val ayah = last?.second ?: 1
    val surah = q?.surah(surahNo)
    val total = surah?.ayahs?.size ?: 0
    val color = vm.tileColor("continue")
    val shape = RoundedCornerShape(22.dp)
    Box(
        modifier = modifier
            .focusRing(shape)
            .clip(shape)
            .background(lerp(color, palette.background, 0.6f))
            .border(1.dp, lerp(color, palette.background, 0.3f), shape)
            .clickable { vm.open(Screen.Read(surahNo, ayah)) }
            .padding(horizontal = if (wide) 26.dp else 20.dp, vertical = if (wide) 20.dp else 18.dp),
    ) {
        if (surah != null) {
            Text(
                surah.nameAr,
                fontFamily = QuranFont,
                fontSize = if (wide) 60.sp else 46.sp,
                lineHeight = if (wide) 70.sp else 54.sp,
                color = palette.accent.copy(alpha = 0.9f),
                modifier = Modifier.align(Alignment.TopEnd),
                style = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Rtl),
            )
        }
        Column(
            modifier = Modifier.fillMaxHeight(),
            verticalArrangement = if (wide) Arrangement.SpaceBetween else Arrangement.spacedBy(12.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Filled.Bookmark, contentDescription = null, tint = palette.accent, modifier = Modifier.size(14.dp))
                    Text(
                        (if (last != null) S.continueReading.get() else HS.startReading.get()).uppercase(),
                        fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.3.sp, color = palette.accent,
                    )
                }
                Text(surah?.nameEn ?: S.read.get(), fontSize = if (wide) 30.sp else 26.sp, fontWeight = FontWeight.ExtraBold, color = palette.text)
                if (surah != null) {
                    Text(
                        "${HS.surahWord.get()} $surahNo · ${S.ayahWord.get()} $ayah ${HS.of.get()} $total",
                        fontSize = 14.sp, color = palette.muted,
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(palette.accent)
                        .padding(horizontal = 20.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = palette.onAccent, modifier = Modifier.size(18.dp))
                    Text(
                        if (last != null) HS.resume.get() else HS.start.get(),
                        color = palette.onAccent, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp,
                    )
                }
                if (total > 0) {
                    val part = (ayah.toFloat() / total).coerceIn(0.02f, 1f)
                    Box(
                        Modifier
                            .weight(1f)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(palette.text.copy(alpha = 0.15f)),
                    ) {
                        Box(Modifier.fillMaxWidth(part).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(palette.accent))
                    }
                }
            }
        }
    }
}

/** The next prayer, its time and how long until it, with the day's five prayers marked. */
@Composable
private fun NextPrayerCard(vm: AppViewModel, wide: Boolean, modifier: Modifier) {
    val now = rememberNow()
    vm.azanVersion
    val next = vm.azan.around(now)?.second
    val color = vm.tileColor("namaz")
    val shape = RoundedCornerShape(22.dp)
    val bright = lerp(color, Color.White, 0.45f)
    val time = next?.let { DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(it.second)) }
    Box(
        modifier = modifier
            .focusRing(shape)
            .clip(shape)
            .background(lerp(color, palette.background, 0.72f))
            .border(1.dp, lerp(color, palette.background, 0.45f), shape)
            .clickable { vm.open(Screen.Prayer) }
            .padding(horizontal = 20.dp, vertical = if (wide) 18.dp else 14.dp),
    ) {
        if (!wide) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                IconBadge(Icons.Filled.AccessTime, color, 44)
                Column(Modifier.weight(1f)) {
                    Text(HS.nextPrayer.get().uppercase(), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.3.sp, color = bright)
                    Text(
                        if (next != null) "${tr(next.first.en, next.first.ur)} · $time" else PS.namazSub.get(),
                        fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, color = palette.text,
                    )
                }
                if (next != null) {
                    Text("${HS.inTime.get()} ${countdown(next.second - now)}", fontSize = 14.sp, color = palette.muted)
                }
            }
            return@Box
        }
        Column(Modifier.fillMaxHeight(), verticalArrangement = Arrangement.SpaceBetween) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    HS.nextPrayer.get().uppercase(),
                    fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.3.sp, color = bright,
                    modifier = Modifier.weight(1f),
                )
                vm.azan.place?.city?.substringBefore(",")?.takeIf { it.isNotBlank() }?.let {
                    Text(it, fontSize = 12.sp, color = palette.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (next != null) {
                Column {
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(next.first.en, fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, color = palette.text)
                        Text(next.first.ur, fontFamily = QuranFont, fontSize = 24.sp, color = bright)
                    }
                    Text("$time · ${HS.inTime.get()} ${countdown(next.second - now)}", fontSize = 15.sp, color = palette.text.copy(alpha = 0.85f))
                }
            } else {
                Text(PS.namazSub.get(), fontSize = 20.sp, fontWeight = FontWeight.Bold, color = palette.text)
            }
            // The day's five prayers: the next one lit, the ones passed today a little dimmer.
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                val today = vm.azan.times(0, now)
                Prayer.withAzan.forEach { p ->
                    val at = today?.let { vm.azan.at(0, it[p], now) }
                    val isNext = next?.first == p
                    val passed = at != null && at <= now
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(5.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(
                                    when {
                                        isNext -> bright
                                        passed -> color.copy(alpha = 0.75f)
                                        else -> palette.text.copy(alpha = 0.15f)
                                    },
                                ),
                        )
                        Text(
                            tr(p.en, p.ur), fontSize = 11.sp, maxLines = 1,
                            fontWeight = if (isNext) FontWeight.ExtraBold else FontWeight.Normal,
                            color = if (isNext) palette.text else palette.muted,
                        )
                    }
                }
            }
        }
    }
}

/** One of the four sections: a dark card tinted with its colour, a coloured badge, and a soft circle behind. */
@Composable
private fun HomeTile(
    title: String,
    subtitle: String,
    color: Color,
    icon: ImageVector,
    wide: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(22.dp)
    Box(
        modifier = modifier
            .focusRing(shape)
            .clip(shape)
            .background(lerp(color, palette.background, 0.74f))
            .border(1.dp, lerp(color, palette.background, 0.5f), shape)
            .drawBehind {
                drawCircle(
                    color = color.copy(alpha = 0.22f),
                    radius = size.minDimension * 0.42f,
                    center = Offset(size.width * 0.95f, size.height * 0.98f),
                )
            }
            .clickable(onClick = onClick)
            .padding(if (wide) 18.dp else 14.dp),
    ) {
        Column(Modifier.fillMaxHeight(), verticalArrangement = Arrangement.SpaceBetween) {
            IconBadge(icon, color, if (wide) 50 else 42)
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, fontSize = if (wide) 20.sp else 17.sp, fontWeight = FontWeight.ExtraBold, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(subtitle, fontSize = if (wide) 13.sp else 12.sp, color = palette.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun IconBadge(icon: ImageVector, color: Color, size: Int) {
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape((size * 0.32f).dp)).background(color),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size((size * 0.55f).dp)) }
}

/** A faint pattern of eight-pointed stars behind the home screen. */
private fun Modifier.starPattern(color: Color): Modifier = drawBehind {
    val step = 64.dp.toPx()
    val r = 26.dp.toPx()
    val inner = r * 0.42f
    val ink = color.copy(alpha = 0.06f)
    val stroke = Stroke(width = 1.dp.toPx())
    val star = Path().apply {
        for (i in 0 until 16) {
            val a = Math.PI / 8 * i - Math.PI / 2
            val len = if (i % 2 == 0) r else inner
            val x = (cos(a) * len).toFloat()
            val y = (sin(a) * len).toFloat()
            if (i == 0) moveTo(x, y) else lineTo(x, y)
        }
        close()
    }
    var y = step / 2
    while (y < size.height + step) {
        var x = step / 2
        while (x < size.width + step) {
            translate(x, y) { drawPath(star, ink, style = stroke) }
            x += step
        }
        y += step
    }
}

@Composable
fun profileName(p: Profile, index: Int): String =
    p.name.ifBlank { tr("Learner ${index + 1}", "طالب علم ${index + 1}") }

@Composable
private fun ProfileChip(name: String, color: Color, selected: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(50)
    Row(
        modifier = Modifier
            .focusRing(shape)
            .clip(shape)
            .background(if (selected) palette.card else Color.Transparent)
            .border(1.5.dp, if (selected) palette.accent else palette.muted.copy(alpha = 0.35f), shape)
            .clickable(onClick = onClick)
            .padding(start = 5.dp, end = 14.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(color),
            contentAlignment = Alignment.Center,
        ) {
            Text(name.take(1), color = Color.White, fontWeight = FontWeight.ExtraBold)
        }
        Text(name, color = palette.text, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal, fontSize = 14.sp)
    }
}

@Composable
private fun ProfileDialog(
    initial: Profile?,
    canDelete: Boolean,
    onSave: (String) -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) S.addProfile.get() else S.name.get()) },
        text = {
            OutlinedTextField(value = name, onValueChange = { name = it.take(24) }, label = { Text(S.name.get()) }, singleLine = true)
        },
        confirmButton = {
            TextButton(onClick = { onSave(name) }, modifier = Modifier.focusRing(CircleShape)) { Text(S.save.get()) }
        },
        dismissButton = {
            Row {
                if (canDelete) {
                    TextButton(onClick = onDelete, modifier = Modifier.focusRing(CircleShape)) { Text(S.delete.get(), color = Bad) }
                }
                TextButton(onClick = onDismiss, modifier = Modifier.focusRing(CircleShape)) { Text(S.cancel.get()) }
            }
        },
    )
}
