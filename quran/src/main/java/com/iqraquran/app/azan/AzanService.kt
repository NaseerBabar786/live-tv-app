package com.iqraquran.app.azan

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.iqraquran.app.MainActivity
import com.iqraquran.app.R
import com.iqraquran.app.data.AzanMode
import com.iqraquran.app.data.AzanSettings
import com.iqraquran.app.data.Prayer
import com.iqraquran.app.data.PrayerTimes
import com.iqraquran.app.player.AzanPlayer
import java.util.Calendar

/** Plays the Azan with a notification (Stop button) while it lasts, even when the app is closed. */
class AzanService : Service() {

    private var player: AzanPlayer? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prayer = prayerOf(intent?.getStringExtra(EXTRA_PRAYER))
        val at = intent?.getLongExtra(EXTRA_AT, System.currentTimeMillis()) ?: System.currentTimeMillis()
        val notification = AzanNotifications.build(this, prayer, AzanMode.Azan, false, at, ongoing = true)
        val type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
        runCatching { ServiceCompat.startForeground(this, AzanNotifications.ID_PLAYING, notification, type) }
            .onFailure { stopSelf(); return START_NOT_STICKY }
        val settings = AzanSettings(this)
        player?.stop()
        player = AzanPlayer(this).also { p ->
            p.playAzan(settings, settings.voiceFor(prayer), settings.volume) { stopSelf() }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        player?.stop()
        player = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_PRAYER = "prayer"
        const val EXTRA_MODE = "mode"
        const val EXTRA_REMINDER = "reminder"
        const val EXTRA_AT = "at"
    }
}

/** The prayer-time notifications. */
object AzanNotifications {
    const val ID_PLAYING = 4100
    private const val ID_MESSAGE = 4101
    private const val CH_AZAN = "azan"
    private const val CH_CHIME = "azan_chime"
    private const val CH_MESSAGE = "azan_message"

    private fun channels(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = context.getSystemService(NotificationManager::class.java)
        // The Azan's own sound comes from the player, so its notification is silent.
        nm.createNotificationChannel(NotificationChannel(CH_AZAN, "Azan", NotificationManager.IMPORTANCE_HIGH).apply { setSound(null, null) })
        nm.createNotificationChannel(NotificationChannel(CH_CHIME, "Prayer time chime", NotificationManager.IMPORTANCE_HIGH))
        nm.createNotificationChannel(NotificationChannel(CH_MESSAGE, "Prayer time message", NotificationManager.IMPORTANCE_HIGH).apply { setSound(null, null) })
    }

    fun build(context: Context, prayer: Prayer, mode: AzanMode, reminder: Boolean, at: Long, ongoing: Boolean = false): Notification {
        channels(context)
        val urdu = context.getSharedPreferences("iqra_quran", Context.MODE_PRIVATE).getString("language", null) == "ur"
        val name = if (urdu) prayer.ur else prayer.en
        val minutes = AzanSettings(context).reminderMinutes
        val prayerAt = if (reminder) at + minutes * 60_000L else at
        val c = Calendar.getInstance().apply { timeInMillis = prayerAt }
        val time = PrayerTimes.format(c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE))
        val title = when {
            reminder && urdu -> "$name $minutes منٹ میں"
            reminder -> "$name in $minutes minutes"
            urdu -> "$name کا وقت ہو گیا"
            else -> "It's time for $name"
        }
        val open = PendingIntent.getActivity(
            context, 1, Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_OPEN_NAMAZ, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val channel = when {
            ongoing -> CH_AZAN
            mode == AzanMode.Chime -> CH_CHIME
            else -> CH_MESSAGE
        }
        return NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(title)
            .setContentText(time)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(open)
            .setAutoCancel(!ongoing)
            .setOngoing(ongoing)
            .apply {
                if (mode != AzanMode.Chime) setSilent(true)
                if (ongoing) {
                    val stop = PendingIntent.getBroadcast(
                        context, 2, Intent(context, AzanStopReceiver::class.java),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    )
                    addAction(0, if (urdu) "اذان بند کریں" else "Stop Azan", stop)
                    setDeleteIntent(stop)
                }
            }
            .build()
    }

    fun show(context: Context, prayer: Prayer, mode: AzanMode, reminder: Boolean, at: Long) {
        runCatching {
            context.getSystemService(NotificationManager::class.java)
                .notify(ID_MESSAGE, build(context, prayer, mode, reminder, at))
        }
    }
}
