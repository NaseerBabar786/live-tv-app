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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.ChildCare
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
import com.iqraquran.app.R
import com.iqraquran.app.data.Profile

@Composable
fun HomeScreen(vm: AppViewModel) {
    val wide = isWide()
    val first = remember { FocusRequester() }
    var editing by remember { mutableStateOf<Profile?>(null) }
    var adding by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = if (wide) 48.dp else 16.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Image(
                painterResource(R.drawable.ic_logo),
                contentDescription = null,
                modifier = Modifier.size(if (wide) 72.dp else 60.dp).clip(RoundedCornerShape(18.dp)),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(S.appName.get(), fontSize = 30.sp, fontWeight = FontWeight.Bold, color = palette.accent)
                Text(S.tagline.get(), fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            RoundButton(Icons.Filled.Settings, S.settings.get(), { vm.open(Screen.Settings) }, size = 48)
        }

        ArabicText(
            "اِقۡرَاۡ بِاسۡمِ رَبِّكَ الَّذِىۡ خَلَقَ",
            size = 30.sp,
            modifier = Modifier.fillMaxWidth(),
            color = palette.accent,
            align = androidx.compose.ui.text.style.TextAlign.Center,
        )

        // Learners: tap one to switch to it; tap the selected one again to rename or delete it.
        Text(S.profiles.get(), fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        ) {
            vm.profiles.forEachIndexed { i, p ->
                val selected = vm.profile?.id == p.id
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
                        .size(52.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { adding = true },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Add, contentDescription = S.addProfile.get(), tint = palette.text) }
            }
        }

        val tiles = listOf<@Composable (Modifier) -> Unit>(
            { m ->
                BigTile(S.kids.get(), S.kidsSub.get(), KidColors[1], Icons.Filled.ChildCare, m.focusRequester(first)) {
                    vm.open(Screen.QaidaMap)
                }
            },
            { m ->
                BigTile(S.read.get(), S.readSub.get(), KidColors[0], Icons.AutoMirrored.Filled.MenuBook, m) {
                    vm.open(Screen.SurahList(forHifz = false))
                }
            },
            { m ->
                BigTile(S.hifz.get(), S.hifzSub.get(), KidColors[2], Icons.Filled.Psychology, m) {
                    vm.open(Screen.HifzHome)
                }
            },
        )
        if (wide) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                tiles.forEach { it(Modifier.weight(1f).height(190.dp)) }
            }
        } else {
            tiles.forEach { it(Modifier.fillMaxWidth().height(150.dp)) }
        }

        val last = vm.lastRead
        val q = vm.quran
        if (last != null && q != null) {
            val surah = q.surah(last.first)
            BigTile(
                S.continueReading.get(),
                "${surah.nameEn} · ${surah.nameAr} · ${S.ayahWord.get()} ${last.second}",
                Green,
                Icons.Filled.Bookmark,
                Modifier.fillMaxWidth(),
            ) { vm.open(Screen.Read(last.first, last.second)) }
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

@Composable
fun profileName(p: Profile, index: Int): String =
    p.name.ifBlank { tr("Learner ${index + 1}", "طالب علم ${index + 1}") }

@Composable
private fun ProfileChip(name: String, color: Color, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .focusRing(RoundedCornerShape(50))
            .clip(RoundedCornerShape(50))
            .background(if (selected) color else MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .size(26.dp)
                .clip(CircleShape)
                .background(if (selected) Color.White else color),
            contentAlignment = Alignment.Center,
        ) {
            Text(name.take(1), color = if (selected) color else Color.White, fontWeight = FontWeight.Bold)
        }
        Text(name, color = if (selected) Color.White else palette.text, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
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
