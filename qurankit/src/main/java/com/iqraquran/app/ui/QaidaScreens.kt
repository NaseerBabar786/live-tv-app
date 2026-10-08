package com.iqraquran.app.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Quiz
import androidx.compose.material.icons.filled.Stop
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iqraquran.app.data.Qaida
import com.iqraquran.app.player.Speaker
import kotlinx.coroutines.delay

/** The lesson map: 12 steps from the letters to short surahs, with the stars earned so far. */
@Composable
fun QaidaMapScreen(vm: AppViewModel) {
    val first = remember { FocusRequester() }
    Column(Modifier.fillMaxSize()) {
        TopBar(S.kids.get(), onBack = { vm.back() })
        LazyVerticalGrid(
            columns = GridCells.Adaptive(if (isWide()) 240.dp else 160.dp),
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            itemsIndexed(Qaida.lessons) { i, lesson ->
                val earned = vm.stars[lesson.id] ?: 0
                BigTile(
                    title = "${lesson.id}. ${tr(lesson.en, lesson.ur)}",
                    subtitle = lessonPreview(lesson),
                    color = KidColors[i % KidColors.size],
                    icon = null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(150.dp)
                        .then(if (i == 0) Modifier.focusRequester(first) else Modifier),
                    badge = { if (lesson.kind != Qaida.Kind.Surahs) Stars(earned) },
                ) {
                    if (lesson.kind == Qaida.Kind.Surahs) {
                        vm.open(Screen.SurahList(forHifz = false, kids = true))
                    } else {
                        vm.open(Screen.QaidaLesson(lesson.id))
                    }
                }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}

private fun lessonPreview(lesson: Qaida.Lesson): String = when (lesson.kind) {
    Qaida.Kind.Surahs -> "الفاتحة · الناس · الفلق · الاخلاص"
    else -> lesson.items.take(4).joinToString(" ") { it.text.replace("‍", "") }
}

/**
 * A lesson: a tip, then every card in a grid. Tap a card to hear it. "Play all" reads them
 * one by one, a good way to learn together on the TV.
 */
@Composable
fun QaidaLessonScreen(vm: AppViewModel, id: Int) {
    val lesson = Qaida.lesson(id)
    val status by vm.speaker.status.collectAsState()
    var selected by remember { mutableIntStateOf(-1) }
    var playingAll by remember { mutableStateOf(false) }
    val gridState = rememberLazyGridState()
    val first = remember { FocusRequester() }

    LaunchedEffect(playingAll) {
        if (!playingAll) return@LaunchedEffect
        for (i in lesson.items.indices) {
            selected = i
            gridState.animateScrollToItem(i + 1)
            var done = false
            vm.speaker.say(lesson.items[i].say) { done = true }
            var waited = 0
            while (!done && waited < 6000) {
                delay(100)
                waited += 100
            }
            // Time to say it back.
            delay(1500)
        }
        playingAll = false
    }

    Column(Modifier.fillMaxSize()) {
        TopBar("${lesson.id}. ${tr(lesson.en, lesson.ur)}", onBack = { vm.back() }) {
            RoundButton(
                if (playingAll) Icons.Filled.Stop else Icons.Filled.PlayArrow,
                if (playingAll) S.stop.get() else S.playAll.get(),
                onClick = {
                    if (playingAll) vm.speaker.stop()
                    playingAll = !playingAll
                },
                size = 48,
            )
            Spacer(Modifier.size(10.dp))
            RoundButton(Icons.Filled.Quiz, S.quiz.get(), { vm.replace(Screen.QaidaQuiz(id)) }, size = 48)
        }
        LazyVerticalGrid(
            state = gridState,
            columns = GridCells.Adaptive(if (lesson.kind == Qaida.Kind.Shapes || lesson.kind == Qaida.Kind.Words) 200.dp else 120.dp),
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(tr(lesson.tipEn, lesson.tipUr), fontSize = 18.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (status == Speaker.Status.NoArabic) {
                        Text(S.noArabicVoice.get(), color = palette.accent, fontSize = 15.sp)
                    }
                }
            }
            itemsIndexed(lesson.items) { i, item ->
                LetterCard(
                    item = item,
                    highlighted = selected == i,
                    modifier = if (i == 0) Modifier.focusRequester(first) else Modifier,
                ) {
                    selected = i
                    vm.speaker.say(item.say)
                }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}

@Composable
private fun LetterCard(item: Qaida.Item, highlighted: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val bg by animateColorAsState(if (highlighted) Gold else palette.letterCard, label = "card")
    Column(
        modifier = modifier
            .focusRing()
            .clip(TileShape)
            .background(bg)
            .clickable(onClick = onClick)
            .padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        ArabicText(item.text, size = 40.sp, color = palette.letterText, align = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        val label = tr(item.en, item.ur)
        if (label.isNotEmpty()) {
            Text(label, color = palette.letterText.copy(alpha = 0.8f), fontSize = 14.sp, textAlign = TextAlign.Center, maxLines = 1)
        }
    }
}

/**
 * Hear a sound, pick the card that matches out of four. Ten questions; stars at the end.
 * A wrong answer shows red and lets the child try again.
 */
@Composable
fun QaidaQuizScreen(vm: AppViewModel, id: Int) {
    val lesson = Qaida.lesson(id)
    val status by vm.speaker.status.collectAsState()
    var round by remember { mutableIntStateOf(0) }
    var mistakes by remember { mutableIntStateOf(0) }
    var wrong by remember { mutableStateOf(setOf<Int>()) }
    var correct by remember { mutableStateOf(false) }
    // Items with the same text (e.g. the same word twice) would make two right answers.
    val pool = remember(id) { lesson.items.distinctBy { it.text } }
    var question by remember { mutableStateOf(newQuestion(pool)) }
    val first = remember { FocusRequester() }
    val finished = round >= Qaida.QUIZ_LENGTH

    LaunchedEffect(question, status) {
        if (!finished && status == Speaker.Status.Ready) {
            delay(300)
            vm.speaker.say(question.first.say)
        }
    }
    LaunchedEffect(correct) {
        if (correct) {
            delay(1200)
            correct = false
            wrong = emptySet()
            round++
            if (round < Qaida.QUIZ_LENGTH) {
                question = newQuestion(pool, question.first)
            } else {
                vm.recordStars(id, Qaida.stars(mistakes))
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        TopBar("${S.quiz.get()} · ${tr(lesson.en, lesson.ur)}", onBack = { vm.back() })
        Column(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            if (finished) {
                Spacer(Modifier.height(30.dp))
                Text(S.finished.get(), fontSize = 30.sp, fontWeight = FontWeight.Bold, color = palette.accent)
                Stars(Qaida.stars(mistakes), size = 64)
                Text(S.wellDone.get(), fontSize = 24.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Choice(S.playAgain.get(), selected = true) {
                        round = 0
                        mistakes = 0
                        question = newQuestion(pool)
                    }
                    Choice(S.done.get(), selected = false) { vm.back() }
                }
                return@Column
            }
            if (status == Speaker.Status.NoArabic) Text(S.noArabicVoice.get(), color = palette.accent)
            Text("${round + 1} / ${Qaida.QUIZ_LENGTH}", fontSize = 18.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(
                    if (correct) S.wellDone.get() else S.whichOne.get(),
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (correct) Good else palette.text,
                )
                RoundButton(Icons.AutoMirrored.Filled.VolumeUp, S.listenAgain.get(), { vm.speaker.say(question.first.say) })
            }
            val options = question.second
            val cols = if (isWide()) 4 else 2
            options.chunked(cols).forEachIndexed { r, row ->
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxWidth()) {
                    row.forEachIndexed { c, option ->
                        val index = r * cols + c
                        val isAnswer = option == question.first
                        val color = when {
                            correct && isAnswer -> Good
                            index in wrong -> Bad
                            else -> palette.letterCard
                        }
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .aspectRatio(1.4f)
                                .then(if (index == 0) Modifier.focusRequester(first) else Modifier)
                                .focusRing()
                                .clip(TileShape)
                                .background(color)
                                .clickable(enabled = !correct) {
                                    if (isAnswer) {
                                        correct = true
                                    } else if (index !in wrong) {
                                        wrong = wrong + index
                                        mistakes++
                                        vm.speaker.say(question.first.say)
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            ArabicText(option.text, size = 44.sp, color = palette.letterText, align = TextAlign.Center)
                        }
                    }
                }
            }
        }
    }
    LaunchedEffect(round) { runCatching { first.requestFocus() } }
}

/** A question: the answer and four options (the answer among them), never repeating [previous]. */
private fun newQuestion(pool: List<Qaida.Item>, previous: Qaida.Item? = null): Pair<Qaida.Item, List<Qaida.Item>> {
    val answer = pool.filter { it != previous }.random()
    val others = pool.filter { it != answer && it.say != answer.say }.shuffled().take(3)
    return answer to (others + answer).shuffled()
}
