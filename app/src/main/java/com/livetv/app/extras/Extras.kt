package com.livetv.app.extras

import android.content.Context
import android.content.SharedPreferences
import android.widget.Toast
import com.livetv.app.data.Channel
import com.livetv.app.data.LibraryReports
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * NextGen Cable's TV extras (owner, 2026-10-09): sleep timer, screensaver, the "Channel not working" report,
 * floating widgets over full screen, reminders, family profiles and the TV home-screen card. This object
 * keeps the small settings they share; each feature has its own file in this package.
 */
object Extras {
    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences("extras", Context.MODE_PRIVATE)
        prefs = p
        _widgets.value = Widget.parse(p.getString(K_WIDGETS, "") ?: "")
        _corner.value = Corner.entries.firstOrNull { it.name == p.getString(K_CORNER, null) } ?: Corner.TopRight
        Reminders.init(context)
        Profiles.init(context)
    }

    // ---- Sleep timer ----

    /** When the sleep timer ends (wall clock), or null when it's off. Not saved: a new start has no timer. */
    private val _sleepAt = MutableStateFlow<Long?>(null)
    val sleepAt: StateFlow<Long?> = _sleepAt.asStateFlow()

    /** The choices offered, in minutes (0 = off). */
    val SLEEP_CHOICES = listOf(0, 15, 30, 60, 90, 120)

    fun setSleep(minutes: Int) {
        _sleepAt.value = if (minutes <= 0) null else System.currentTimeMillis() + minutes * 60_000L
    }

    // ---- Screensaver: time of the last button press ----

    @Volatile var lastInput: Long = System.currentTimeMillis()
        private set

    fun touch() {
        lastInput = System.currentTimeMillis()
    }

    /** The screensaver is showing; the next button press only closes it. */
    val screensaverOn = MutableStateFlow(false)

    // ---- "Channel not working" ----

    /**
     * Sends a "not working" report for [channel] to the owner's admin page (tv.bulkbazaar.ca/reports), through the
     * same collection the Library's "Did it play properly?" answers use. Once per channel per day from this TV.
     */
    fun reportBroken(context: Context, channel: Channel) {
        val p = prefs ?: return
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val sent = p.getStringSet(K_REPORTED, emptySet()).orEmpty().filter { it.startsWith("$today|") }.toSet()
        val key = "$today|${channel.url}"
        if (key !in sent) {
            LibraryReports.send(context, channel, ok = false, kind = "channel")
            p.edit().putStringSet(K_REPORTED, sent + key).apply()
        }
        Toast.makeText(context, "Thank you. We'll check ${channel.name}.", Toast.LENGTH_SHORT).show()
    }

    // ---- Floating widgets over full screen ----

    enum class Widget(val key: String, val label: String, val note: String) {
        Clock("clock", "Clock and weather", "The time, the date and today's temperature"),
        Azan("azan", "Next Azan", "The next prayer and how long until it"),
        Cricket("cricket", "Cricket score", "The live score while a match is on"),
        UpNext("next", "Up next", "What's on next on the channel you're watching");

        companion object {
            fun parse(list: String): Set<Widget> =
                list.split(',').mapNotNull { k -> entries.firstOrNull { it.key == k.trim() } }.toSet()
        }
    }

    enum class Corner(val label: String) { TopRight("Top right"), TopLeft("Top left"), BottomRight("Bottom right"), BottomLeft("Bottom left") }

    private val _widgets = MutableStateFlow<Set<Widget>>(emptySet())

    /** The widgets the viewer turned on (none until they pick some). */
    val widgets: StateFlow<Set<Widget>> = _widgets.asStateFlow()

    private val _corner = MutableStateFlow(Corner.TopRight)
    val corner: StateFlow<Corner> = _corner.asStateFlow()

    fun setWidget(widget: Widget, on: Boolean) {
        val now = if (on) _widgets.value + widget else _widgets.value - widget
        _widgets.value = now
        prefs?.edit()?.putString(K_WIDGETS, Widget.entries.filter { it in now }.joinToString(",") { it.key })?.apply()
    }

    fun setCorner(corner: Corner) {
        _corner.value = corner
        prefs?.edit()?.putString(K_CORNER, corner.name)?.apply()
    }

    private const val K_WIDGETS = "widgets"
    private const val K_CORNER = "widget_corner"
    private const val K_REPORTED = "reported"
}
