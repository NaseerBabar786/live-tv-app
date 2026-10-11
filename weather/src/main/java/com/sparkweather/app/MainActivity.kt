package com.sparkweather.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.data.Location
import com.livetv.app.data.WeatherApp
import com.livetv.app.ui.DeviceLocation
import com.livetv.app.ui.Themes
import com.livetv.app.ui.WeatherScreen
import com.livetv.app.ui.isTv
import com.sparkweather.app.ui.SettingsScreen
import com.sparkweather.app.ui.SparkTheme
import com.sparkweather.app.ui.UpdateDialog
import com.sparkweather.app.ui.UpdateViewModel
import com.sparkweather.app.ui.pendingRelease

/**
 * Spark Weather: Cable TV's Weather section as the whole app, on phones and TVs. Free, with no ads,
 * payments or sign-in. Its own extras are Settings (theme, °C/°F, morning forecast), the home-screen
 * widget and the morning forecast notification.
 */
class MainActivity : ComponentActivity() {

    private val updates: UpdateViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (CrashGuard.start(this)) return
        Location.init(this)
        WeatherApp.init(this)
        Themes.init(this)
        MorningForecast.schedule(this)
        enableEdgeToEdge()
        val tv = isTv(this)
        setContent {
            SparkTheme {
                // Phones ask once for the approximate location; TVs use their internet connection's place.
                DeviceLocation(ask = !tv)
                var settings by rememberSaveable { mutableStateOf(false) }
                if (settings) {
                    SettingsScreen(tv = tv, version = updates.installedVersion, onClose = { settings = false })
                } else {
                    WeatherScreen(onClose = { finish() }, onSettings = { settings = true })
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

    override fun onStop() {
        super.onStop()
        // The widget shows what was just looked at (a new place, °C or °F).
        WeatherWidget.refresh(this)
    }
}
