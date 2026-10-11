package com.livetv.app.ui

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.sparkweather.app.VideoActivity

/**
 * Plays a weather video the way Cable TV does: our locked film page in its own full-screen window
 * ([VideoActivity]), never YouTube's own screens. Back (or the video's end) comes back to the weather.
 */
@Composable
fun YouTubePlayer(videoId: String, title: String, onBack: () -> Unit, onEnded: () -> Unit = {}) {
    val context = LocalContext.current
    BackHandler(onBack = onBack)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == VideoActivity.RESULT_DONE) onEnded()
        if (result.resultCode == VideoActivity.RESULT_BLOCKED) {
            Toast.makeText(context, "This video can't play right now. Please pick another one.", Toast.LENGTH_LONG).show()
        }
        onBack()
    }
    var opened by rememberSaveable(videoId) { mutableStateOf(false) }
    LaunchedEffect(videoId) {
        if (!opened) {
            opened = true
            launcher.launch(VideoActivity.intent(context, videoId, title))
        }
    }
    Box(Modifier.fillMaxSize().background(Color.Black))
}
