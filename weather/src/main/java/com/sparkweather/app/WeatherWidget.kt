package com.sparkweather.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * The home-screen widget: the weather now where the viewer is (or the place the app last showed), with
 * today's high and low. Android refreshes it every 30 minutes, and the app refreshes it when it closes.
 * A tap opens the app.
 */
class WeatherWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val done = goAsync()
        Thread {
            try {
                val r = Forecast.load(context)
                val views = RemoteViews(context.packageName, R.layout.weather_widget).apply {
                    setOnClickPendingIntent(R.id.widget_root, openApp(context))
                    if (r == null) {
                        setTextViewText(R.id.widget_icon, "⛅")
                        setTextViewText(R.id.widget_temp, "--°")
                        setTextViewText(R.id.widget_place, "Spark Weather")
                        setTextViewText(R.id.widget_sky, "Tap to open")
                        setTextViewText(R.id.widget_today, "")
                    } else {
                        setTextViewText(R.id.widget_icon, r.current.icon)
                        setTextViewText(R.id.widget_temp, Forecast.temperature(r))
                        setTextViewText(R.id.widget_place, r.place.city.ifBlank { "My place" })
                        setTextViewText(R.id.widget_sky, r.current.sky)
                        setTextViewText(R.id.widget_today, Forecast.today(r))
                    }
                }
                ids.forEach { manager.updateAppWidget(it, views) }
            } catch (_: Throwable) {
                // The next refresh tries again; a widget never closes anything.
            } finally {
                done.finish()
            }
        }.start()
    }

    companion object {
        private fun openApp(context: Context): PendingIntent = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        /** Redraws every Spark Weather widget on the home screen (none: nothing happens). */
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context) ?: return
            val ids = runCatching { manager.getAppWidgetIds(ComponentName(context, WeatherWidget::class.java)) }.getOrNull()
            if (ids == null || ids.isEmpty()) return
            context.sendBroadcast(
                Intent(context, WeatherWidget::class.java)
                    .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids),
            )
        }
    }
}
