package com.livetv.app

import android.app.Activity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Premium features (the 2×2 and 1×2 layouts). Free Live TV and Stream Player Plus have them for
 * everyone; Live TV Plus sells them as a Google Play subscription and sets [billing] at start.
 */
object Premium {
    /** What a Premium seller provides: Live TV Plus's Google Play billing. */
    interface Billing {
        /** The monthly price as Google Play shows it (e.g. "$0.99"), once known. */
        val price: StateFlow<String?>
        fun subscribe(activity: Activity)
    }

    private val _active = MutableStateFlow(true)

    /** Whether the Premium features are unlocked. */
    val active: StateFlow<Boolean> = _active.asStateFlow()

    /** Set by an edition that sells Premium; null when Premium is free. */
    var billing: Billing? = null
        private set

    fun install(billing: Billing, active: Boolean) {
        this.billing = billing
        _active.value = active
    }

    fun setActive(active: Boolean) {
        _active.value = active
    }
}
