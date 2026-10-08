package com.iqraquran.app.data

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.TimeZone
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/** Where the viewer is, for the prayer times. */
data class Place(val latitude: Double, val longitude: Double, val city: String, val country: String)

/** One Azan recording (docs/quran/azan, made by tools/build_azan.py from freely licensed Commons files). */
data class AzanVoice(val id: String, val en: String, val ur: String, val fajr: Boolean, val url: String, val credit: String)

/** A prayer time to come: which prayer, when (epoch ms), and what to do then. */
data class PrayerEvent(val prayer: Prayer, val at: Long, val mode: AzanMode, val reminder: Boolean = false)

/**
 * The Azan and prayer-time settings and the things they need: the place, the recordings list and the
 * chosen recordings kept on the device (so the Azan plays even when the internet is slow).
 * Kept apart from [Store] so the Azan alarm can read it without the rest of the app.
 */
class AzanSettings(context: Context) {

    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences("iqra_azan", Context.MODE_PRIVATE)

    fun mode(p: Prayer): AzanMode =
        runCatching { AzanMode.valueOf(prefs.getString("mode_${p.name}", null)!!) }.getOrDefault(AzanMode.Azan)
    fun setMode(p: Prayer, m: AzanMode) = edit { putString("mode_${p.name}", m.name) }

    var voiceId: String
        get() = prefs.getString("voice", DEFAULT_VOICE) ?: DEFAULT_VOICE
        set(v) = edit { putString("voice", v) }

    /** The Fajr Azan's recording; empty = the same as the others. */
    var fajrVoiceId: String
        get() = prefs.getString("fajr_voice", "") ?: ""
        set(v) = edit { putString("fajr_voice", v) }

    /** 10 to 100. */
    var volume: Int
        get() = prefs.getInt("volume", 80)
        set(v) = edit { putInt("volume", v.coerceIn(10, 100)) }

    /** Minutes before each prayer for a reminder; 0 = none. */
    var reminderMinutes: Int
        get() = prefs.getInt("reminder", 0)
        set(v) = edit { putInt("reminder", v) }

    /** Quiet hours: the Azan becomes a silent message between these hours (both 0 = off). */
    var quietFrom: Int
        get() = prefs.getInt("quiet_from", 0)
        set(v) = edit { putInt("quiet_from", v) }
    var quietTo: Int
        get() = prefs.getInt("quiet_to", 0)
        set(v) = edit { putInt("quiet_to", v) }
    val quietOn: Boolean get() = quietFrom != quietTo

    var method: CalcMethod?
        get() = runCatching { CalcMethod.valueOf(prefs.getString("method", null)!!) }.getOrNull()
        set(v) = edit { putString("method", v?.name) }

    var asr: AsrMethod
        get() = runCatching { AsrMethod.valueOf(prefs.getString("asr", null)!!) }.getOrDefault(AsrMethod.Shafi)
        set(v) = edit { putString("asr", v.name) }

    /** Moves the Hijri date by a day either way, to match the local moon sighting. */
    var hijriAdjust: Int
        get() = prefs.getInt("hijri_adjust", 0)
        set(v) = edit { putInt("hijri_adjust", v.coerceIn(-2, 2)) }

    var place: Place?
        get() {
            if (!prefs.contains("lat")) return null
            return Place(
                prefs.getFloat("lat", 0f).toDouble(), prefs.getFloat("lng", 0f).toDouble(),
                prefs.getString("city", "") ?: "", prefs.getString("country", "") ?: "",
            )
        }
        set(v) = edit {
            if (v == null) remove("lat").remove("lng").remove("city").remove("country")
            else putFloat("lat", v.latitude.toFloat()).putFloat("lng", v.longitude.toFloat())
                .putString("city", v.city).putString("country", v.country)
        }

    /** Set when the viewer picked the place by hand (then it isn't replaced from the internet). */
    var placeFixed: Boolean
        get() = prefs.getBoolean("place_fixed", false)
        set(v) = edit { putBoolean("place_fixed", v) }

    /** The method in use: the chosen one, else the usual one for the viewer's country. */
    val methodInUse: CalcMethod get() = method ?: CalcMethod.forCountry(place?.country)

    private inline fun edit(block: android.content.SharedPreferences.Editor.() -> android.content.SharedPreferences.Editor) {
        prefs.edit().block().apply()
        changed?.invoke(app)
    }

    // ---------- Times ----------

    /** Today's times (or another day's: [daysFromToday]), or null before the place is known. */
    fun times(daysFromToday: Int = 0, now: Long = System.currentTimeMillis()): DayTimes? {
        val p = place ?: return null
        val c = Calendar.getInstance().apply { timeInMillis = now; add(Calendar.DAY_OF_YEAR, daysFromToday) }
        val offset = TimeZone.getDefault().getOffset(c.timeInMillis) / 60000
        return PrayerTimes.of(
            c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH),
            p.latitude, p.longitude, offset, methodInUse, asr,
        )
    }

    /** Epoch ms of [minutes] after midnight on the day [daysFromToday]. */
    fun at(daysFromToday: Int, minutes: Int, now: Long = System.currentTimeMillis()): Long =
        Calendar.getInstance().apply {
            timeInMillis = now
            add(Calendar.DAY_OF_YEAR, daysFromToday)
            set(Calendar.HOUR_OF_DAY, minutes / 60)
            set(Calendar.MINUTE, minutes % 60)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

    /** What [mode] becomes during quiet hours. */
    fun effectiveMode(p: Prayer, at: Long): AzanMode {
        val m = mode(p)
        if (!quietOn || m == AzanMode.Off || m == AzanMode.Message) return m
        val hour = Calendar.getInstance().apply { timeInMillis = at }.get(Calendar.HOUR_OF_DAY)
        val quiet = if (quietFrom < quietTo) hour in quietFrom until quietTo else hour >= quietFrom || hour < quietTo
        return if (quiet) AzanMode.Message else m
    }

    /** The next Azan, chime, message or reminder after [now] (looks up to two days ahead). */
    fun nextEvent(now: Long = System.currentTimeMillis()): PrayerEvent? {
        val events = mutableListOf<PrayerEvent>()
        for (day in 0..2) {
            val t = times(day, now) ?: return null
            for (p in Prayer.withAzan) {
                val at = at(day, t[p], now)
                val mode = effectiveMode(p, at)
                if (mode == AzanMode.Off) continue
                events += PrayerEvent(p, at, mode)
                if (reminderMinutes > 0) events += PrayerEvent(p, at - reminderMinutes * 60_000L, AzanMode.Message, reminder = true)
            }
        }
        return events.filter { it.at > now }.minByOrNull { it.at }
    }

    /** The prayer whose time it is now (the last one passed) and the next one, with their times in ms. */
    fun around(now: Long = System.currentTimeMillis()): Pair<Pair<Prayer, Long>, Pair<Prayer, Long>>? {
        val all = (-1..1).flatMap { day ->
            val t = times(day, now) ?: return null
            Prayer.entries.map { it to at(day, t[it], now) }
        }.sortedBy { it.second }
        val i = all.indexOfLast { it.second <= now }
        if (i < 0 || i + 1 >= all.size) return null
        return all[i] to all[i + 1]
    }

    // ---------- Place ----------

    /** Finds the place from the internet address (geojs.io, as Cable TV's weather does), unless picked by hand. */
    suspend fun refreshPlace() = withContext(Dispatchers.IO) {
        if (placeFixed && place != null) return@withContext
        // An app that knows better where the viewer is (Cable TV: the same place as its weather).
        placeSource?.let { source ->
            val p = runCatching { source() }.getOrNull()
            if (p != null) {
                if (p != place) place = p
                return@withContext
            }
        }
        runCatching {
            val o = JSONObject(fetch("https://get.geojs.io/v1/ip/geo.json"))
            val lat = o.optString("latitude").toDoubleOrNull() ?: return@runCatching
            val lng = o.optString("longitude").toDoubleOrNull() ?: return@runCatching
            place = Place(lat, lng, o.optString("city"), o.optString("country_code"))
        }
    }

    // ---------- Recordings ----------

    /** The recordings to choose from (the list is kept, so it's there offline). */
    fun voices(): List<AzanVoice> = prefs.getString("voices", null)?.let { parseVoices(it) } ?: emptyList()

    suspend fun refreshVoices(): List<AzanVoice> = withContext(Dispatchers.IO) {
        runCatching {
            val text = fetch(BASE + "azan.json")
            if (parseVoices(text).isNotEmpty()) prefs.edit().putString("voices", text).apply()
        }
        voices()
    }

    fun voice(id: String): AzanVoice? = voices().firstOrNull { it.id == id } ?: voices().firstOrNull { !it.fajr }

    /** The recording for [p]. */
    fun voiceFor(p: Prayer): AzanVoice? =
        if (p == Prayer.Fajr && fajrVoiceId.isNotEmpty()) voice(fajrVoiceId) else voice(voiceId)

    /** The recording's file on the device, or null if it isn't downloaded yet. */
    fun localFile(v: AzanVoice): File? = file(v).takeIf { it.exists() && it.length() > 10_000 }

    /** Downloads the chosen recordings, so the Azan doesn't wait for the internet. */
    suspend fun downloadChosen() = withContext(Dispatchers.IO) {
        listOfNotNull(voiceFor(Prayer.Zuhr), voiceFor(Prayer.Fajr)).distinct().forEach { v ->
            if (localFile(v) != null) return@forEach
            runCatching {
                val dest = file(v)
                dest.parentFile?.mkdirs()
                val tmp = File(dest.path + ".part")
                open(v.url).inputStream.use { input -> tmp.outputStream().use { input.copyTo(it) } }
                tmp.renameTo(dest)
            }
        }
    }

    private fun file(v: AzanVoice) = File(app.filesDir, "azan/${v.id}.mp3")

    companion object {
        const val BASE = "https://tv.bulkbazaar.ca/quran/azan/"
        const val DEFAULT_VOICE = "makkah"

        /** Where the viewer is, from the host app (Cable TV: the device's location, as its weather uses); null = internet guess. */
        @Volatile
        var placeSource: (suspend () -> Place?)? = null

        /** Opens the host app's city picker (Cable TV's weather city); null = no picker. */
        @Volatile
        var pickPlace: (() -> Unit)? = null

        /** Called after any setting changes (the Iqra Quran app sets the next alarm). */
        @Volatile
        var changed: ((Context) -> Unit)? = null

        fun parseVoices(text: String): List<AzanVoice> = runCatching {
            val arr: JSONArray = JSONObject(text).getJSONArray("voices")
            (0 until arr.length()).map {
                val o = arr.getJSONObject(it)
                AzanVoice(
                    o.getString("id"), o.getString("en"), o.optString("ur", o.getString("en")), o.optBoolean("fajr"),
                    BASE + o.getString("file"), o.optString("credit"),
                )
            }
        }.getOrDefault(emptyList())

        private fun open(url: String): HttpURLConnection =
            (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 30_000
                setRequestProperty("User-Agent", "IqraQuran-Android/1.0")
            }

        private fun fetch(url: String): String = open(url).inputStream.bufferedReader().use { it.readText() }
    }
}
