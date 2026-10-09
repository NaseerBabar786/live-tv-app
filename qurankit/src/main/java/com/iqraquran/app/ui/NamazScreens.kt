package com.iqraquran.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.FormatListBulleted
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.SelfImprovement
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iqraquran.app.data.Namaz
import com.iqraquran.app.player.AyahPlayer
import com.iqraquran.app.player.Speaker
import kotlinx.coroutines.delay

/** Words used only in Learn Namaz. */
object NS {
    val learnNamaz = L("Learn Namaz", "نماز سیکھیں")
    val learnNamazSub = L("Steps, duas and 30 surahs", "طریقہ، دعائیں اور 30 سورتیں")
    val howToPray = L("How to pray", "نماز کا طریقہ")
    val howToPraySub = L("Every position, step by step", "ہر حالت، قدم بہ قدم")
    val rakats = L("Rak'at of the 5 prayers", "پانچ نمازوں کی رکعتیں")
    val rakatsSub = L("Sunnah, fard and witr", "سنت، فرض اور وتر")
    val duas = L("Duas of namaz", "نماز کی دعائیں")
    val duasSub = L("Learn every word by heart", "ہر لفظ زبانی یاد کریں")
    val surahs = L("Memorize surahs", "سورتیں یاد کریں")
    val surahsSub = L("30 surahs for namaz, and more", "نماز کے لیے 30 سورتیں، اور مزید")
    val myProgress = L("My progress", "میری پیش رفت")
    val surahsDone = L("namaz surahs memorized", "نماز کی سورتیں یاد ہیں")
    val duasDone = L("duas memorized", "دعائیں یاد ہیں")
    val extraDone = L("more surahs from my plan", "میرے منصوبے کی مزید سورتیں")
    val allDone = L(
        "MashaAllah! You have memorized all 30 namaz surahs. Add more surahs to your plan below.",
        "ماشاءاللہ! آپ نے نماز کی تمام 30 سورتیں یاد کر لی ہیں۔ نیچے اپنے منصوبے میں مزید سورتیں شامل کریں۔",
    )
    val step = L("Step", "مرحلہ")
    val whatToDo = L("What to do", "کیا کریں")
    val say = L("Say", "پڑھیں")
    val times = L("times", "بار")
    val listen = L("Listen", "سنیں")
    val iKnowIt = L("I know it by heart", "مجھے زبانی یاد ہے")
    val known = L("Memorized", "یاد ہے")
    val testMe = L("Hide the Arabic (test me)", "عربی چھپائیں (میرا امتحان)")
    val showArabic = L("Show the Arabic", "عربی دکھائیں")
    val starter = L("The 30 namaz surahs", "نماز کی 30 سورتیں")
    val myPlan = L("More surahs in my plan", "میرے منصوبے کی مزید سورتیں")
    val addMore = L("Add more surahs to my plan", "منصوبے میں مزید سورتیں شامل کریں")
    val pickSurah = L("Pick a surah to add", "شامل کرنے کے لیے سورت چنیں")
    val learnIt = L("Learn", "یاد کریں")
    val readIt = L("Read", "پڑھیں")
    val remove = L("Remove", "ہٹائیں")
    val notYet = L("Not yet", "ابھی نہیں")
    val inHifz = L("In Hifz", "حفظ میں")
    val prayer = L("Prayer", "نماز")
    val total = L("Total", "کل")
    val deviceVoice = L(
        "Not a Quran verse, so it is read by the device's Arabic voice. Learn the exact words from a teacher or the transliteration.",
        "یہ قرآن کی آیت نہیں، اس لیے ڈیوائس کی عربی آواز پڑھتی ہے۔ صحیح تلفظ استاد یا رومن لکھائی سے سیکھیں۔",
    )
    val teacherVoice = L(
        "Not a Quran verse, so it is read by your teacher voice (a computer voice). Check the exact words with a teacher.",
        "یہ قرآن کی آیت نہیں، اس لیے آپ کی چنی ہوئی استاد کی آواز (کمپیوٹر کی آواز) پڑھتی ہے۔ صحیح تلفظ استاد سے پوچھیں۔",
    )
    val teacher = L("Teacher voice for duas", "دعاؤں کے لیے استاد کی آواز")
    val quranReciter = L("Quran reciter for verses", "آیات کے لیے قاری")
    val reciterVoice = L("Recited from the Quran by your chosen reciter.", "آپ کے چنے ہوئے قاری کی تلاوت۔")
    val source = L("Source", "ماخذ")
}

/** Learn Namaz home: progress, then the four parts. */
@Composable
fun NamazHomeScreen(vm: AppViewModel) {
    val first = remember { FocusRequester() }
    val wide = isWide()
    val tiles = listOf(
        Triple(NS.howToPray, NS.howToPraySub, Icons.Filled.SelfImprovement) to { vm.open(Screen.NamazStep(0)) },
        Triple(NS.rakats, NS.rakatsSub, Icons.AutoMirrored.Filled.FormatListBulleted) to { vm.open(Screen.NamazRakats) },
        Triple(NS.duas, NS.duasSub, Icons.AutoMirrored.Filled.MenuBook) to { vm.open(Screen.NamazDuas) },
        Triple(NS.surahs, NS.surahsSub, Icons.Filled.Psychology) to { vm.open(Screen.NamazSurahs) },
    )
    Column(Modifier.fillMaxSize()) {
        TopBar(NS.learnNamaz.get(), onBack = { vm.back() })
        LazyColumn(
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            contentPadding = PaddingValues(horizontal = if (wide) 48.dp else 14.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { ProgressCard(vm) }
            items(tiles.chunked(if (wide) 4 else 2)) { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { (t, onClick) ->
                        val i = tiles.indexOfFirst { it.first == t }
                        BigTile(
                            t.first.get(),
                            t.second.get(),
                            NamazColors[i],
                            t.third,
                            Modifier.weight(1f).height(if (wide) 170.dp else 160.dp).then(if (i == 0) Modifier.focusRequester(first) else Modifier),
                            onClick = onClick,
                        )
                    }
                }
            }
            item {
                Text(
                    NS.source.get() + ": " + tr(Namaz.SOURCE_EN, Namaz.SOURCE_UR),
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}

private val NamazColors = listOf(Color(0xFF0B5D45), Color(0xFF1565C0), Color(0xFF7E57C2), Color(0xFFEF6C00))

@Composable
private fun ProgressCard(vm: AppViewModel) {
    val starterDone = Namaz.starterSurahs.count { vm.surahMemorized(it) }
    val duaIds = Namaz.memorizable.map { it.id }
    val duasDone = duaIds.count { it in vm.namaz.duas }
    val extra = vm.namaz.plan.drop(Namaz.starterSurahs.size)
    val extraDone = extra.count { vm.surahMemorized(it) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TileShape)
            .background(MaterialTheme.colorScheme.surface)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            NS.myProgress.get() + (vm.profile?.name?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""),
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = palette.accent,
        )
        ProgressLine("$starterDone / ${Namaz.starterSurahs.size}", NS.surahsDone.get(), starterDone, Namaz.starterSurahs.size)
        ProgressLine("$duasDone / ${duaIds.size}", NS.duasDone.get(), duasDone, duaIds.size)
        if (extra.isNotEmpty()) ProgressLine("$extraDone / ${extra.size}", NS.extraDone.get(), extraDone, extra.size)
        if (starterDone == Namaz.starterSurahs.size) {
            Text(NS.allDone.get(), color = Gold, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ProgressLine(count: String, label: String, done: Int, total: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(count, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(label, fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(10.dp)
                .clip(RoundedCornerShape(50))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            if (done > 0) {
                Box(
                    Modifier
                        .fillMaxWidth(done.toFloat() / total.coerceAtLeast(1))
                        .height(10.dp)
                        .background(if (done >= total) Gold else palette.accent),
                )
            }
        }
    }
}

/** One step of the prayer: what to do, then what to say. Previous / Next walk through all of them. */
@Composable
fun NamazStepScreen(vm: AppViewModel, index: Int) {
    val steps = Namaz.steps
    val step = steps[index.coerceIn(0, steps.lastIndex)]
    val first = remember { FocusRequester() }
    Column(Modifier.fillMaxSize()) {
        TopBar("${NS.step.get()} ${index + 1} / ${steps.size} · ${tr(step.titleEn, step.titleUr)}", onBack = { vm.back() })
        LazyColumn(
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            contentPadding = PaddingValues(horizontal = if (isWide()) 80.dp else 14.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(TileShape)
                        .background(palette.bar)
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(tr(step.titleEn, step.titleUr), fontSize = 24.sp, fontWeight = FontWeight.Bold, color = palette.barAccent)
                    if (step.arabicName.isNotEmpty()) ArabicText(step.arabicName, size = 26.sp, color = palette.onBar)
                    Text(NS.whatToDo.get(), fontWeight = FontWeight.SemiBold, color = palette.onBar)
                    Text(tr(step.howEn, step.howUr), fontSize = 17.sp, color = palette.onBar)
                }
            }
            if (step.recitations.isNotEmpty()) item { VoicePicker(vm) }
            items(step.recitations) { id -> RecitationCard(vm, Namaz.recitation(id)) }
            if (step.noteEn.isNotEmpty()) {
                item { Text(tr(step.noteEn, step.noteUr), fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    if (index > 0) Choice(S.previous.get(), false) { vm.replace(Screen.NamazStep(index - 1)) }
                    Box(Modifier.weight(1f))
                    Box(Modifier.focusRequester(first)) {
                        if (index < steps.lastIndex) {
                            Choice(S.next.get(), true) { vm.replace(Screen.NamazStep(index + 1)) }
                        } else {
                            Choice(S.done.get(), true) { vm.back() }
                        }
                    }
                }
            }
        }
    }
    LaunchedEffect(index) { runCatching { first.requestFocus() } }
}

/**
 * A recitation: Arabic, how it sounds, what it means, how many times to say it, a Listen button
 * and "I know it by heart". With [hidden] the Arabic is blurred until tapped, to test yourself.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RecitationCard(vm: AppViewModel, r: Namaz.Recitation, hidden: Boolean = false) {
    val q = vm.quran
    val arabic = Namaz.arabicOf(r) { s, a -> q?.surah(s)?.ayahs?.getOrNull(a - 1) }
    val speaking by vm.speaker.speaking.collectAsState()
    val status by vm.speaker.status.collectAsState()
    val playing by vm.player.playing.collectAsState()
    val current by vm.player.current.collectAsState()
    val failed by vm.player.error.collectAsState()
    var mine by remember { mutableStateOf(false) }
    val quranAudio = r.ayahs.isNotEmpty() && r.wholeAyahs
    val teacherUrl = if (quranAudio) null else Namaz.audioUrl(vm.namazVoice, r)
    var peek by remember { mutableStateOf(false) }
    val busy = mine && (speaking != null || (playing && current != null))
    LaunchedEffect(peek) {
        if (peek) {
            delay(4000)
            peek = false
        }
    }
    LaunchedEffect(speaking, current) { if (speaking == null && current == null) mine = false }
    // No internet or no recording yet: the device's own Arabic voice reads it instead.
    LaunchedEffect(failed) {
        if (failed && mine && teacherUrl != null) {
            vm.player.stop()
            mine = true
            vm.speaker.say(arabic) { mine = false }
        }
    }
    val known = r.id in vm.namaz.duas
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TileShape)
            .background(MaterialTheme.colorScheme.surface)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(tr(r.titleEn, r.titleUr), fontSize = 19.sp, fontWeight = FontWeight.Bold, color = palette.accent, modifier = Modifier.weight(1f))
            if (r.timesEn.isNotEmpty()) {
                Text(
                    tr(r.timesEn, r.timesUr),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = palette.onAccent,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(palette.accent).padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
            if (r.memorize && known) Icon(Icons.Filled.CheckCircle, contentDescription = NS.known.get(), tint = Good)
        }
        val showText = !hidden || peek
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .then(if (hidden) Modifier.focusRing().clickable { peek = true } else Modifier),
            contentAlignment = Alignment.Center,
        ) {
            ArabicText(
                arabic,
                size = (vm.textSize).sp,
                color = if (showText) palette.arabic else palette.arabic.copy(alpha = 0.1f),
                modifier = Modifier.fillMaxWidth().then(if (showText) Modifier else Modifier.blur(16.dp)),
            )
            if (!showText) Text(S.tapToPeek.get(), color = palette.accent, fontWeight = FontWeight.Bold)
        }
        Text(r.translit, fontSize = 16.sp, fontStyle = FontStyle.Italic, color = palette.text)
        Text(tr(r.meaningEn, r.meaningUr), fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Choice(if (busy) S.stop.get() else NS.listen.get(), busy) {
                if (busy) {
                    vm.player.stop()
                    vm.speaker.stop()
                    mine = false
                } else {
                    vm.player.stop()
                    vm.speaker.stop()
                    mine = true
                    if (quranAudio) {
                        vm.player.play(
                            r.ayahs.map { (s, a) -> AyahPlayer.Track(s, a, vm.reciter.url(s, a), "") },
                            gapMs = 0L,
                            onDone = { mine = false },
                        )
                    } else if (teacherUrl != null) {
                        vm.player.play(listOf(AyahPlayer.Track(0, 0, teacherUrl, "")), gapMs = 0L, onDone = { mine = false })
                    } else {
                        vm.speaker.say(arabic) { mine = false }
                    }
                }
            }
            if (r.memorize) {
                Choice(if (known) "✓ " + NS.known.get() else NS.iKnowIt.get(), known) { vm.markDua(r.id, !known) }
            }
        }
        if (mine && speaking != null && status == Speaker.Status.NoArabic) {
            Text(S.noArabicVoice.get(), color = palette.accent, fontSize = 14.sp)
        }
        Text(
            when {
                quranAudio -> NS.reciterVoice.get()
                teacherUrl != null -> NS.teacherVoice.get()
                else -> NS.deviceVoice.get()
            },
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * Who reads aloud: one teacher voice for every dua (so it no longer switches between voices) and
 * the Quran reciter for the verses. Shared by Iqra Quran and Cable TV's Iqra Quran.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun VoicePicker(vm: AppViewModel) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TileShape)
            .background(MaterialTheme.colorScheme.surface)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(NS.teacher.get(), fontWeight = FontWeight.SemiBold, color = palette.accent)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Namaz.voices.forEach { v ->
                Choice(tr(v.en, v.ur), vm.namazVoice == v.id) {
                    vm.player.stop()
                    vm.speaker.stop()
                    vm.chooseNamazVoice(v.id)
                }
            }
        }
        Text(NS.quranReciter.get(), fontWeight = FontWeight.SemiBold, color = palette.accent)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            vm.reciters.forEach { r ->
                Choice(tr(r.en, r.ur), vm.reciter.id == r.id) {
                    vm.player.stop()
                    vm.chooseReciter(r)
                }
            }
        }
    }
}

/** Every dua and recitation of the prayer, to learn by heart. */
@Composable
fun NamazDuasScreen(vm: AppViewModel) {
    var hidden by remember { mutableStateOf(false) }
    val first = remember { FocusRequester() }
    Column(Modifier.fillMaxSize()) {
        TopBar(NS.duas.get(), onBack = { vm.back() })
        LazyColumn(
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            contentPadding = PaddingValues(horizontal = if (isWide()) 80.dp else 14.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                val done = Namaz.memorizable.count { it.id in vm.namaz.duas }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("$done / ${Namaz.memorizable.size} ${NS.duasDone.get()}", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Box(Modifier.focusRequester(first)) {
                        Choice(if (hidden) NS.showArabic.get() else NS.testMe.get(), hidden) { hidden = !hidden }
                    }
                }
            }
            item { VoicePicker(vm) }
            items(Namaz.memorizable, key = { it.id }) { r -> RecitationCard(vm, r, hidden) }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}

/** How many rak'at each of the five daily prayers has. */
@Composable
fun NamazRakatsScreen(vm: AppViewModel) {
    Column(Modifier.fillMaxSize()) {
        TopBar(NS.rakats.get(), onBack = { vm.back() })
        LazyColumn(
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            contentPadding = PaddingValues(horizontal = if (isWide()) 80.dp else 14.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(Namaz.prayers) { p ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRing()
                        .clip(TileShape)
                        .background(MaterialTheme.colorScheme.surface)
                        .clickable { }
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(tr(p.nameEn, p.nameUr), fontSize = 21.sp, fontWeight = FontWeight.Bold, color = palette.accent, modifier = Modifier.weight(1f))
                        Text("${NS.total.get()} ${p.parts.sumOf { it.count }}", fontWeight = FontWeight.SemiBold)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        p.parts.forEach { part ->
                            Column(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(if (part.fard) palette.accent else MaterialTheme.colorScheme.surfaceVariant)
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Text("${part.count}", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = if (part.fard) palette.onAccent else palette.text)
                                Text(tr(part.en, part.ur), fontSize = 13.sp, color = if (part.fard) palette.onAccent else palette.text)
                            }
                        }
                    }
                }
            }
            item { Text(tr(Namaz.RAKAT_NOTE_EN, Namaz.RAKAT_NOTE_UR), fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

/** The 30 namaz surahs and the learner's own extra plan, each marked memorized or not. */
@Composable
fun NamazSurahsScreen(vm: AppViewModel) {
    val q = vm.quran ?: return Loading()
    val first = remember { FocusRequester() }
    val extra = vm.namaz.plan.drop(Namaz.starterSurahs.size)
    Column(Modifier.fillMaxSize()) {
        TopBar(NS.surahs.get(), onBack = { vm.back() })
        LazyColumn(
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            contentPadding = PaddingValues(horizontal = if (isWide()) 48.dp else 12.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item { ProgressCard(vm) }
            item { Text(NS.starter.get(), fontSize = 20.sp, fontWeight = FontWeight.Bold, color = palette.accent) }
            itemsIndexed(Namaz.starterSurahs, key = { _, n -> "s$n" }) { i, n ->
                PlanRow(vm, n, removable = false, modifier = if (i == 0) Modifier.focusRequester(first) else Modifier)
            }
            item { Text(NS.myPlan.get(), fontSize = 20.sp, fontWeight = FontWeight.Bold, color = palette.accent) }
            items(extra, key = { "e$it" }) { n -> PlanRow(vm, n, removable = true, modifier = Modifier) }
            item {
                BigTile(NS.addMore.get(), tr("Any surah of the Quran", "قرآن کی کوئی بھی سورت"), Color(0xFF0B5D45), Icons.Filled.Add, Modifier.fillMaxWidth()) {
                    vm.open(Screen.NamazAddSurah)
                }
            }
        }
    }
    LaunchedEffect(q) { runCatching { first.requestFocus() } }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlanRow(vm: AppViewModel, n: Int, removable: Boolean, modifier: Modifier) {
    val s = vm.quran?.surah(n) ?: return
    val memorized = vm.surahMemorized(n)
    val inHifz = !memorized && vm.hifz.any { it.surah == n }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TileShape)
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                Modifier.size(40.dp).clip(CircleShape).background(if (memorized) Good else palette.bar),
                contentAlignment = Alignment.Center,
            ) {
                if (memorized) Icon(Icons.Filled.CheckCircle, contentDescription = NS.known.get(), tint = Color.White)
                else Text("$n", fontWeight = FontWeight.Bold, color = palette.barAccent)
            }
            Column(Modifier.weight(1f)) {
                Text("$n. ${s.nameEn}", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "${s.ayahs.size} ${S.ayahs.get()} · " + when {
                        memorized -> NS.known.get()
                        inHifz -> NS.inHifz.get()
                        else -> NS.notYet.get()
                    },
                    fontSize = 14.sp,
                    color = if (memorized) Good else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            ArabicText(s.nameAr, size = 24.sp, color = palette.accent)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(modifier) { Choice(NS.learnIt.get(), false) { vm.open(Screen.HifzSetup(n)) } }
            Choice(NS.readIt.get(), false) { vm.open(Screen.Read(n)) }
            Choice(if (memorized) "✓ " + NS.known.get() else NS.iKnowIt.get(), memorized) { vm.markSurah(n, !memorized) }
            if (removable) Choice(NS.remove.get(), false) { vm.removeFromPlan(n) }
        }
    }
}

/** Every surah not yet in the plan; picking one adds it and goes back. */
@Composable
fun NamazAddSurahScreen(vm: AppViewModel) {
    val q = vm.quran ?: return Loading()
    val first = remember { FocusRequester() }
    val list = q.surahs.filter { it.number !in vm.namaz.plan }
    Column(Modifier.fillMaxSize()) {
        TopBar(NS.pickSurah.get(), onBack = { vm.back() })
        LazyColumn(
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            contentPadding = PaddingValues(horizontal = if (isWide()) 48.dp else 12.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            itemsIndexed(list, key = { _, s -> s.number }) { i, s ->
                SurahRow(s, if (i == 0) Modifier.focusRequester(first) else Modifier) {
                    vm.addToPlan(s.number)
                    vm.back()
                }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}

