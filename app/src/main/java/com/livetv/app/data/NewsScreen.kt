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
