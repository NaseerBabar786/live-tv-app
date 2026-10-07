package com.iqraquran.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iqraquran.app.data.AsrMethod
import com.iqraquran.app.data.AzanMode
import com.iqraquran.app.data.CalcMethod
import com.iqraquran.app.data.Hijri
import com.iqraquran.app.data.Prayer
import com.iqraquran.app.data.PrayerTimes
import java.text.DateFormat
import java.util.Calendar
import java.util.Date
import kotlinx.coroutines.delay

/** Text for the Namaz screens. */
object PS {
    val namaz = L("Namaz", "نماز")
    val namazSub = L("Prayer times and Azan", "نماز کے اوقات اور اذان")
    val now = L("NOW", "اب")
    val inWord = L("in", "میں")
    val azanSettings = L("Azan settings", "اذان کی ترتیبات")
    val findingPlace = L("Finding your area for the prayer times…", "نماز کے اوقات کے لیے آپ کا علاقہ معلوم کیا جا رہا ہے…")
    val tapBell = L(
        "Press the bell beside a prayer to choose: Azan, chime, message or off.",
        "ہر نماز کے ساتھ گھنٹی دبا کر چنیں: اذان، گھنٹی، پیغام یا بند۔",
    )
    val muezzin = L("Muezzin (Azan voice)", "مؤذن (اذان کی آواز)")
    val fajrMuezzin = L("Fajr Azan", "فجر کی اذان")
    val sameAsOthers = L("Same as the others", "باقی نمازوں جیسی")
    val volume = L("Azan volume", "اذان کی آواز")
    val reminder = L("Reminder before each prayer", "ہر نماز سے پہلے یاد دہانی")
    val off = L("Off", "بند")
    val minutesShort = L("min", "منٹ")
    val quiet = L("Quiet hours (Azan becomes a message)", "خاموش اوقات (اذان کی جگہ صرف پیغام)")
    val method = L("Fajr and Isha calculation", "فجر اور عشاء کا حساب")
    val automatic = L("Automatic", "خودکار")
    val asr = L("Asr time", "عصر کا وقت")
    val hijriAdjust = L("Islamic date: move by days", "اسلامی تاریخ: دنوں میں تبدیلی")
    val place = L("Your area", "آپ کا علاقہ")
    val findAgain = L("Find my area again", "علاقہ دوبارہ معلوم کریں")
    val testAzan = L("Hear it", "سنیں")
    val stopAzan = L("Stop Azan", "اذان بند کریں")
    val recordings = L("Azan recordings", "اذان کی ریکارڈنگز")
    val noVoices = L("The Azan recordings are loading. Check the internet.", "اذان کی ریکارڈنگز لوڈ ہو رہی ہیں۔ انٹرنیٹ چیک کریں۔")
    val azanTime = L("Azan time", "اذان کا وقت")
    val timeFor = L("It's time for", "وقت ہو گیا ہے")
    val comingUp = L("coming up in", "باقی وقت")
    val notifications = L(
        "Allow notifications so the Azan can play when the app is closed.",
        "اطلاعات کی اجازت دیں تاکہ ایپ بند ہونے پر بھی اذان چل سکے۔",
    )
}

/** "1 h 20 min" / "41 min". */
@Composable
fun countdown(ms: Long): String {
    val mins = ((ms + 59_999) / 60_000).toInt().coerceAtLeast(0)
    val h = mins / 60
    val m = mins % 60
    val min = PS.minutesShort.get()
    return if (h > 0) tr("$h h $m $min", "$h گھنٹے $m $min") else "$m $min"
}

fun modeIcon(m: AzanMode): ImageVector = when (m) {
    AzanMode.Azan -> Icons.AutoMirrored.Filled.VolumeUp
    AzanMode.Chime -> Icons.Filled.Notifications
    AzanMode.Message -> Icons.AutoMirrored.Filled.Chat
    AzanMode.Off -> Icons.Filled.NotificationsOff
}

/** A clock that moves on every 20 seconds. */
@Composable
fun rememberNow(): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(20_000)
            now = System.currentTimeMillis()
        }
    }
    return now
}

/** Today's prayers on a timeline, with a bell per prayer and the time left to the next one. */
@Composable
fun PrayerScreen(vm: AppViewModel) {
    val now = rememberNow()
    vm.azanVersion // redraw after a setting changes
    val wide = isWide()
    Column(Modifier.fillMaxSize()) {
        TopBar(PS.namaz.get(), onBack = { vm.back() }) {
            RoundButton(Icons.Filled.Settings, PS.azanSettings.get(), { vm.open(Screen.AzanSettings) }, size = 44,
                color = Color.Transparent, tint = palette.onBar)
        }
        val times = vm.azan.times(0, now)
        if (times == null) {
            Text(PS.findingPlace.get(), modifier = Modifier.padding(24.dp), fontSize = 18.sp)
            return@Column
        }
        val dateCard: @Composable () -> Unit = { DateCard(vm, now) }
        if (wide) {
            Row(Modifier.fillMaxSize().padding(horizontal = 32.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(32.dp)) {
                Column(Modifier.weight(1f).fillMaxHeight().verticalScroll(rememberScrollState())) {
                    Timeline(vm, now, compact = true)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    dateCard()
                    NextCard(vm, now)
                    Text(PS.tapBell.get(), color = palette.muted)
                    PlaceLine(vm)
                }
            }
        } else {
            Column(
                Modifier.fillMaxSize().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                dateCard()
                Timeline(vm, now, compact = false)
                NextCard(vm, now)
                Text(PS.tapBell.get(), color = palette.muted)
                PlaceLine(vm)
            }
        }
    }
}

@Composable
private fun DateCard(vm: AppViewModel, now: Long) {
    val c = Calendar.getInstance().apply { timeInMillis = now }
    val (hd, hm, hy) = Hijri.of(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH), vm.azan.hijriAdjust)
    val month = if (LocalLang.current == Lang.Ur) Hijri.monthsUr[hm - 1] else Hijri.monthsEn[hm - 1]
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(palette.cardAlt).padding(vertical = 12.dp, horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            java.text.SimpleDateFormat("EEEE", java.util.Locale.getDefault()).format(Date(now)),
            fontSize = 26.sp, fontWeight = FontWeight.Bold,
        )
        Text(DateFormat.getDateInstance(DateFormat.LONG).format(Date(now)), color = palette.muted, fontSize = 17.sp)
        Text("$hd $month $hy", color = palette.accent, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** The vertical line: a node per prayer, and between the last prayer and the next a coloured bar with "NOW". */
@Composable
private fun Timeline(vm: AppViewModel, now: Long, compact: Boolean) {
    val times = vm.azan.times(0, now) ?: return
    val around = vm.azan.around(now)
    val rowHeight = if (compact) 52.dp else 58.dp
    Column {
        Prayer.entries.forEachIndexed { i, p ->
            val at = vm.azan.at(0, times[p], now)
            val isCurrent = around?.first?.first == p && around.first.second == at
            val isNext = around?.second?.first == p && around.second.second == at
            PrayerRow(vm, p, times[p], highlight = isCurrent || isNext, past = at < now && !isCurrent, height = rowHeight)
            if (i < Prayer.entries.size - 1) {
                if (isCurrent && around != null) {
                    val span = (around.second.second - around.first.second).coerceAtLeast(1)
                    val f = ((now - around.first.second).toFloat() / span).coerceIn(0f, 1f)
                    ProgressGap(f, now, around.second.second - now, if (compact) 110.dp else 130.dp)
                } else {
                    LineGap(if (compact) 10.dp else 14.dp, past = at < now)
                }
            }
        }
        // After Isha (or before Fajr) the bar runs to tomorrow's Fajr.
        if (around != null && around.first.first == Prayer.Isha && around.first.second <= now &&
            around.second.first == Prayer.Fajr
        ) {
            val span = (around.second.second - around.first.second).coerceAtLeast(1)
            val f = ((now - around.first.second).toFloat() / span).coerceIn(0f, 1f)
            ProgressGap(f, now, around.second.second - now, 110.dp)
            Text(
                "${tr(Prayer.Fajr.en, Prayer.Fajr.ur)} · ${PrayerTimes.format(vm.azan.times(1, now)?.get(Prayer.Fajr) ?: 0)}",
                modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center, color = palette.muted,
            )
        }
    }
}

private val LineColor @Composable get() = palette.muted.copy(alpha = 0.6f)
private val NodeWidth = 44.dp
private val SideWidth = 150.dp

@Composable
private fun PrayerRow(vm: AppViewModel, p: Prayer, minutes: Int, highlight: Boolean, past: Boolean, height: Dp) {
    val color = when {
        highlight -> palette.text
        past -> palette.muted.copy(alpha = 0.7f)
        else -> palette.muted
    }
    val line = LineColor
    Row(Modifier.fillMaxWidth().height(height), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.width(SideWidth), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
            if (p.hasAzan) {
                val mode = vm.azan.mode(p)
                Box(
                    Modifier.focusRing(CircleShape).size(44.dp).clip(CircleShape)
                        .clickable { vm.setAzanMode(p, mode.next()) },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        modeIcon(mode), contentDescription = tr(mode.en, mode.ur),
                        tint = if (mode == AzanMode.Off) palette.muted else palette.accent,
                    )
                }
            }
            Text(
                PrayerTimes.format(minutes), color = color, fontSize = if (highlight) 22.sp else 19.sp,
                fontWeight = if (highlight) FontWeight.Bold else FontWeight.Medium,
                modifier = Modifier.padding(start = 6.dp, end = 10.dp),
            )
        }
        Canvas(Modifier.width(NodeWidth).fillMaxHeight()) {
            val cx = size.width / 2
            drawLine(line, Offset(cx, 0f), Offset(cx, size.height), strokeWidth = 3.dp.toPx())
            val r = (if (highlight) 15.dp else 12.dp).toPx()
            drawCircle(palette.background, r, Offset(cx, size.height / 2))
            drawCircle(if (highlight) palette.text else line, r, Offset(cx, size.height / 2), style = Stroke((if (highlight) 4.dp else 3.dp).toPx()))
        }
        Text(
            tr(p.en, p.ur), color = color, fontSize = if (highlight) 26.sp else 22.sp,
            fontWeight = if (highlight) FontWeight.Bold else FontWeight.SemiBold,
            modifier = Modifier.padding(start = 12.dp),
        )
    }
}

@Composable
private fun LineGap(height: Dp, past: Boolean) {
    val line = LineColor
    Row(Modifier.fillMaxWidth().height(height)) {
        Spacer(Modifier.width(SideWidth))
        Canvas(Modifier.width(NodeWidth).fillMaxHeight()) {
            drawLine(if (past) line.copy(alpha = 0.4f) else line, Offset(size.width / 2, 0f), Offset(size.width / 2, size.height), strokeWidth = 3.dp.toPx())
        }
    }
}

private val Green = Color(0xFF43A047)
private val Orange = Color(0xFFFFA726)
private val Red = Color(0xFFE53935)

/** The time between the last prayer and the next: green, then orange, then red as it runs out, "NOW" where we are. */
@Composable
private fun ProgressGap(fraction: Float, now: Long, left: Long, height: Dp) {
    val nowColor = when {
        fraction < 0.5f -> Green
        fraction < 0.8f -> Orange
        else -> Red
    }
    Row(Modifier.fillMaxWidth().height(height)) {
        Box(Modifier.width(SideWidth).fillMaxHeight()) {
            Text(
                PrayerTimes.format(minutesOfDay(now)), color = nowColor, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth().padding(end = 10.dp).align(Alignment.TopStart)
                    .padding(top = (height * fraction - 12.dp).coerceIn(0.dp, height - 24.dp)),
            )
        }
        Canvas(Modifier.width(NodeWidth).fillMaxHeight()) {
            val cx = size.width / 2
            val w = 5.dp.toPx()
            val h = size.height
            drawLine(Green, Offset(cx, 0f), Offset(cx, h * 0.5f), strokeWidth = w)
            drawLine(Orange, Offset(cx, h * 0.5f), Offset(cx, h * 0.8f), strokeWidth = w)
            drawLine(Red, Offset(cx, h * 0.8f), Offset(cx, h), strokeWidth = w)
            drawCircle(nowColor, 7.dp.toPx(), Offset(cx, h * fraction))
        }
        Box(Modifier.weight(1f).fillMaxHeight()) {
            Text(
                "◂ ${PS.now.get()} · ${countdown(left)}", color = nowColor, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 8.dp, top = (height * fraction - 12.dp).coerceIn(0.dp, height - 24.dp)),
            )
        }
    }
}

private fun minutesOfDay(ms: Long): Int {
    val c = Calendar.getInstance().apply { timeInMillis = ms }
    return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE)
}

/** The next prayer, big, with the time left. */
@Composable
fun NextCard(vm: AppViewModel, now: Long) {
    val next = vm.azan.around(now)?.second ?: return
    val prayer = next.first
    Column(
        Modifier.fillMaxWidth().clip(TileShape).background(palette.bar).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(tr("Next", "اگلی"), color = palette.onBar.copy(alpha = 0.8f), fontSize = 16.sp)
        Text(
            "${tr(prayer.en, prayer.ur)} · ${PrayerTimes.format(minutesOfDay(next.second))}",
            color = palette.onBar, fontSize = 30.sp, fontWeight = FontWeight.Bold,
        )
        Text("${PS.comingUp.get()} ${countdown(next.second - now)}", color = palette.barAccent, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun PlaceLine(vm: AppViewModel) {
    val place = vm.azan.place ?: return
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(Icons.Filled.LocationOn, contentDescription = null, tint = palette.muted)
        Text(
            listOf(place.city, place.country).filter { it.isNotBlank() }.joinToString(", ") +
                " · " + tr(vm.azan.methodInUse.en, vm.azan.methodInUse.ur),
            color = palette.muted, fontSize = 15.sp,
        )
    }
}

/** Muezzin, volume, reminder, quiet hours, calculation and place. */
@Composable
fun AzanSettingsScreen(vm: AppViewModel) {
    vm.azanVersion
    val a = vm.azan
    Column(Modifier.fillMaxSize()) {
        TopBar(PS.azanSettings.get(), onBack = { vm.stopAzanSample(); vm.back() })
        Column(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = if (isWide()) 80.dp else 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Heading(PS.namaz.get())
            Prayer.withAzan.forEach { p ->
                Text(tr(p.en, p.ur), fontWeight = FontWeight.SemiBold)
                ChoiceRow {
                    AzanMode.entries.forEach { m -> Choice(tr(m.en, m.ur), a.mode(p) == m) { vm.setAzanMode(p, m) } }
                }
            }
            Heading(PS.muezzin.get())
            if (vm.voices.isEmpty()) Text(PS.noVoices.get(), color = palette.muted)
            vm.voices.filter { !it.fajr }.forEach { v ->
                VoiceRow(vm, tr(v.en, v.ur), a.voiceId == v.id || (a.voice(a.voiceId)?.id == v.id), v.id) { vm.chooseVoice(v.id) }
            }
            Heading(PS.fajrMuezzin.get())
            ChoiceRow { Choice(PS.sameAsOthers.get(), a.fajrVoiceId.isEmpty()) { vm.chooseFajrVoice("") } }
            vm.voices.forEach { v ->
                VoiceRow(vm, tr(v.en, v.ur), a.fajrVoiceId == v.id, v.id) { vm.chooseFajrVoice(v.id) }
            }
            Stepper(PS.volume.get(), a.volume / 10, 1..10, suffix = "0%") { vm.setAzanVolume(it * 10) }
            Heading(PS.reminder.get())
            ChoiceRow {
                listOf(0, 5, 10, 15, 30).forEach { m ->
                    Choice(if (m == 0) PS.off.get() else "$m ${PS.minutesShort.get()}", a.reminderMinutes == m) { vm.setReminder(m) }
                }
            }
            Heading(PS.quiet.get())
            ChoiceRow {
                listOf(0 to 0, 22 to 6, 23 to 5, 0 to 5).forEach { (from, to) ->
                    val label = if (from == to) PS.off.get() else "${PrayerTimes.format(from * 60)} – ${PrayerTimes.format(to * 60)}"
                    Choice(label, a.quietFrom == from && a.quietTo == to) { vm.setQuiet(from, to) }
                }
            }
            Heading(PS.method.get())
            ChoiceRow {
                Choice("${PS.automatic.get()} (${tr(CalcMethod.forCountry(a.place?.country).en, CalcMethod.forCountry(a.place?.country).ur)})", a.method == null) { vm.setMethod(null) }
                CalcMethod.entries.forEach { m -> Choice(tr(m.en, m.ur), a.method == m) { vm.setMethod(m) } }
            }
            Heading(PS.asr.get())
            ChoiceRow { AsrMethod.entries.forEach { m -> Choice(tr(m.en, m.ur), a.asr == m) { vm.setAsr(m) } } }
            Stepper(PS.hijriAdjust.get(), a.hijriAdjust, -2..2) { vm.setHijriAdjust(it) }
            Heading(PS.place.get())
            Text(a.place?.let { listOf(it.city, it.country).filter(String::isNotBlank).joinToString(", ") } ?: PS.findingPlace.get())
            ChoiceRow { Choice(PS.findAgain.get(), false) { vm.findPlaceAgain() } }
            Heading(PS.recordings.get())
            vm.voices.forEach { v -> Text("${v.en}: ${v.credit}", color = palette.muted, fontSize = 13.sp) }
        }
    }
}

@Composable
private fun VoiceRow(vm: AppViewModel, label: String, selected: Boolean, id: String, onPick: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        val playingThis = vm.sampleId == id
        RoundButton(
            if (playingThis) Icons.Filled.Stop else Icons.Filled.PlayArrow,
            if (playingThis) S.stop.get() else PS.testAzan.get(),
            { if (playingThis) vm.stopAzanSample() else vm.playAzanSample(id) },
            size = 44,
        )
        Choice(label, selected, onPick)
    }
}

@Composable
private fun Heading(text: String) {
    Text(text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp))
}

/** The full-screen Azan: the prayer, its time, and a Stop button. */
@Composable
fun AzanFullScreen(prayer: Prayer, timeText: String, credit: String, reminderMinutes: Int, onStop: () -> Unit) {
    Column(
        Modifier.fillMaxSize().background(palette.background).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        ArabicText("اَللّٰهُ اَكْبَرُ", size = 64.sp, color = palette.accent, align = TextAlign.Center)
        Text(
            if (reminderMinutes > 0) "${tr(prayer.en, prayer.ur)} ${PS.inWord.get()} $reminderMinutes ${PS.minutesShort.get()}"
            else "${PS.timeFor.get()} ${tr(prayer.en, prayer.ur)}",
            fontSize = 36.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
        )
        Text(timeText, fontSize = 28.sp, color = palette.muted)
        val first = remember { androidx.compose.ui.focus.FocusRequester() }
        Box(
            Modifier.focusRequester(first).focusRing(RoundedCornerShape(50)).clip(RoundedCornerShape(50))
                .background(palette.accent).clickable(onClick = onStop).padding(horizontal = 28.dp, vertical = 14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Stop, contentDescription = null, tint = palette.onAccent)
                Text(PS.stopAzan.get(), color = palette.onAccent, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            }
        }
        LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
        if (credit.isNotBlank()) Text(credit, color = palette.muted, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}

/** A banner along the top for a chime, a message or a reminder; the screen behind keeps going. */
@Composable
fun AzanBanner(prayer: Prayer, timeText: String, reminderMinutes: Int, onClose: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.TopCenter) {
        Row(
            Modifier.clip(RoundedCornerShape(20.dp)).background(palette.bar).clickable(onClick = onClose)
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Icon(Icons.Filled.Notifications, contentDescription = null, tint = palette.barAccent, modifier = Modifier.size(32.dp))
            Column {
                Text(
                    if (reminderMinutes > 0) "${tr(prayer.en, prayer.ur)} ${PS.inWord.get()} $reminderMinutes ${PS.minutesShort.get()}"
                    else "${PS.timeFor.get()} ${tr(prayer.en, prayer.ur)}",
                    color = palette.onBar, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                )
                Text(timeText, color = palette.onBar.copy(alpha = 0.85f), fontSize = 17.sp)
            }
        }
    }
}
