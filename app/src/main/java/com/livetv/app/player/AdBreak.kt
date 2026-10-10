package com.livetv.app.player

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * A full-screen ad break is on (Cable TV's sponsor ads, 1.9.66): the channel pauses underneath, like
 * YouTube, and goes back to live when the break ends. Set by the sponsor pop-up, watched by [PlayerScreen].
 */
object AdBreak {
    private val _active = MutableStateFlow(false)
    val active: StateFlow<Boolean> = _active

    fun set(on: Boolean) { _active.value = on }

    /** Skips the ad showing now (a picture ad, or a video ad) once Back may, after its first 5 seconds;
     *  null before that. Strip and Carousel call it on Back, since the list screen's Back comes first there. */
    @Volatile var pictureSkip: (() -> Unit)? = null
    @Volatile var videoSkip: (() -> Unit)? = null
    fun skip(): Boolean = (videoSkip ?: pictureSkip)?.let { it(); true } ?: false
}

/**
 * When the next full-screen ad break is due (elapsed realtime), kept by Cable TV's sponsor pop-up;
 * [enabled] is false in the editions without ads. A Library video in a site's own player (YouTube)
 * waits for the break before it starts, since no ad may cover that player (1.9.89).
 */
object AdTiming {
    @Volatile var enabled = false
    @Volatile var nextFullAt = Long.MAX_VALUE
}

/** A Library video playing now, so its ad breaks run like a channel's (1.9.89). [embed]: in YouTube's
 *  (or another site's) own player, where an ad may only come before it starts ([waiting] for it). */
data class LibraryVideo(val id: String, val embed: Boolean, val waiting: Boolean)

object LibraryAds {
    val now = MutableStateFlow<LibraryVideo?>(null)
}


/** The channel playing with sound in the big picture of Strip or Carousel mode, so the 10-minute ad
 *  breaks run there too, like on a full-screen channel (audit A21). Null when neither mode is playing one. */
object ModeAds {
    val now = MutableStateFlow<String?>(null)
}
