package com.livetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.livetv.app.data.Location
import com.livetv.app.data.WeatherApp
import java.io.File

fun main(args: Array<String>) {
    val json = File(args[0]).readText()
    val r = WeatherApp.parse(json, Location.Place(44.11, -77.57, "Quinte West", "CA", "Ontario"), false)
    File(args[1]).mkdirs()
    for (t in Themes.all) {
        Themes.pick(t)
        val scene = ImageComposeScene(1920, 1080, Density(2f)) {
            CompositionLocalProvider(LocalContentColor provides t.onSurface) {
                Box(Modifier.fillMaxSize().background(SkyBottom)) {
                    SkyBackdrop(r.current.code, r.current.day)
                    Box(Modifier.padding(24.dp)) { HomeTab(r, emptyList(), true, {}, {}, {}) }
                }
            }
        }
        scene.render(0)
        val img = scene.render(1_000_000_000L)
        File(args[1], t.name.replace(" ", "-") + ".png").writeBytes(org.jetbrains.skia.Image.makeFromBitmap(org.jetbrains.skia.Bitmap.makeFromImage(img)).encodeToData()!!.bytes)
        scene.close()
    }
}

@androidx.compose.runtime.Composable
fun RadarStub(place: Location.Place, mini: Boolean, modifier: Modifier) {
    Box(modifier.background(Color(0xFF1C2233)))
}
