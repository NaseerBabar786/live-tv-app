package com.livetv.app.extras

import android.content.Context
import android.media.AudioManager
import android.text.format.DateFormat
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.random.Random

/** No button for this long, with nothing playing, brings the screensaver. */
private const val IDLE_MS = 10 * 60_000L

/**
 * Screensaver (owner, 2026-10-09): after 10 minutes with no button pressed and nothing playing (no sound; a menu
 * or a section left open), a big clock with the date, the weather and the next Azan on black. It moves to a new
 * spot every minute to protect the TV. Any button closes it (MainActivity takes that press). Free for everyone.
 */
@Composable
fun Screensaver() {
    val context = LocalContext.current
    val audio = remember { context.getSystemService(Context.AUDIO_SERVICE) as AudioManager }
    val on by Extras.screensaverOn.collectAsStateWithLifecycle()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            Extras.touch()
            while (true) {
                delay(15_000)
                val idle = System.currentTimeMillis() - Extras.lastInput >= IDLE_MS
                if (idle && !audio.isMusicActive) Extras.screensaverOn.value = true
            }
        }
    }
    AnimatedVisibility(visible = on, enter = fadeIn(), exit = fadeOut()) {
        SaverFace()
    }
}

@Composable
private fun SaverFace() {
    val context = LocalContext.current
    val weather = rememberWeatherNow()
    val prayers = rememberPrayers()
    var now by remember { mutableStateOf(Date()) }
    var spot by remember { mutableStateOf(0.5f to 0.5f) }
    LaunchedEffect(Unit) {
        while (true) {
            now = Date()
            delay(60_000 - System.currentTimeMillis() % 60_000)
            spot = Random.nextFloat() to Random.nextFloat()
        }
    }
    val time = remember(now) { SimpleDateFormat(if (DateFormat.is24HourFormat(context)) "H:mm" else "h:mm", Locale.getDefault()).format(now) }
    val date = remember(now) {
        val locale = Locale.getDefault()
        SimpleDateFormat(DateFormat.getBestDateTimePattern(locale, "EEEEMMMMd"), locale).format(now)
    }
    BoxWithConstraints(Modifier.fillMaxSize().background(Color.Black)) {
        val boxW = 420.dp
        val boxH = 260.dp
        val x = (maxWidth - boxW).coerceAtLeast(0.dp) * spot.first
        val y = (maxHeight - boxH).coerceAtLeast(0.dp) * spot.second
        Column(Modifier.offset(x, y).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(time, color = Color.White.copy(alpha = 0.85f), fontSize = 96.sp, fontWeight = FontWeight.Light)
            Text(date, color = Color.White.copy(alpha = 0.7f), fontSize = 24.sp)
            weather?.let { Text("$it", color = Color.White.copy(alpha = 0.7f), fontSize = 24.sp, modifier = Modifier.padding(top = 6.dp)) }
            nextAzanText(prayers, now.time)?.let {
                Text("🕌 $it", color = Color(0xFFFFD54F).copy(alpha = 0.8f), fontSize = 22.sp, modifier = Modifier.padding(top = 6.dp))
            }
        }
        Box(Modifier.align(Alignment.BottomCenter).padding(12.dp)) {
            Text("Press any button to go back", color = Color.White.copy(alpha = 0.3f), fontSize = 14.sp)
        }
    }
}
