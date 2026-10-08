package com.iqraquran.app.azan

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import com.iqraquran.app.data.AzanMode
import com.iqraquran.app.data.AzanSettings
import com.iqraquran.app.data.Prayer

/**
 * Sets one alarm, for the next Azan, chime, message or reminder; when it goes off, the next one is set.
 * Also set again after the phone restarts, the clock or time zone changes, or a setting changes.
 */
object AzanAlarms {

    fun schedule(context: Context) {
        val app = context.applicationContext
        val am = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pending = PendingIntent.getBroadcast(
            app, 0, Intent(app, AzanReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        am.cancel(pending)
        val next = AzanSettings(app).nextEvent() ?: return
        val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        runCatching {
            when {
                // Shown as an alarm clock, so phones let it ring on time even in battery saving.
                exact && Build.VERSION.SDK_INT >= 21 -> am.setAlarmClock(AlarmManager.AlarmClockInfo(next.at, null), pending)
                Build.VERSION.SDK_INT >= 23 -> am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.at, pending)
                else -> am.set(AlarmManager.RTC_WAKEUP, next.at, pending)
            }
        }
    }
}

/** The alarm went off: play the Azan (or chime, or show the message) for the prayer due now, then set the next alarm. */
class AzanReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val settings = AzanSettings(context)
        // The event due now: the next one as of a minute ago.
        val due = settings.nextEvent(System.currentTimeMillis() - 90_000L)
        if (due != null && due.at <= System.currentTimeMillis() + 60_000L) {
            val service = Intent(context, AzanService::class.java)
                .putExtra(AzanService.EXTRA_PRAYER, due.prayer.name)
                .putExtra(AzanService.EXTRA_MODE, due.mode.name)
                .putExtra(AzanService.EXTRA_REMINDER, due.reminder)
                .putExtra(AzanService.EXTRA_AT, due.at)
            if (due.mode == AzanMode.Azan && !due.reminder) {
                runCatching { ContextCompat.startForegroundService(context, service) }
                    .onFailure { AzanNotifications.show(context, due.prayer, AzanMode.Chime, due.reminder, due.at) }
            } else {
                AzanNotifications.show(context, due.prayer, due.mode, due.reminder, due.at)
            }
        }
        AzanAlarms.schedule(context)
    }
}

/** Sets the alarm again after a restart, an app update or a clock or time zone change. */
class AzanRescheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) = AzanAlarms.schedule(context)
}

/** "Stop" from the notification, or from Cable TV's Azan screen. */
class AzanStopReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        context.stopService(Intent(context, AzanService::class.java))
    }
}

internal fun prayerOf(name: String?): Prayer = runCatching { Prayer.valueOf(name!!) }.getOrDefault(Prayer.Zuhr)
