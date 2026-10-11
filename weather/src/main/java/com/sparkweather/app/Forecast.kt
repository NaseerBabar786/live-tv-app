package com.sparkweather.app

import android.content.Context
import com.livetv.app.data.Location
import com.livetv.app.data.WeatherApp
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull

/** The weather for the widget and the morning forecast, loaded outside the app's screen. Call off the main thread. */
object Forecast {

    /**
     * The report for the place the app last showed ([own] = always the viewer's own place), the same way the
     * Weather screen picks it: the viewer's own place first, then the places they added.
     */
    fun load(context: Context, own: Boolean = false): WeatherApp.Report? {
        val app = context.applicationContext
        Location.init(app)
        WeatherApp.init(app)
        if (Location.hasPermission(app)) runBlocking { withTimeoutOrNull(15_000) { Location.refreshDevice(app) } }
        val mine = runCatching { Location.current() }.getOrNull()
        val others = WeatherApp.places().filterNot { p -> mine?.let { WeatherApp.same(it, p) } == true }
        val places = listOfNotNull(mine) + others
        val place = (if (own) places.firstOrNull() else places.getOrNull(WeatherApp.selected) ?: places.firstOrNull()) ?: return null
        return runCatching { WeatherApp.load(place) }.getOrNull()
    }

    /** "14°" with the place's unit implied, as on the Weather screen. */
    fun temperature(r: WeatherApp.Report) = "${r.current.temperature}°"

    /** "H 16° · L 8° · ☔ 40%" for today. */
    fun today(r: WeatherApp.Report): String {
        val d = r.today ?: return ""
        return "H ${d.high}° · L ${d.low}°" + if (d.rain > 0) " · ☔ ${d.rain}%" else ""
    }
}
