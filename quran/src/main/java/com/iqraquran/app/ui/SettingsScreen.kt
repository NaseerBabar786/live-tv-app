package com.iqraquran.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iqraquran.app.data.TranslationMode

@Composable
fun SettingsScreen(vm: AppViewModel, version: String) {
    Column(Modifier.fillMaxSize()) {
        TopBar(S.settings.get(), onBack = { vm.back() })
        Column(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = if (isWide()) 80.dp else 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Heading(S.language.get())
            ChoiceRow {
                Choice("اردو", vm.lang == Lang.Ur) { vm.setLanguage(Lang.Ur) }
                Choice("English", vm.lang == Lang.En) { vm.setLanguage(Lang.En) }
            }
            Heading(S.translation.get())
            ChoiceRow {
                listOf(
                    TranslationMode.None to S.none, TranslationMode.Urdu to S.urdu,
                    TranslationMode.English to S.english, TranslationMode.Both to S.both,
                ).forEach { (mode, label) -> Choice(label.get(), vm.translation == mode) { vm.setTranslation(mode) } }
            }
            Heading(S.reciter.get())
            ChoiceRow {
                vm.reciters.forEach { r -> Choice(tr(r.en, r.ur), vm.reciter.id == r.id) { vm.setReciter(r) } }
            }
            Heading(S.kidsReciter.get())
            ChoiceRow {
                vm.reciters.forEach { r -> Choice(tr(r.en, r.ur), vm.kidsReciter.id == r.id) { vm.setKidsReciter(r) } }
            }
            Heading(S.textSize.get())
            ChoiceRow {
                Choice("A−", false) { vm.changeTextSize(-4) }
                ArabicText("بِسۡمِ اللّٰهِ", size = vm.textSize.sp, modifier = Modifier.padding(horizontal = 12.dp))
                Choice("A+", false) { vm.changeTextSize(4) }
            }
            Heading(S.credits.get())
            Text(S.creditsText.get(), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${S.version.get()} $version", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Heading(text: String) {
    Text(text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp))
}
