package com.iqraquran.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** A learner: each child (or grown-up) keeps their own stars and Hifz. */
data class Profile(val id: String, val name: String, val color: Int)

enum class TranslationMode { None, Urdu, English, Both }

/** Everything the app remembers, kept on the device only (no sign-in, nothing uploaded). */
class Store(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences("iqra_quran", Context.MODE_PRIVATE)

    var language: String?
        get() = prefs.getString("language", null)
        set(v) = prefs.edit().putString("language", v).apply()

    var reciterId: String
        get() = prefs.getString("reciter", "husary_muallim") ?: "husary_muallim"
        set(v) = prefs.edit().putString("reciter", v).apply()

    var kidsReciterId: String
        get() = prefs.getString("kids_reciter", "husary_muallim") ?: "husary_muallim"
        set(v) = prefs.edit().putString("kids_reciter", v).apply()

    var translation: TranslationMode
        get() = runCatching { TranslationMode.valueOf(prefs.getString("translation", null)!!) }
            .getOrDefault(TranslationMode.Urdu)
        set(v) = prefs.edit().putString("translation", v.name).apply()

    /** Reading theme id (see Palettes), and the colours of the Custom theme as ARGB. */
    var themeId: String
        get() = prefs.getString("theme", "classic") ?: "classic"
        set(v) = prefs.edit().putString("theme", v).apply()

    var customBackground: Int
        get() = prefs.getInt("custom_bg", 0xFFF6F3EA.toInt())
        set(v) = prefs.edit().putInt("custom_bg", v).apply()

    var customText: Int
        get() = prefs.getInt("custom_text", 0xFF222222.toInt())
        set(v) = prefs.edit().putInt("custom_text", v).apply()

    /** One more colour of the Custom theme (card, arabic, accent, highlight) as ARGB; 0 = automatic. */
    fun customColor(slot: String): Int = prefs.getInt("custom_$slot", 0)
    fun setCustomColor(slot: String, argb: Int) = prefs.edit().putInt("custom_$slot", argb).apply()

    /** Extra space between lines of Quran text: 0 normal, 1 wide, 2 wider. */
    var lineSpacing: Int
        get() = prefs.getInt("line_spacing", 0)
        set(v) = prefs.edit().putInt("line_spacing", v).apply()

    /** Colour of a home screen button as ARGB, or 0 for its default colour. */
    fun tileColor(key: String): Int = prefs.getInt("tile_$key", 0)
    fun setTileColor(key: String, argb: Int) = prefs.edit().putInt("tile_$key", argb).apply()

    /** Arabic text size in sp. */
    var textSize: Int
        get() = prefs.getInt("text_size", 30)
        set(v) = prefs.edit().putInt("text_size", v).apply()

    /** Last ayah read, as surah to ayah. */
    var lastRead: Pair<Int, Int>?
        get() {
            val s = prefs.getInt("last_surah", 0)
            return if (s == 0) null else s to prefs.getInt("last_ayah", 1)
        }
        set(v) = prefs.edit().putInt("last_surah", v?.first ?: 0).putInt("last_ayah", v?.second ?: 1).apply()

    var profiles: List<Profile>
        get() = runCatching {
            val arr = JSONArray(prefs.getString("profiles", "[]"))
            (0 until arr.length()).map {
                val o = arr.getJSONObject(it)
                Profile(o.getString("id"), o.getString("name"), o.getInt("color"))
            }
        }.getOrDefault(emptyList())
        set(v) = prefs.edit().putString(
            "profiles",
            JSONArray(v.map { JSONObject().put("id", it.id).put("name", it.name).put("color", it.color) }).toString(),
        ).apply()

    var currentProfileId: String?
        get() = prefs.getString("profile", null)
        set(v) = prefs.edit().putString("profile", v).apply()

    /** Best stars per Qaida lesson for a learner. */
    fun stars(profileId: String): Map<Int, Int> = runCatching {
        val o = JSONObject(prefs.getString("stars_$profileId", "{}")!!)
        o.keys().asSequence().associate { it.toInt() to o.getInt(it) }
    }.getOrDefault(emptyMap())

    fun saveStars(profileId: String, stars: Map<Int, Int>) {
        val o = JSONObject()
        stars.forEach { (k, v) -> o.put(k.toString(), v) }
        prefs.edit().putString("stars_$profileId", o.toString()).apply()
    }

    fun hifz(profileId: String): List<Hifz.Item> = runCatching {
        val arr = JSONArray(prefs.getString("hifz_$profileId", "[]"))
        (0 until arr.length()).map {
            val o = arr.getJSONObject(it)
            Hifz.Item(
                surah = o.getInt("s"),
                from = o.getInt("f"),
                to = o.getInt("t"),
                learnedOn = o.getLong("l"),
                lastReview = o.getLong("r"),
                level = o.optInt("v"),
                weak = o.optBoolean("w"),
            )
        }
    }.getOrDefault(emptyList())

    fun saveHifz(profileId: String, items: List<Hifz.Item>) {
        val arr = JSONArray(
            items.map {
                JSONObject().put("s", it.surah).put("f", it.from).put("t", it.to)
                    .put("l", it.learnedOn).put("r", it.lastReview).put("v", it.level).put("w", it.weak)
            },
        )
        prefs.edit().putString("hifz_$profileId", arr.toString()).apply()
    }

    fun deleteProfileData(profileId: String) {
        prefs.edit().remove("stars_$profileId").remove("hifz_$profileId").apply()
    }
}
