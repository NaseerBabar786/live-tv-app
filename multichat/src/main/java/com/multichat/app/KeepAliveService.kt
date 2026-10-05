package com.multichat.app

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.multichat.app.data.Store
import com.multichat.app.web.Notifier
import com.multichat.app.web.WebPool

/**
 * Keeps Multi Chat's process alive with a quiet "running" notification, so the accounts stay
 * connected and their message notifications arrive while the app is in the background.
 * If Android restarts it on its own, it opens the accounts again without a screen.
 */
class KeepAliveService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Store.init(this)
        Notifier.createChannels(this)
        WebPool.init(application)
        WebPool.setTextZoom(Store.settings.value.textZoom)
        WebPool.sync(Store.accounts.value)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Store.settings.value.keepRunning || Store.accounts.value.isEmpty()) {
            stopSelf()
            return START_NOT_STICKY
        }
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val count = Store.accounts.value.size
        val n = NotificationCompat.Builder(this, Notifier.CHANNEL_RUNNING)
            .setSmallIcon(R.drawable.ic_stat_chat)
            .setContentTitle("Multi Chat is connected")
            .setContentText(if (count == 1) "1 account" else "$count accounts")
            .setContentIntent(open)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
        val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        runCatching { ServiceCompat.startForeground(this, 1, n, type) }.onFailure { stopSelf() }
        return START_STICKY
    }

    companion object {
        fun start(context: Context) {
            runCatching { ContextCompat.startForegroundService(context, Intent(context, KeepAliveService::class.java)) }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, KeepAliveService::class.java))
        }
    }
}
