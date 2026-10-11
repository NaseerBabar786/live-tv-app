package com.sparkweather.app

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import java.util.Calendar

/**
 * The morning forecast (phones, off until the viewer picks an hour in Settings): each morning a notification
 * with the day's weather where the viewer is. An inexact daily alarm, so it needs no special permission;
 * set again after a restart or an update.
 */
class MorningForecast : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (hour(context) == OFF) return
        val done = goAsync()
        Thread {
            try {
                Forecast.load(context, own = true)?.let { r ->
                    val title = "${r.place.city.ifBlank { "Today" }}: ${Forecast.temperature(r)} ${r.current.icon} ${r.current.sky}"
                    val text = listOf(Forecast.today(r), r.nowcast().orEmpty(), r.tip()).filter { it.isNotBlank() }.joinToString("\n")
                    notify(context, title, text)
                }
            } catch (_: Throwable) {
                // Nothing shows this morning; tomorrow's alarm still comes.
            } finally {
                done.finish()
            }
        }.start()
    }

    /** Sets the alarm again after the phone restarts, the app updates or the time zone changes. */
    class Reschedule : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = schedule(context)
    }

    companion object {
        const val OFF = -1
        private const val PREFS = "morning_forecast"
        private const val K_HOUR = "hour"
        private const val CHANNEL = "morning"

        fun hour(context: Context): Int =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(K_HOUR, OFF)

        fun setHour(context: Context, hour: Int) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(K_HOUR, hour).apply()
            schedule(context)
        }

        /** Sets (or clears) the daily alarm for the chosen hour. */
        fun schedule(context: Context) {
            val alarms = context.getSystemService(AlarmManager::class.java) ?: return
            val pending = PendingIntent.getBroadcast(
                context, 0, Intent(context, MorningForecast::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            alarms.cancel(pending)
            val h = hour(context)
            if (h == OFF) return
            val next = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, h)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
                if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
            }
            alarms.setInexactRepeating(AlarmManager.RTC_WAKEUP, next.timeInMillis, AlarmManager.INTERVAL_DAY, pending)
        }

        private fun notify(context: Context, title: String, text: String) {
            if (Build.VERSION.SDK_INT >= 33 &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) return
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "Morning forecast", NotificationManager.IMPORTANCE_DEFAULT),
            )
            val open = PendingIntent.getActivity(
                context, 0,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val n = android.app.Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(text.lineSequence().firstOrNull().orEmpty())
                .setStyle(android.app.Notification.BigTextStyle().bigText(text))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            manager.notify(1, n)
        }
    }
}
