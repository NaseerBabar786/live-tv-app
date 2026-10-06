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
