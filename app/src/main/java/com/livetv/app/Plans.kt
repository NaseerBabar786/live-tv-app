package com.livetv.app

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Free Live TV's packages: Free, Silver, Gold and Platinum. Each one adds modes and sections to
 * the one below. Every other app (and Free Live TV until the owner turns packages on) has
 * everything, so [current] starts at Platinum.
 */
object Plans {
    enum class Tier(val label: String) { Free("Free"), Silver("Silver"), Gold("Gold"), Platinum("Platinum") }

    private val _current = MutableStateFlow(Tier.Platinum)

    /** The viewer's package right now (Platinum when packages are off). */
    val current: StateFlow<Tier> = _current.asStateFlow()

    fun set(tier: Tier) {
        _current.value = tier
    }

    fun allows(needed: Tier): Boolean = _current.value >= needed

    /** What the viewer tried to open without the package for it; Free Live TV shows its packages then. */
    data class Ask(val feature: String, val needed: Tier)

    private val _asking = MutableStateFlow<Ask?>(null)
    val asking: StateFlow<Ask?> = _asking.asStateFlow()

    /** Shows the packages (true is returned) when [needed] is above the viewer's package. */
    fun ask(feature: String, needed: Tier): Boolean {
        if (allows(needed)) return false
        _asking.value = Ask(feature, needed)
        return true
    }

    /** Opens the packages screen from Settings. */
    fun showPlans() {
        _asking.value = Ask("", Tier.Silver)
    }

    fun closeAsk() {
        _asking.value = null
    }

    /** Movies & Dramas. */
    val LIBRARY = Tier.Gold

    /** Games. */
    val GAMES = Tier.Platinum
}
