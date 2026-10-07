package com.iqraquran.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iqraquran.app.data.Hifz
import com.iqraquran.app.player.AyahPlayer
import kotlinx.coroutines.delay

/** Hifz home: today's revision (Sabaq, Sabqi, Manzil), the 30-juz map and a new lesson. */
@Composable
fun HifzHomeScreen(vm: AppViewModel) {
    val q = vm.quran ?: return Loading()
    val today = vm.today()
    val due = vm.hifz.filter { Hifz.isDue(it, today) }
    val first = remember { FocusRequester() }
    Column(Modifier.fillMaxSize()) {
        TopBar(S.hifz.get(), onBack = { vm.back() })
        LazyColumn(
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            contentPadding = PaddingValues(horizontal = if (isWide()) 48.dp else 14.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                BigTile(
                    S.newLesson.get(),
                    tr("Pick a surah and the ayahs to learn", "سورت اور آیات چنیں"),
                    KidColors[2],
                    Icons.Filled.Add,
                    Modifier.fillMaxWidth().focusRequester(first),
                ) { vm.open(Screen.SurahList(forHifz = true)) }
            }
            item { Text(S.todaysRevision.get(), fontSize = 22.sp, fontWeight = FontWeight.Bold, color = palette.accent) }
            if (due.isEmpty()) {
                item { Text(S.nothingDue.get(), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            Hifz.Group.entries.forEach { group ->
                val inGroup = due.filter { Hifz.group(it, today) == group }
                if (inGroup.isNotEmpty()) {
                    item {
                        Text(
                            when (group) {
                                Hifz.Group.Sabaq -> S.sabaq.get()
                                Hifz.Group.Sabqi -> S.sabqi.get()
                                Hifz.Group.Manzil -> S.manzil.get()
                            },
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    items(inGroup, key = { it.key }) { item -> RevisionRow(vm, item) }
                }
            }
            item { Text(S.juzMap.get(), fontSize = 22.sp, fontWeight = FontWeight.Bold, color = palette.accent) }
            item { JuzMap(Hifz.juzProgress(vm.hifz, q.ayahCounts)) }
            val rest = vm.hifz.filter { !Hifz.isDue(it, today) }
            if (rest.isNotEmpty()) {
                item { Text(tr("Memorized", "یاد کیا ہوا"), fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
                items(rest.sortedWith(compareBy({ it.surah }, { it.from })), key = { "done-" + it.key }) { item ->
                    RevisionRow(vm, item)
                }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}

@Composable
private fun RevisionRow(vm: AppViewModel, item: Hifz.Item) {
    val surah = vm.quran?.surah(item.surah) ?: return
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TileShape)
            .background(MaterialTheme.colorScheme.surface)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text("${surah.nameEn} ${item.from}–${item.to}", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Text(
                surah.nameAr + if (item.weak) " · " + S.weak.get() else "",
                color = if (item.weak) palette.accent else MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
            )
        }
        RoundButton(Icons.Filled.PlayArrow, S.repeat.get(), size = 46, onClick = {
            vm.open(Screen.HifzSession(item.surah, item.from, item.to, perAyah = 1, wholeTimes = 2, gapSeconds = 0, revising = true))
        })
        Choice(S.good.get(), false) { vm.reviewHifz(item, good = true) }
        Choice(S.weak.get(), false) { vm.reviewHifz(item, good = false) }
    }
}

/** 30 squares, one per juz, filled in as it is memorized. */
@Composable
private fun JuzMap(progress: List<Float>) {
    val cols = if (isWide()) 10 else 6
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        progress.chunked(cols).forEachIndexed { r, row ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                row.forEachIndexed { c, p ->
                    val juz = r * cols + c + 1
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(1.3f)
                            .clip(RoundedCornerShape(10.dp))
                            .background(
                                if (p <= 0f) MaterialTheme.colorScheme.surface else lerp(Color(0xFF3E6B5B), Good, p),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("$juz", fontWeight = FontWeight.Bold, color = if (p >= 1f) Gold else if (p > 0f) Color.White else palette.text)
                            if (p > 0f) Text("${(p * 100).toInt()}%", fontSize = 11.sp, color = Color.White)
                        }
                    }
                }
            }
        }
    }
}

/** New lesson: pick the ayahs and how many times to repeat. */
@Composable
fun HifzSetupScreen(vm: AppViewModel, surahNo: Int) {
    val q = vm.quran ?: return Loading()
    val surah = q.surah(surahNo)
    val count = surah.ayahs.size
    var from by remember { mutableIntStateOf(1) }
    var to by remember { mutableIntStateOf(minOf(count, 3)) }
    var perAyah by remember { mutableIntStateOf(5) }
    var whole by remember { mutableIntStateOf(3) }
    var gap by remember { mutableIntStateOf(3) }

    Column(Modifier.fillMaxSize()) {
        TopBar("${S.newLesson.get()} · ${surah.nameEn}", onBack = { vm.back() })
        Column(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = if (isWide()) 120.dp else 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            ArabicText(surah.nameAr, size = 34.sp, color = palette.accent, align = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            Stepper(S.fromAyah.get(), from, 1..count) {
                from = it
                if (to < it) to = it
            }
            Stepper(S.toAyah.get(), to, from..count) { to = it }
            Stepper(S.repeatEach.get(), perAyah, 1..20, "×") { perAyah = it }
            Stepper(S.repeatAll.get(), whole, 0..20, "×") { whole = it }
            Stepper(S.gap.get(), gap, 0..15, " " + S.seconds.get()) { gap = it }
            ArabicText(
                surah.ayahs.subList(from - 1, to).joinToString(" ") + " " + ayahMark(to),
                size = 26.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(TileShape)
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(12.dp)
                    .heightIn(max = 260.dp),
            )
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Choice(S.start.get(), selected = true) {
                    vm.replace(Screen.HifzSession(surahNo, from, to, perAyah, whole, gap, revising = false))
                }
            }
        }
    }
}

/**
 * Listening and repeating: each ayah several times with a pause to say it back, then all of
 * them together. The text can be hidden to test yourself, and peeked at by tapping it.
 */
@Composable
fun HifzSessionScreen(vm: AppViewModel, s: Screen.HifzSession) {
    val q = vm.quran ?: return Loading()
    val surah = q.surah(s.surah)
    val plan = remember(s) { Hifz.plan(s.surah, s.from, s.to, s.perAyah, s.wholeTimes) }
    val current by vm.player.current.collectAsState()
    val playing by vm.player.playing.collectAsState()
    val error by vm.player.error.collectAsState()
    var hidden by remember { mutableStateOf(s.revising) }
    var peek by remember { mutableStateOf(false) }
    var finished by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    val playButton = remember { FocusRequester() }

    fun start() {
        finished = false
        val tracks = plan.map { step ->
            AyahPlayer.Track(step.surah, step.ayah, vm.reciter.url(step.surah, step.ayah), "${step.round} / ${step.rounds}")
        }
        vm.player.play(tracks, gapMs = s.gapSeconds * 1000L, onDone = { finished = true })
    }

    LaunchedEffect(s) { start() }
    LaunchedEffect(peek) {
        if (peek) {
            delay(3000)
            peek = false
        }
    }

    val now = current
    val ayah = now?.second?.ayah ?: s.from
    val stepIndex = now?.first ?: 0

    Column(Modifier.fillMaxSize()) {
        TopBar("${S.hifz.get()} · ${surah.nameEn} ${s.from}–${s.to}", onBack = { vm.back() })
        Column(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = if (isWide()) 80.dp else 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (error) Text(S.noInternet.get(), color = Bad)
            Text(
                if (finished) S.finished.get()
                else "${S.ayahWord.get()} $ayah · ${S.repeat.get()} ${now?.second?.label ?: ""}",
                fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold,
                color = palette.accent,
            )
            // Progress through the whole plan.
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(50))
                    .background(MaterialTheme.colorScheme.surface),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(if (finished) 1f else (stepIndex + 1f) / plan.size)
                        .background(palette.accent)
                        .padding(vertical = 4.dp),
                )
            }
            val showText = !hidden || peek
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRing()
                    .clip(TileShape)
                    .background(MaterialTheme.colorScheme.surface)
                    .clickable { if (hidden) peek = true }
                    .padding(16.dp),
                contentAlignment = Alignment.Center,
            ) {
                ArabicText(
                    "${surah.ayahs[ayah - 1]} ${ayahMark(ayah)}",
                    size = (vm.textSize + 6).sp,
                    // Blur works from Android 12; older devices just fade the text right down.
                    color = if (showText) palette.arabic else palette.arabic.copy(alpha = 0.1f),
                    align = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().then(if (showText) Modifier else Modifier.blur(18.dp)),
                )
                if (!showText) Text(S.tapToPeek.get(), color = palette.accent, fontWeight = FontWeight.Bold)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.focusRequester(playButton)) {
                    RoundButton(
                        if (finished) Icons.Filled.Replay else if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        if (playing) S.pause.get() else S.play.get(),
                        onClick = { if (finished || now == null) start() else vm.player.togglePause() },
                        size = 64,
                    )
                }
                Choice(if (hidden) S.showText.get() else S.hideText.get(), hidden) { hidden = !hidden }
            }
            if (!s.revising) {
                Choice(if (saved) S.savedToHifz.get() else S.memorized.get(), selected = !saved) {
                    if (!saved) {
                        vm.addHifz(s.surah, s.from, s.to)
                        saved = true
                    }
                }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { playButton.requestFocus() } }
}
