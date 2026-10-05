package com.iqraquran.app

import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.iqraquran.app.ui.AppViewModel
import com.iqraquran.app.ui.HifzHomeScreen
import com.iqraquran.app.ui.HifzSessionScreen
import com.iqraquran.app.ui.HifzSetupScreen
import com.iqraquran.app.ui.HomeScreen
import com.iqraquran.app.ui.IqraTheme
import com.iqraquran.app.ui.Lang
import com.iqraquran.app.ui.LocalLang
import com.iqraquran.app.ui.QaidaLessonScreen
import com.iqraquran.app.ui.QaidaMapScreen
import com.iqraquran.app.ui.QaidaQuizScreen
import com.iqraquran.app.ui.ReadScreen
import com.iqraquran.app.ui.Screen
import com.iqraquran.app.ui.SettingsScreen
import com.iqraquran.app.ui.SurahListScreen
import com.iqraquran.app.ui.UpdateDialog
import com.iqraquran.app.ui.UpdateState
import com.iqraquran.app.ui.UpdateViewModel

class MainActivity : ComponentActivity() {

    private val vm: AppViewModel by viewModels()
    private val updates: UpdateViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Recitation and Hifz repeats run for a while without touching the screen.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContent {
            val lang = vm.lang
            CompositionLocalProvider(
                LocalLang provides lang,
                LocalLayoutDirection provides if (lang == Lang.Ur) LayoutDirection.Rtl else LayoutDirection.Ltr,
            ) {
                IqraTheme {
                    BackHandler(enabled = vm.stack.size > 1) { vm.back() }
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
                        Screen.Settings -> SettingsScreen(vm, updates.installedVersion)
                    }
                    val update by updates.update.collectAsStateWithLifecycle()
                    UpdateDialog(
                        state = update,
                        onInstall = { (update as? UpdateState.ReadyToInstall)?.let { updates.install(it.release) } },
                        onDismiss = updates::dismiss,
                    )
                }
            }
        }
    }

    /** The remote's Play/Pause key controls the recitation anywhere in the app. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) vm.player.togglePause()
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onStop() {
        super.onStop()
        // Leaving the app stops the recitation, like a TV app should.
        if (!isChangingConfigurations) {
            vm.player.stop()
            vm.speaker.stop()
        }
    }
}
