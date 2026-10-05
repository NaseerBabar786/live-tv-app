package com.multichat.app.web

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Shader
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.multichat.app.MainActivity
import com.multichat.app.R
import com.multichat.app.data.Account
import com.multichat.app.data.Lock
import com.multichat.app.data.Rules
import com.multichat.app.data.Store
import java.util.Calendar

/** Shows each account's new-message notifications, labelled with the account's name, colour and photo. */
object Notifier {

    const val CHANNEL_MESSAGES = "messages"
    const val CHANNEL_RUNNING = "running"
    const val EXTRA_ACCOUNT = "account"

    /** The account on screen while the app is open; its messages need no notification. */
    @Volatile
    var onScreen: String? = null

    /** The last few lines per account, so one notification per account lists them. */
    private val lines = HashMap<String, ArrayDeque<String>>()

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_MESSAGES, "New messages", NotificationManager.IMPORTANCE_HIGH)
                .apply { description = "New messages in your accounts" },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_RUNNING, "Running in the background", NotificationManager.IMPORTANCE_MIN)
                .apply { description = "Shows while Multi Chat keeps your accounts connected" },
        )
    }

    fun show(context: Context, accountId: String, title: String, body: String) {
        val acc = Store.account(accountId) ?: return
        val now = Calendar.getInstance().let { it.get(Calendar.HOUR_OF_DAY) * 60 + it.get(Calendar.MINUTE) }
        if (acc.muted || Rules.inQuietHours(acc.quietOn, acc.quietFrom, acc.quietTo, now)) return
        if (onScreen == accountId) return
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val hidden = Store.settings.value.hidePreview || Lock.locked.value
        val line = if (hidden) "New message" else listOf(title, body).filter { it.isNotBlank() }.joinToString(": ")
        val list = synchronized(lines) {
            lines.getOrPut(accountId) { ArrayDeque() }.apply {
                addLast(line.take(200))
                while (size > 6) removeFirst()
            }.toList()
        }
        val open = PendingIntent.getActivity(
            context,
            accountId.hashCode(),
            Intent(context, MainActivity::class.java)
                .putExtra(EXTRA_ACCOUNT, accountId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_chat)
            .setColor(acc.color)
            .setLargeIcon(avatar(acc, 128))
            .setContentTitle(if (hidden || title.isBlank()) acc.name else "${acc.name} · $title")
            .setContentText(list.last())
            .setSubText(acc.name)
            .setStyle(NotificationCompat.InboxStyle().also { s -> list.forEach { s.addLine(it) } }.setBigContentTitle(acc.name))
            .setNumber(list.size)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(accountId.hashCode(), n) }
    }

    /** Clears an account's notification when it is opened. */
    fun clear(context: Context, accountId: String) {
        synchronized(lines) { lines.remove(accountId) }
        NotificationManagerCompat.from(context).cancel(accountId.hashCode())
    }

    /** The account's photo in a circle, or its colour with initials. */
    fun avatar(acc: Account, size: Int): Bitmap {
        val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val photo = acc.photo?.let { runCatching { BitmapFactory.decodeFile(it) }.getOrNull() }
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        if (photo != null) {
            val scaled = Bitmap.createScaledBitmap(photo, size, size, true)
            paint.shader = BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
            canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
        } else {
            paint.color = acc.color
            canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
            paint.color = Color.WHITE
            paint.textSize = size * 0.38f
            paint.textAlign = Paint.Align.CENTER
            paint.isFakeBoldText = true
            val y = size / 2f - (paint.descent() + paint.ascent()) / 2f
            canvas.drawText(Rules.initials(acc.name), size / 2f, y, paint)
        }
        return out
    }
}
