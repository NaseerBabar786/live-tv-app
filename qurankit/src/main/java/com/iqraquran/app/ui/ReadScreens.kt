package com.iqraquran.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iqraquran.app.data.Qaida
import com.iqraquran.app.data.QuranText
import com.iqraquran.app.data.Surah
import com.iqraquran.app.data.TranslationMode
import com.iqraquran.app.player.AyahPlayer
import java.util.Locale

@Composable
fun Loading() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CircularProgressIndicator(color = palette.accent)
            Text(S.loading.get())
        }
    }
}

/** Surah list: all 114 for reading and Hifz; the children's starter surahs for the Qaida path. */
@Composable
fun SurahListScreen(vm: AppViewModel, forHifz: Boolean, kids: Boolean) {
    val q = vm.quran ?: return Loading()
    val list = if (kids) Qaida.firstSurahs.map { q.surah(it) } else q.surahs
    val first = remember { FocusRequester() }
    val title = when {
        kids -> tr("Short surahs", "چھوٹی سورتیں")
        forHifz -> S.surahLesson.get()
        else -> S.surahs.get()
    }
    Column(Modifier.fillMaxSize()) {
        TopBar(title, onBack = { vm.back() })
        LazyColumn(
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            contentPadding = PaddingValues(horizontal = if (isWide()) 48.dp else 12.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            itemsIndexed(list, key = { _, s -> s.number }) { i, s ->
                SurahRow(s, if (i == 0) Modifier.focusRequester(first) else Modifier) {
                    vm.open(
                        when {
                            forHifz -> Screen.HifzSetup(s.number)
                            else -> Screen.Read(s.number, kids = kids)
                        },
                    )
                }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}

@Composable
private fun SurahRow(s: Surah, modifier: Modifier, onClick: () -> Unit) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .focusRing()
            .clip(TileShape)
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(palette.bar),
            contentAlignment = Alignment.Center,
        ) { Text("${s.number}", fontWeight = FontWeight.Bold, color = palette.barAccent) }
        Column(modifier = Modifier.weight(1f)) {
            Text(s.nameEn, fontSize = 19.sp, fontWeight = FontWeight.SemiBold)
            Text(
                "${tr(s.meaningEn, s.meaningUr)} · ${s.ayahs.size} ${S.ayahs.get()} · ${if (s.makki) S.makki.get() else S.madani.get()}",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        ArabicText(s.nameAr, size = 26.sp, color = palette.accent)
    }
}

/** Arabic numerals in the ayah-end marker, e.g. ﴿١٢﴾. */
fun ayahMark(n: Int): String {
    val digits = n.toString().map { '٠' + (it - '0') }.joinToString("")
    return "﴿$digits﴾"
}

/**
 * Reading a surah: every ayah with its translation. Tap an ayah to play from there; the
 * playing ayah is highlighted and kept on screen. In the kids' path the teaching recitation
 * leaves a pause after each ayah to repeat it.
 */
@Composable
fun ReadScreen(vm: AppViewModel, surahNo: Int, startAyah: Int, kids: Boolean) {
    val q = vm.quran ?: return Loading()
    val surah = q.surah(surahNo)
    val current by vm.player.current.collectAsState()
    val playing by vm.player.playing.collectAsState()
    val error by vm.player.error.collectAsState()
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = (startAyah - 1).coerceAtLeast(0) + 1)
    var showOptions by remember { mutableStateOf(false) }
    val reciter = if (kids) vm.kidsReciter else vm.reciter
    val playButton = remember { FocusRequester() }

    fun playFrom(ayah: Int) {
        val tracks = surah.ayahs.indices.map { i ->
            AyahPlayer.Track(surah.number, i + 1, reciter.url(surah.number, i + 1))
        }
        vm.markRead(surah.number, ayah)
        // Kids get time to repeat each ayah after the teacher.
        vm.player.play(tracks, ayah - 1, gapMs = if (kids) 4000 else 0)
    }

    val playingAyah = current?.second?.takeIf { it.surah == surahNo }?.ayah
    LaunchedEffect(playingAyah) {
        if (playingAyah != null) {
            vm.markRead(surahNo, playingAyah)
            listState.animateScrollToItem(playingAyah) // item 0 is the header
        }
    }

    Column(Modifier.fillMaxSize()) {
        TopBar("${surah.number}. ${surah.nameEn}", onBack = { vm.back() }) {
            RoundButton(Icons.Filled.Tune, S.settings.get(), { showOptions = !showOptions }, size = 46)
            Spacer(Modifier.size(10.dp))
            Box(Modifier.focusRequester(playButton)) {
                RoundButton(
                    if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    if (playing) S.pause.get() else S.play.get(),
                    onClick = { if (current == null) playFrom(playingAyah ?: startAyah) else vm.player.togglePause() },
                    size = 46,
                )
            }
        }
        if (showOptions) ReadOptions(vm, kids)
        if (error) {
            Text(
                S.noInternet.get(),
                modifier = Modifier.fillMaxWidth().background(Bad).padding(8.dp),
                color = Color.White,
                textAlign = TextAlign.Center,
            )
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            contentPadding = PaddingValues(horizontal = if (isWide()) 48.dp else 10.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                SurahHeader(surah, q, reciterName = tr(reciter.en, reciter.ur))
            }
            items(surah.ayahs.size, key = { it }) { i ->
                AyahCard(
                    vm = vm,
                    q = q,
                    surah = surahNo,
                    ayah = i + 1,
                    text = surah.ayahs[i],
                    highlighted = playingAyah == i + 1,
                    onClick = { playFrom(i + 1) },
                )
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { playButton.requestFocus() } }
}

@Composable
private fun SurahHeader(surah: Surah, q: QuranText, reciterName: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TileShape)
            .background(palette.bar)
            .padding(14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        ArabicText("سُوۡرَةُ ${surah.nameAr}", size = 30.sp, color = palette.barAccent, align = TextAlign.Center)
        Text(
            "${tr(surah.meaningEn, surah.meaningUr)} · ${surah.ayahs.size} ${S.ayahs.get()} · $reciterName",
            fontSize = 14.sp,
            color = palette.onBar.copy(alpha = 0.85f),
            textAlign = TextAlign.Center,
        )
        if (surah.number != 1 && surah.number != 9) {
            ArabicText(q.bismillah, size = 30.sp, color = palette.onBar, align = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun AyahCard(
    vm: AppViewModel,
    q: QuranText,
    surah: Int,
    ayah: Int,
    text: String,
    highlighted: Boolean,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .focusRing()
            .clip(TileShape)
            .background(if (highlighted) palette.highlight else MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        ArabicText(
            "$text ${ayahMark(ayah)}",
            size = vm.textSize.sp,
            color = if (highlighted) palette.accent else palette.arabic,
            modifier = Modifier.fillMaxWidth(),
        )
        val mode = vm.translation
        if (mode == TranslationMode.Urdu || mode == TranslationMode.Both) {
            Text(
                q.urdu[surah - 1][ayah - 1],
                modifier = Modifier.fillMaxWidth(),
                fontSize = 19.sp,
                lineHeight = 34.sp,
                textAlign = TextAlign.Right,
                style = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Rtl),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (mode == TranslationMode.English || mode == TranslationMode.Both) {
            Text(
                "$ayah. ${q.english[surah - 1][ayah - 1]}",
                modifier = Modifier.fillMaxWidth(),
                fontSize = 17.sp,
                textAlign = TextAlign.Left,
                style = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Translation, reciter and text size, shown under the top bar when the slider button is pressed. */
@Composable
private fun ReadOptions(vm: AppViewModel, kids: Boolean) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (!vm.themeLocked) Text(S.theme.get(), fontWeight = FontWeight.SemiBold)
        ThemePicker(vm, compact = true)
        Text(S.translation.get(), fontWeight = FontWeight.SemiBold)
        ChoiceRow {
            listOf(
                TranslationMode.None to S.none, TranslationMode.Urdu to S.urdu,
                TranslationMode.English to S.english, TranslationMode.Both to S.both,
            ).forEach { (mode, label) -> Choice(label.get(), vm.translation == mode) { vm.chooseTranslation(mode) } }
        }
        Text(S.reciter.get(), fontWeight = FontWeight.SemiBold)
        ChoiceRow {
            vm.reciters.forEach { r ->
                val selected = (if (kids) vm.kidsReciter else vm.reciter).id == r.id
                Choice(tr(r.en, r.ur), selected) { if (kids) vm.chooseKidsReciter(r) else vm.chooseReciter(r) }
            }
        }
        Text(S.textSize.get(), fontWeight = FontWeight.SemiBold)
        ChoiceRow {
            Choice("A−", false) { vm.changeTextSize(-4) }
            Text(String.format(Locale.ROOT, "%d", vm.textSize), modifier = Modifier.padding(horizontal = 8.dp).widthIn(min = 30.dp), fontSize = 20.sp)
            Choice("A+", false) { vm.changeTextSize(4) }
        }
    }
}

/** A row of choices that scrolls sideways when it doesn't fit. */
@Composable
fun ChoiceRow(content: @Composable () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) { content() }
}
