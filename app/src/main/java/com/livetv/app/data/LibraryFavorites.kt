package com.livetv.app.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The Library's Favorites (owner, 2026-10-08): films and whole series a viewer holds OK on, so they can
 * go straight back to them from the ★ Favorites tile. Kept on the TV in their own file, next to (never
 * touching) the channel favourites, so updates leave them as they are. Titles are saved by name, not by
 * link, so a favourite stays put when the morning lists are rebuilt.
 *
 * Also remembers the last episode watched of every series, so a favourite series carries on where the
 * viewer stopped: the same episode when they left partway (the film page resumes it), the next one when
 * it played to the end.
 */
object LibraryFavorites {

    private const val FILE = "library_favorites"
    private const val KEYS = "keys"

    private var prefs: SharedPreferences? = null
    private val _keys = MutableStateFlow<Set<String>>(emptySet())

    /** The saved favourites' keys ([movieKey] and [showKey]). */
    val keys: StateFlow<Set<String>> = _keys.asStateFlow()

    private fun prefs(context: Context): SharedPreferences =
        prefs ?: context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE).also {
            prefs = it
            _keys.value = it.getStringSet(KEYS, emptySet()).orEmpty().toSet()
        }

    /** Loads the saved favourites (once). */
    fun load(context: Context) { prefs(context) }

    /** A film's key: its language and title, the same way the Library spots one film listed twice. */
    fun movieKey(movie: Channel): String = "m|" + Vod.sameTitleKey(movie)

    /** A series' (or show's) key: its language and title. */
    fun showKey(language: Vod.Language, show: Vod.Show): String =
        "s|${language.name}|" + Vod.titleKey(show.name).ifEmpty { show.name }

    /** Adds or removes a favourite; true when it was added. The newest one comes first. */
    fun toggle(context: Context, key: String): Boolean {
        val p = prefs(context)
        val added = key !in _keys.value
        val keys = if (added) _keys.value + key else _keys.value - key
        val edit = p.edit().putStringSet(KEYS, keys)
        if (added) edit.putLong("t|$key", System.currentTimeMillis()) else edit.remove("t|$key")
        edit.apply()
        _keys.value = keys
        return added
    }

    /** When a favourite was last watched (or added), for putting the last one watched on top. */
    fun lastUsed(context: Context, key: String): Long = prefs(context).getLong("t|$key", 0)

    /** Marks a favourite as just watched, so it moves to the top of Favorites. */
    fun touch(context: Context, key: String) {
        val p = prefs(context)
        if (key in _keys.value) p.edit().putLong("t|$key", System.currentTimeMillis()).apply()
    }

    /** Remembers the episode of a series just picked ([ended] when it played to the end). */
    fun watched(context: Context, showKey: String, episode: Channel, ended: Boolean) {
        prefs(context).edit()
            .putString("ep|$showKey", Vod.sameTitleKey(episode))
            .putBoolean("end|$showKey", ended)
            .apply()
        touch(context, showKey)
    }

    /**
     * The episode a series carries on from: the last one watched when it was left partway, the one after
     * it when it played to the end (the last episode again when there's no newer one yet), else the first.
     */
    fun resumeEpisode(context: Context, showKey: String, show: Vod.Show): Vod.Episode? {
        val p = prefs(context)
        val last = p.getString("ep|$showKey", null) ?: return show.episodes.firstOrNull()
        val at = show.episodes.indexOfFirst { Vod.sameTitleKey(it.channel) == last }
        if (at < 0) return show.episodes.firstOrNull()
        val next = if (p.getBoolean("end|$showKey", false)) at + 1 else at
        return show.episodes.getOrNull(next) ?: show.episodes[at]
    }
}
