package com.livetv.app

import android.view.KeyEvent as AndroidKeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.iqraquran.app.ui.AppViewModel
import com.iqraquran.app.ui.HifzHomeScreen
import com.iqraquran.app.ui.HifzSessionScreen
import com.iqraquran.app.ui.HifzSetupScreen
import com.iqraquran.app.ui.HomeScreen
import com.iqraquran.app.ui.IqraTheme
import com.iqraquran.app.ui.Lang
import com.iqraquran.app.ui.LocalLang
import com.iqraquran.app.ui.LocalLineSpacing
import com.iqraquran.app.ui.QaidaLessonScreen
import com.iqraquran.app.ui.QaidaMapScreen
import com.iqraquran.app.ui.QaidaQuizScreen
import com.iqraquran.app.ui.ReadScreen
import com.iqraquran.app.ui.Screen
import com.iqraquran.app.ui.SettingsScreen
import com.iqraquran.app.ui.SurahListScreen
import com.iqraquran.app.ui.Palette as QuranPalette
import com.livetv.app.ui.Palette as TvPalette
import com.livetv.app.ui.Themes

/**
 * Iqra Quran inside Cable TV (its top-bar button): the same screens as the Iqra Quran app
 * (Kids Qaida, Read with recitation, Hifz), drawn in Cable TV's current theme so it feels part of the app.
 * Back on its home screen returns to Cable TV.
 */
object QuranSection {
    const val AVAILABLE = true

    @Composable
    fun Screen(onClose: () -> Unit) {
        val vm: AppViewModel = viewModel()
        val tv = Themes.current
        val colours = remember(tv) { paletteFor(tv) }
        SideEffect { vm.fixedPalette = colours }
        val lifecycle = LocalLifecycleOwner.current.lifecycle
        val view = LocalView.current
        DisposableEffect(lifecycle) {
            // Recitation and Hifz repeats run a long time without a key press.
            view.keepScreenOn = true
            // Leaving Cable TV stops the recitation, as in the Iqra Quran app.
            val observer = LifecycleEventObserver { _, event ->
                if (event == Lifecycle.Event.ON_STOP) { vm.player.stop(); vm.speaker.stop() }
            }
            lifecycle.addObserver(observer)
            onDispose {
                lifecycle.removeObserver(observer)
                view.keepScreenOn = false
                vm.player.stop()
                vm.speaker.stop()
            }
        }
        val lang = vm.lang
        CompositionLocalProvider(
            LocalLang provides lang,
            LocalLineSpacing provides vm.lineSpacing,
            LocalLayoutDirection provides if (lang == Lang.Ur) LayoutDirection.Rtl else LayoutDirection.Ltr,
        ) {
            IqraTheme(colours) {
                // Back steps back through the Quran screens, then from its home screen to Cable TV.
                BackHandler { if (!vm.back()) onClose() }
                Box(
                    Modifier.fillMaxSize().onPreviewKeyEvent { e ->
                        // The remote's Play/Pause key pauses and resumes the recitation.
                        val code = e.nativeKeyEvent.keyCode
                        val media = code == AndroidKeyEvent.KEYCODE_MEDIA_PLAY_PAUSE ||
                            code == AndroidKeyEvent.KEYCODE_MEDIA_PLAY || code == AndroidKeyEvent.KEYCODE_MEDIA_PAUSE
                        if (media && e.nativeKeyEvent.action == AndroidKeyEvent.ACTION_DOWN && e.nativeKeyEvent.repeatCount == 0) {
                            vm.player.togglePause()
                        }
                        media
                    },
                ) {
                    when (val s = vm.screen) {
                        Screen.Home -> HomeScreen(vm)
                        Screen.QaidaMap -> QaidaMapScreen(vm)
                        is Screen.QaidaLesson -> QaidaLessonScreen(vm, s.id)
                        is Screen.QaidaQuiz -> QaidaQuizScreen(vm, s.id)
                        is Screen.SurahList -> SurahListScreen(vm, s.forHifz, s.kids)
                        is Screen.Read -> ReadScreen(vm, s.surah, s.ayah, s.kids)
                        Screen.HifzHome -> HifzHomeScreen(vm)
                        is Screen.HifzSetup -> HifzSetupScreen(vm, s.surah)
                        is Screen.HifzSession -> HifzSessionScreen(vm, s)
                        Screen.Settings -> SettingsScreen(vm)
                    }
                }
            }
        }
    }

    /** Iqra Quran's colours taken from a Cable TV theme. */
    fun paletteFor(tv: TvPalette): QuranPalette {
        val accent = tv.secondary
        val onAccent = if (accent.luminance() > 0.45f) Color(0xFF111111) else Color.White
        return QuranPalette(
            id = "cabletv:${tv.name}",
            en = tv.name,
            ur = tv.name,
            background = tv.background,
            card = tv.surface,
            cardAlt = tv.surfaceVariant,
            arabic = tv.onSurface,
            text = tv.onSurface,
            muted = tv.onSurfaceVariant,
            accent = accent,
            onAccent = onAccent,
            highlight = lerp(tv.surfaceVariant, tv.primary, 0.35f),
            dark = tv.dark,
            bar = tv.accent,
            letterCard = tv.soft,
            letterText = tv.background,
        )
    }
}
