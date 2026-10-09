package com.livetv.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livetv.app.player.AdBreak
import com.livetv.app.player.ModeAds
import com.livetv.app.player.StreamPlayer

/**
 * The ad breaks in Strip and Carousel mode (audit A21): while [channelId] plays in the big picture with
 * sound, the breaks come every 10 minutes as on a full-screen channel; the big picture pauses for the
 * break and goes back to live afterwards. [channelId] null: nothing of ours plays there (a YouTube page,
 * no sound, or the mode is covered). Returns whether a break is on, so the mode leaves the remote alone.
 */
@Composable
fun modeAdBreak(stream: StreamPlayer, channelId: String?): State<Boolean> {
    DisposableEffect(channelId) {
        ModeAds.now.value = channelId
        onDispose { if (ModeAds.now.value == channelId) ModeAds.now.value = null }
    }
    val adBreak = AdBreak.active.collectAsStateWithLifecycle()
    var pausedForAds by remember { mutableStateOf(false) }
    val on by adBreak
    LaunchedEffect(on) {
        val p = stream.player
        if (on && channelId != null) {
            pausedForAds = true
            p.pause()
        } else if (!on && pausedForAds) {
            pausedForAds = false
            if (p.isCurrentMediaItemLive) p.seekToDefaultPosition()
            p.play()
        }
    }
    return adBreak
}
