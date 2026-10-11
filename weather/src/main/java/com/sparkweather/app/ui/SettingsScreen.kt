package com.sparkweather.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.livetv.app.data.WeatherApp
import com.livetv.app.ui.Palette
import com.livetv.app.ui.PillShape
import com.livetv.app.ui.Themes
import com.livetv.app.ui.focusGlow
import com.sparkweather.app.MorningForecast
import kotlinx.coroutines.delay

/**
 * Spark Weather's Settings, in the chosen theme's colours: the theme, °C or °F, the morning forecast
 * (phones), how to add the widget (phones), and the app's version. Back closes it.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(tv: Boolean, version: String, onClose: () -> Unit) {
    BackHandler(onBack = onClose)
    val context = LocalContext.current
    val t = Themes.current
    var unit by remember { mutableStateOf(WeatherApp.fahrenheitChoice) }
    var morning by remember { mutableIntStateOf(MorningForecast.hour(context)) }
    val notifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val first = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        delay(80)
        runCatching { first.requestFocus() }
    }

    Box(Modifier.fillMaxSize().background(t.background)) {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = if (tv) 48.dp else 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Choice("‹ Back", on = false, modifier = Modifier.focusRequester(first), onClick = onClose)
                Spacer(Modifier.size(16.dp))
                Text("Settings", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = t.onSurface)
            }

            Section("Theme")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Themes.all.forEach { p -> ThemeChoice(p, on = p.name == t.name) { Themes.pick(p) } }
            }

            Section("Temperature")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Choice("Automatic", on = unit == null) { unit = null; WeatherApp.fahrenheitChoice = null }
                Choice("°C", on = unit == false) { unit = false; WeatherApp.fahrenheitChoice = false }
                Choice("°F", on = unit == true) { unit = true; WeatherApp.fahrenheitChoice = true }
            }

            if (!tv) {
                Section("Morning forecast")
                Note("A notification each morning with the day's weather where you are.")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(MorningForecast.OFF, 6, 7, 8, 9).forEach { h ->
                        Choice(if (h == MorningForecast.OFF) "Off" else "$h:00 am", on = morning == h) {
                            morning = h
                            MorningForecast.setHour(context, h)
                            if (h != MorningForecast.OFF && Build.VERSION.SDK_INT >= 33 &&
                                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                            ) runCatching { notifications.launch(Manifest.permission.POST_NOTIFICATIONS) }
                        }
                    }
                }

                Section("Home-screen widget")
                Note("Hold your finger on an empty part of your home screen, tap Widgets, then pick Spark Weather.")
            }

            Section("About")
            Note("Spark Weather is free: no ads, no payments and no sign-in. Made by Bulk Bazaar Inc., the makers of Cable TV.")
            Note("Weather: Open-Meteo.com · Radar: RainViewer · News: Bing News, Google News · Videos: weather channels on YouTube")
            Spacer(Modifier.height(4.dp))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) { VersionFooter(version) }
        }
    }
}

@Composable
private fun Section(title: String) {
    Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Themes.current.onSurface, modifier = Modifier.padding(top = 10.dp))
}

@Composable
private fun Note(text: String) {
    Text(text, fontSize = 14.sp, color = Themes.current.soft, modifier = Modifier.widthIn(max = 720.dp))
}

@Composable
private fun Choice(label: String, on: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val t = Themes.current
    Text(
        label,
        fontWeight = FontWeight.Bold,
        fontSize = 15.sp,
        color = if (on) Color.White else t.onSurface,
        modifier = modifier
            .focusGlow(PillShape)
            .background(if (on) t.primary else t.surfaceVariant, PillShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 9.dp),
    )
}

/** A theme to pick, drawn in its own colours. */
@Composable
private fun ThemeChoice(p: Palette, on: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        Modifier
            .focusGlow(shape)
            .background(p.surface, shape)
            .then(if (on) Modifier.background(p.primary.copy(alpha = 0.25f), shape) else Modifier)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(14.dp).background(p.primary, CircleShape))
        Spacer(Modifier.size(4.dp))
        Box(Modifier.size(14.dp).background(p.secondary, CircleShape))
        Spacer(Modifier.size(8.dp))
        Text((if (on) "✓ " else "") + p.name, color = p.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold)
    }
}

/** Material's colours (dialogs, buttons) from the chosen theme, like Cable TV. */
@Composable
fun SparkTheme(content: @Composable () -> Unit) {
    val p = Themes.current
    val base = if (p.dark) androidx.compose.material3.darkColorScheme() else androidx.compose.material3.lightColorScheme()
    MaterialTheme(
        colorScheme = base.copy(
            primary = p.primary,
            onPrimary = Color.White,
            secondary = p.secondary,
            onSecondary = Color.Black,
            background = p.background,
            onBackground = p.onSurface,
            surface = p.surface,
            onSurface = p.onSurface,
            surfaceVariant = p.surfaceVariant,
            onSurfaceVariant = p.onSurfaceVariant,
            surfaceContainer = p.surface,
            surfaceContainerLow = p.surface,
            surfaceContainerLowest = p.background,
            surfaceContainerHigh = p.surface,
            surfaceContainerHighest = p.surfaceVariant,
        ),
        content = content,
    )
}
