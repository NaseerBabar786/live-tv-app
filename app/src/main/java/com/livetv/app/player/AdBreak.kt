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

/**
 * Sponsor ads for the breaks between videos on our YouTube channel pages (WebChannelActivity, 1.9.89):
 * [json] gives today's sponsors for the page (a JSON list), [seen] counts one that played.
 * Filled in by Cable TV; nothing in the other editions.
 */
object PageAds {
    @Volatile var json: () -> String = { "[]" }
    @Volatile var seen: (id: String) -> Unit = {}
}
