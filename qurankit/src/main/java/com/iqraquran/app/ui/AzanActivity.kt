package com.iqraquran.app.ui

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import com.iqraquran.app.data.AzanMode
import com.iqraquran.app.data.AzanSettings
import com.iqraquran.app.data.Prayer
import com.iqraquran.app.data.PrayerEvent
import com.iqraquran.app.data.PrayerTimes
import com.iqraquran.app.data.Store
import com.iqraquran.app.player.AzanPlayer
import java.util.Calendar
import java.util.Locale
import kotlinx.coroutines.delay

/**
 * The Azan on screen: the prayer, its time and a Stop button while the Azan plays (OK or Back stops it).
 * Opened at prayer time by the Iqra Quran app's alarm, and by Cable TV while it's on screen.
 */
open class AzanActivity : ComponentActivity() {

    private var player: AzanPlayer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        val prayer = runCatching { Prayer.valueOf(intent.getStringExtra(EXTRA_PRAYER)!!) }.getOrDefault(Prayer.Zuhr)
        val mode = runCatching { AzanMode.valueOf(intent.getStringExtra(EXTRA_MODE)!!) }.getOrDefault(AzanMode.Azan)
        val reminder = intent.getIntExtra(EXTRA_REMINDER, 0)
        val silent = intent.getBooleanExtra(EXTRA_SILENT, false)
        val at = intent.getLongExtra(EXTRA_AT, System.currentTimeMillis())
        val c = Calendar.getInstance().apply { timeInMillis = at + reminder * 60_000L }
        val timeText = PrayerTimes.format(c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE))
        val settings = AzanSettings(this)
        val voice = settings.voiceFor(prayer)
        val banner = this is AzanBannerActivity
        if (!silent) {
            val p = AzanPlayer(this).also { player = it }
            when {
                mode == AzanMode.Azan && !banner -> p.playAzan(settings, voice, settings.volume) { finish() }
                mode == AzanMode.Chime -> p.playChime()
                else -> Unit
            }
        }
        val store = Store(this)
        val lang = when (store.language) {
            "ur" -> Lang.Ur
            "en" -> Lang.En
            else -> if (Locale.getDefault().language == "ur") Lang.Ur else Lang.En
        }
        val look = hostPalette ?: Palettes.byId(
            store.themeId, Color(store.customBackground), Color(store.customText),
            Palettes.customSlots.associateWith { store.customColor(it) },
        )
        setContent {
            CompositionLocalProvider(
                LocalLang provides lang,
                LocalLayoutDirection provides if (lang == Lang.Ur) LayoutDirection.Rtl else LayoutDirection.Ltr,
            ) {
                if (banner) {
                    // The banner keeps whatever is behind it going; it goes away by itself.
                    androidx.compose.material3.MaterialTheme {
                        androidx.compose.runtime.CompositionLocalProvider(LocalPalette provides look) {
                            AzanBanner(prayer, timeText, reminder) { finish() }
                        }
                    }
                    LaunchedEffect(Unit) {
                        delay(BANNER_MS)
                        finish()
                    }
                } else {
                    IqraTheme(look) {
                        AzanFullScreen(prayer, timeText, if (silent) "" else voice?.credit.orEmpty(), reminder) { finish() }
                        // Without sound (another app plays it) the screen stays as long as an Azan lasts.
                        if (silent || mode != AzanMode.Azan) LaunchedEffect(Unit) {
                            delay(if (silent && mode == AzanMode.Azan) SILENT_MS else BANNER_MS)
                            finish()
                        }
                    }
                }
            }
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Any of the remote's media keys, or Back, ends it.
        if (event.keyCode == KeyEvent.KEYCODE_MEDIA_STOP || event.keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
            if (event.action == KeyEvent.ACTION_UP) finish()
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onDestroy() {
        player?.stop()
        player = null
        // Silent here because the Iqra Quran app plays the Azan: closing this screen stops it there too.
        if (intent.getBooleanExtra(EXTRA_SILENT, false)) {
            runCatching { sendBroadcast(Intent(ACTION_STOP).setPackage(IQRA_PACKAGE)) }
        }
        super.onDestroy()
    }

    companion object {
        const val EXTRA_PRAYER = "prayer"
        const val EXTRA_MODE = "mode"
        const val EXTRA_AT = "at"
        const val EXTRA_REMINDER = "reminder"
        const val EXTRA_SILENT = "silent"
        /** Stops the Azan the Iqra Quran app is playing (its AzanService). */
        const val ACTION_STOP = "com.iqraquran.app.STOP_AZAN"
        const val IQRA_PACKAGE = "com.naseerbabar.iqraquran"
        private const val BANNER_MS = 12_000L
        private const val SILENT_MS = 150_000L

        /** Set by an app that shows these screens in its own colours (Cable TV). */
        @Volatile
        var hostPalette: Palette? = null

        /** True while an Azan screen is up (Cable TV quiets its YouTube channels meanwhile). */
        @Volatile
        var showing = false
            internal set

        /** The screen for [e]: full screen for the Azan, a banner for a chime, a message or a reminder. */
        fun intent(context: Context, e: PrayerEvent, silent: Boolean = false): Intent {
            val full = e.mode == AzanMode.Azan && !e.reminder
            val cls = if (full) AzanActivity::class.java else AzanBannerActivity::class.java
            return Intent(context, cls)
                .putExtra(EXTRA_PRAYER, e.prayer.name)
                .putExtra(EXTRA_MODE, e.mode.name)
                .putExtra(EXTRA_AT, e.at)
                .putExtra(EXTRA_REMINDER, if (e.reminder) AzanSettings(context).reminderMinutes else 0)
                .putExtra(EXTRA_SILENT, silent)
        }
    }

    override fun onStart() {
        super.onStart()
        if (this !is AzanBannerActivity) showing = true
    }

    override fun onStop() {
        super.onStop()
        if (this !is AzanBannerActivity) showing = false
        // Leaving the Azan screen (Home) stops the Azan too.
        if (!isChangingConfigurations) finish()
    }
}

/** The see-through version: a banner along the top, the screen behind keeps playing. */
class AzanBannerActivity : AzanActivity()
