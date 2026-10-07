package com.livetv.app

import com.livetv.app.data.Channel
import com.livetv.app.data.MyChannel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Cable TV's packages: Free, Silver, Gold and Platinum. The owner ticks which [Feature]s each one has
 * at tv.bulkbazaar.ca/packages (since 1.9.64); 1+List is in every package. Without [Feature.AllChannels] a
 * package has only a few channels ([freeChannel]). Every other app (and Cable TV until the owner turns
 * packages on) has everything, so [current] starts at Platinum and every package has every feature.
 */
object Plans {
    /** [Promo] is the Promotional package: not for sale, the owner gives it to chosen viewers for a set time. */
    enum class Tier(val label: String) { Free("Free"), Silver("Silver"), Gold("Gold"), Platinum("Platinum"), Promo("Promotional") }

    /** What a package can include. The keys are the ones the packages page saves ("free_features" and so on). */
    enum class Feature(val key: String, val label: String) {
        AllChannels("channels", "All channels"),
        Browse("browse", "Browse"),
        Carousel("carousel", "Carousel"),
        Strip("strip", "Strip"),
        Two("two", "1×2"),
        Five("five", "1+3"),
        Duo("duo", "Duo"),
        Four("four", "2×2"),
        Six("six", "2×3"),
        News("news", "News"),
        Cp24("cp24", "CP24"),
        Home("home", "Home"),
        Mine("mine", "My Screen"),
        Library("library", "Movies & Dramas"),
        Games("games", "Games"),
        TwoDevices("devices", "2 devices");

        companion object {
            /** The features in a saved list like "channels,browse,carousel"; unknown keys are skipped. */
            fun parse(list: String): Set<Feature> =
                list.split(',').mapNotNull { k -> entries.firstOrNull { it.key == k.trim() } }.toSet()
        }
    }

    /** The owner's packages until they tick their own (owner, 2026-10-06). */
    val DEFAULT_FEATURES: Map<Tier, Set<Feature>> = mapOf(
        Tier.Free to emptySet(),
        Tier.Silver to setOf(Feature.AllChannels, Feature.Browse, Feature.Carousel),
        Tier.Gold to Feature.entries.toSet() - Feature.TwoDevices,
        Tier.Platinum to Feature.entries.toSet(),
        Tier.Promo to Feature.entries.toSet() - Feature.TwoDevices,
    )

    // Declared before _features, which starts with it.
    private val EVERYTHING: Map<Tier, Set<Feature>> = Tier.entries.associateWith { Feature.entries.toSet() }

    private val _features = MutableStateFlow(EVERYTHING)

    /** What each package has; every package has everything while packages are off. */
    val features: StateFlow<Map<Tier, Set<Feature>>> = _features.asStateFlow()

    /** The owner's packages while packages are on, or null (packages off) for everything. */
    fun setFeatures(map: Map<Tier, Set<Feature>>?) {
        _features.value = map ?: EVERYTHING
    }

    /** Whether the viewer's package has [feature]. */
    fun has(feature: Feature): Boolean = feature in (_features.value[_current.value] ?: emptySet())

    /** The first package for sale with [feature], for "needs Gold" and the packages screen. */
    fun lowestWith(feature: Feature): Tier =
        Tier.entries.firstOrNull { it != Tier.Promo && feature in (_features.value[it] ?: emptySet()) } ?: Tier.Platinum

    private val _current = MutableStateFlow(Tier.Platinum)

    /** The viewer's package right now (Platinum when packages are off). */
    val current: StateFlow<Tier> = _current.asStateFlow()

    fun set(tier: Tier) {
        _current.value = tier
    }

    /** What the viewer tried to open without the package for it; Cable TV shows its packages then. */
    data class Ask(val feature: String, val needed: Tier)

    private val _asking = MutableStateFlow<Ask?>(null)
    val asking: StateFlow<Ask?> = _asking.asStateFlow()

    /** Shows the packages (true is returned) when the viewer's package doesn't have [needed]. */
    fun ask(feature: String, needed: Feature): Boolean {
        if (has(needed)) return false
        _asking.value = Ask(feature, lowestWith(needed))
        return true
    }

    /** Opens the packages screen from Settings. */
    fun showPlans() {
        _asking.value = Ask("", Tier.Silver)
    }

    fun closeAsk() {
        _asking.value = null
    }

    /**
     * The channels of a package without [Feature.AllChannels]: only our own Bazaar channels (owner, 2026-10-07;
     * Aaj Tak and ARY News were dropped).
     */
    fun freeChannel(channel: Channel): Boolean = MyChannel.isMine(channel)

    /** Whether the viewer may watch [channel] with their package. */
    fun allowsChannel(channel: Channel): Boolean = has(Feature.AllChannels) || freeChannel(channel)
}
