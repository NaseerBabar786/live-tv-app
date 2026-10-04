package com.livetv.app.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * What the viewer chose to show in each spot of News mode (Settings > Customize News screen).
 * The sponsor corner and the advertising line always stay.
 */
object NewsScreen {
    enum class Panel(val label: String) {
        Clock("Clock and weather"),
        Markets("Markets"),
        Prayers("Prayer times"),
        Currencies("Currency rates"),
        Stories("Top stories"),
        Second("Second channel"),
        Empty("Nothing"),
    }

    enum class Slot(val label: String, val default: Panel, val choices: List<Panel>) {
        RightTop("Right side, top", Panel.Clock, RIGHT),
        RightMiddle("Right side, middle", Panel.Markets, RIGHT),
        RightBottom("Right side, bottom", Panel.Prayers, RIGHT),
        Under("Under the channel", Panel.Stories, ROWS),
        Info("Second line", Panel.Currencies, ROWS),
    }

    /** The bottom line: the advertising line alone, or a line of stock prices and rates above it. */
    enum class Bottom(val label: String) {
        Both("Stock prices + advertising line"),
        Ticker("Advertising line only"),
    }

    data class Choices(val panels: Map<Slot, Panel>, val bottom: Bottom) {
        operator fun get(slot: Slot): Panel = panels[slot] ?: slot.default
        val usesSecond get() = Slot.entries.any { get(it) == Panel.Second }
    }

    private var prefs: SharedPreferences? = null
    private val _choices = MutableStateFlow(Choices(emptyMap(), Bottom.Both))
    val choices: StateFlow<Choices> = _choices.asStateFlow()

    /** The second channel's id, kept so it comes back after a restart. */
    var secondId: String?
        get() = prefs?.getString(K_SECOND, null)
        set(value) { prefs?.edit()?.putString(K_SECOND, value)?.apply() }

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences("news_screen", Context.MODE_PRIVATE)
        prefs = p
        val panels = Slot.entries.associateWith { slot ->
            p.getString(slot.name, null)?.let { name -> slot.choices.firstOrNull { it.name == name } } ?: slot.default
        }
        val bottom = p.getString(K_BOTTOM, null)?.let { name -> Bottom.entries.firstOrNull { it.name == name } } ?: Bottom.Both
        _choices.value = Choices(panels, bottom)
    }

    /** Moves [slot] on to its next choice (OK on a TV remote steps through them). */
    fun next(slot: Slot) {
        val now = _choices.value
        val list = slot.choices
        val picked = list[(list.indexOf(now[slot]) + 1) % list.size]
        _choices.value = now.copy(panels = now.panels + (slot to picked))
        prefs?.edit()?.putString(slot.name, picked.name)?.apply()
    }

    fun nextBottom() {
        val now = _choices.value
        val picked = Bottom.entries[(now.bottom.ordinal + 1) % Bottom.entries.size]
        _choices.value = now.copy(bottom = picked)
        prefs?.edit()?.putString(K_BOTTOM, picked.name)?.apply()
    }

    fun reset() {
        _choices.value = Choices(Slot.entries.associateWith { it.default }, Bottom.Both)
        prefs?.edit()?.clear()?.apply()
    }

    private const val K_SECOND = "second"
    private const val K_BOTTOM = "bottom"
}

private val RIGHT = listOf(
    NewsScreen.Panel.Clock,
    NewsScreen.Panel.Markets,
    NewsScreen.Panel.Prayers,
    NewsScreen.Panel.Currencies,
    NewsScreen.Panel.Stories,
    NewsScreen.Panel.Second,
    NewsScreen.Panel.Empty,
)
private val ROWS = listOf(
    NewsScreen.Panel.Stories,
    NewsScreen.Panel.Currencies,
    NewsScreen.Panel.Prayers,
    NewsScreen.Panel.Markets,
    NewsScreen.Panel.Empty,
)

/**
 * What the viewer chose for each section of CP24 mode (Settings > Customize CP24 screen). The
 * first option of each section is the usual one. The sponsor and the advertising line always stay:
 * when the big box shows something else, the sponsor moves beside the story under the channel.
 */
object Cp24Screen {
    const val STORIES = "Top stories"
    const val PRAYERS = "Prayer times"
    const val CURRENCIES = "Currency rates"
    const val MARKETS = "Markets"
    const val NOTHING = "Nothing"
    const val HOURS = "Next hours"
    const val DAYS = "Next 4 days"
    const val SPONSOR = "Sponsor"
    const val SECOND = "Second channel"
    const val TURNS = "Takes turns"
    const val NEXT_PRAYER = "Next prayer"
    const val GOLD = "Gold per tola"
    const val PRICES = "Stock prices and rates"

    enum class Section(val label: String, val options: List<String>) {
        Band("Under the channel", listOf(STORIES, PRAYERS, CURRENCIES, MARKETS, NOTHING)),
        Boxes("Weather boxes", listOf(HOURS, DAYS, PRAYERS)),
        Middle("Big box", listOf(SPONSOR, PRAYERS, MARKETS, CURRENCIES, STORIES, SECOND)),
        Line("Small line", listOf(TURNS, MARKETS, CURRENCIES, NEXT_PRAYER, GOLD)),
        Crawl("Scrolling line", listOf(PRICES, STORIES, NOTHING)),
    }

    data class Choices(val picked: Map<Section, String>) {
        operator fun get(section: Section): String = picked[section]?.takeIf { it in section.options } ?: section.options.first()
    }

    private var prefs: SharedPreferences? = null
    private val _choices = MutableStateFlow(Choices(emptyMap()))
    val choices: StateFlow<Choices> = _choices.asStateFlow()

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences("cp24_screen", Context.MODE_PRIVATE)
        prefs = p
        _choices.value = Choices(Section.entries.mapNotNull { s -> p.getString(s.name, null)?.let { s to it } }.toMap())
    }

    fun next(section: Section) {
        val now = _choices.value
        val list = section.options
        val picked = list[(list.indexOf(now[section]) + 1) % list.size]
        _choices.value = Choices(now.picked + (section to picked))
        prefs?.edit()?.putString(section.name, picked)?.apply()
    }

    fun reset() {
        _choices.value = Choices(emptyMap())
        prefs?.edit()?.clear()?.apply()
    }
}

/**
 * My Screen mode: the viewer picks the layout, the style, the accent colour and what each spot
 * shows (Settings > Customize My Screen). Whatever they pick fills the whole screen: a spot set to
 * nothing gives its room to the others. The sponsor and the advertising line always stay.
 */
object MyScreen {
    const val RIGHT = "Panel on the right"
    const val LEFT = "Panel on the left"
    const val BIG = "Big channel"
    const val GLASS = "Glass cards"
    const val FLAT = "Flat, edge to edge"
    const val BOLD = "Bold headers"
    const val CLOCK = "Clock"
    const val WEATHER = "Weather"
    const val PRAYERS = "Prayer times"
    const val MARKETS = "Markets"
    const val CURRENCIES = "Currency rates"
    const val STORIES = "Top stories"
    const val SECOND = "Second channel"
    const val NOTHING = "Nothing"

    /** Accent colours, by name (ARGB). */
    val ACCENTS = linkedMapOf(
        "Gold" to 0xFFFFC107L,
        "Red" to 0xFFE53935L,
        "Green" to 0xFF2ECC71L,
        "Blue" to 0xFF4FA3FFL,
        "Purple" to 0xFFB388FFL,
    )

    private val SPOT = listOf(CLOCK, WEATHER, PRAYERS, MARKETS, CURRENCIES, STORIES, SECOND, NOTHING)

    enum class Section(val label: String, val options: List<String>) {
        Layout("Layout", listOf(RIGHT, LEFT, BIG)),
        Style("Style", listOf(GLASS, FLAT, BOLD)),
        Accent("Accent colour", ACCENTS.keys.toList()),
        Spot1("Spot 1", listOf(CLOCK) + (SPOT - CLOCK)),
        Spot2("Spot 2", listOf(WEATHER) + (SPOT - WEATHER)),
        Spot3("Spot 3", listOf(PRAYERS) + (SPOT - PRAYERS)),
        Spot4("Spot 4", listOf(MARKETS) + (SPOT - MARKETS)),
        Line("Under the channel", listOf(STORIES, CURRENCIES, PRAYERS, MARKETS, NOTHING)),
    }

    data class Choices(val picked: Map<Section, String>) {
        operator fun get(section: Section): String = picked[section]?.takeIf { it in section.options } ?: section.options.first()
        val spots get() = listOf(Section.Spot1, Section.Spot2, Section.Spot3, Section.Spot4).map { get(it) }.filter { it != NOTHING }
        val usesSecond get() = SECOND in spots
        val accent get() = ACCENTS[get(Section.Accent)] ?: ACCENTS.values.first()
    }

    private var prefs: SharedPreferences? = null
    private val _choices = MutableStateFlow(Choices(emptyMap()))
    val choices: StateFlow<Choices> = _choices.asStateFlow()

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences("my_screen", Context.MODE_PRIVATE)
        prefs = p
        _choices.value = Choices(Section.entries.mapNotNull { s -> p.getString(s.name, null)?.let { s to it } }.toMap())
    }

    fun next(section: Section) {
        val now = _choices.value
        val list = section.options
        val picked = list[(list.indexOf(now[section]) + 1) % list.size]
        _choices.value = Choices(now.picked + (section to picked))
        prefs?.edit()?.putString(section.name, picked)?.apply()
    }

    fun reset() {
        _choices.value = Choices(emptyMap())
        prefs?.edit()?.clear()?.apply()
    }
}
