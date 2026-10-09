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
import com.iqraquran.app.azan.AzanAlarms
import com.iqraquran.app.data.AzanSettings
import com.iqraquran.app.ui.AppViewModel
import com.iqraquran.app.ui.HifzHomeScreen
import com.iqraquran.app.ui.HifzSessionScreen
import com.iqraquran.app.ui.HifzSetupScreen
import com.iqraquran.app.ui.HomeScreen
import com.iqraquran.app.ui.NamazAddSurahScreen
import com.iqraquran.app.ui.NamazDuasScreen
import com.iqraquran.app.ui.NamazHomeScreen
import com.iqraquran.app.ui.NamazRakatsScreen
import com.iqraquran.app.ui.NamazStepScreen
import com.iqraquran.app.ui.NamazSurahsScreen
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
import com.iqraquran.app.ui.PrayerScreen
import com.iqraquran.app.ui.AzanSettingsScreen
import com.iqraquran.app.ui.SurahListScreen
import com.iqraquran.app.ui.UpdateDialog
import com.iqraquran.app.ui.UpdateViewModel
import com.iqraquran.app.ui.VersionFooter
import com.iqraquran.app.ui.pendingRelease

class MainActivity : ComponentActivity() {

    companion object {
        /** Opens the Namaz screen (tapping a prayer-time notification). */
        const val EXTRA_OPEN_NAMAZ = "open_namaz"
    }

    private val vm: AppViewModel by viewModels()
    private val updates: UpdateViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (CrashGuard.start(this)) return
        // Any Azan setting change sets the next alarm; so does every start.
        AzanSettings.changed = { AzanAlarms.schedule(it) }
        // Prayer times for where the device is (when allowed), else a guess from the internet connection.
        AzanSettings.placeSource = { com.iqraquran.app.data.DevicePlace.find(applicationContext) }
        AzanAlarms.schedule(this)
        if (intent?.getBooleanExtra(EXTRA_OPEN_NAMAZ, false) == true) vm.open(Screen.Prayer)
        askForNotifications()
        enableEdgeToEdge()
        // Recitation and Hifz repeats run for a while without touching the screen.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContent {
            val lang = vm.lang
            CompositionLocalProvider(
                LocalLang provides lang,
                LocalLineSpacing provides vm.lineSpacing,
                LocalLayoutDirection provides if (lang == Lang.Ur) LayoutDirection.Rtl else LayoutDirection.Ltr,
            ) {
                IqraTheme(vm.palette) {
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
                        Screen.Settings -> SettingsScreen(vm) { VersionFooter(updates.installedVersion) }
                        Screen.Prayer -> PrayerScreen(vm)
                        Screen.AzanSettings -> AzanSettingsScreen(vm)
                        Screen.NamazHome -> NamazHomeScreen(vm)
                        is Screen.NamazStep -> NamazStepScreen(vm, s.index)
                        Screen.NamazRakats -> NamazRakatsScreen(vm)
                        Screen.NamazDuas -> NamazDuasScreen(vm)
                        Screen.NamazSurahs -> NamazSurahsScreen(vm)
                        Screen.NamazAddSurah -> NamazAddSurahScreen(vm)
                    }
                    val update by updates.update.collectAsStateWithLifecycle()
                    UpdateDialog(
                        state = update,
                        onInstall = { update.pendingRelease?.let { updates.install(it) } },
                        onDismiss = updates::dismiss,
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        if (intent.getBooleanExtra(EXTRA_OPEN_NAMAZ, false) && vm.screen != Screen.Prayer) vm.open(Screen.Prayer)
    }

    /**
     * Asks once for what the Azan needs: notifications (Android 13 and later), so it can play when the app is
     * closed, and the approximate location, so the prayer times are for the viewer's own town.
     */
    private fun askForNotifications() {
        val prefs = getSharedPreferences("iqra_quran", MODE_PRIVATE)
        val wanted = buildList {
            if (android.os.Build.VERSION.SDK_INT >= 33 && !prefs.getBoolean("asked_notifications", false) &&
                checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
            ) add(android.Manifest.permission.POST_NOTIFICATIONS)
            if (!prefs.getBoolean("asked_location", false) &&
                checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED
            ) add(android.Manifest.permission.ACCESS_COARSE_LOCATION)
        }
        if (wanted.isEmpty()) return
        prefs.edit().putBoolean("asked_notifications", true).putBoolean("asked_location", true).apply()
        requestPermissions(wanted.toTypedArray(), 7)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        // Location just allowed: work the prayer times out for here.
        if (requestCode == 7 && com.iqraquran.app.data.DevicePlace.allowed(this)) vm.findPlaceAgain()
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
