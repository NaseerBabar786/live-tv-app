package com.iqraquran.app.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

data class Surah(
    val number: Int,
    val nameAr: String,
    val nameEn: String,
    val meaningEn: String,
    val meaningUr: String,
    val makki: Boolean,
    val ayahs: List<String>,
)

/** The whole Quran with its Urdu and English translations, as shipped in the app's assets. */
class QuranText(
    val surahs: List<Surah>,
    val urdu: List<List<String>>,
    val english: List<List<String>>,
) {
    fun surah(n: Int): Surah = surahs[n - 1]

    /** Surah 1, ayah 1: the Bismillah, shown at the top of every surah except 1 and 9. */
    val bismillah: String get() = surahs[0].ayahs[0]

    val ayahCounts: List<Int> get() = surahs.map { it.ayahs.size }
}

/** A recitation on everyayah.com, one MP3 per ayah. */
data class Reciter(val id: String, val folder: String, val en: String, val ur: String) {
    fun url(surah: Int, ayah: Int): String = audioUrl(folder, surah, ayah)

    companion object {
        /** "Husary_128kbps", 2, 255 -> https://everyayah.com/data/Husary_128kbps/002255.mp3 */
        fun audioUrl(folder: String, surah: Int, ayah: Int): String =
            String.format(Locale.ROOT, "https://everyayah.com/data/%s/%03d%03d.mp3", folder, surah, ayah)
    }
}

object Quran {
    private val lock = Mutex()
    private var text: QuranText? = null
    private var reciterList: List<Reciter>? = null

    /** Loads (once) and returns the Quran text. Takes a moment the first time, so it runs off the main thread. */
    suspend fun load(context: Context): QuranText = lock.withLock {
        text ?: withContext(Dispatchers.IO) {
            val assets = context.applicationContext.assets
            fun read(name: String) = assets.open("quran/$name").bufferedReader().use { it.readText() }
            val surahs = JSONObject(read("quran.json")).getJSONArray("surahs").let { arr ->
                (0 until arr.length()).map { i ->
                    val s = arr.getJSONObject(i)
                    Surah(
                        number = s.getInt("n"),
                        nameAr = s.getString("ar"),
                        nameEn = s.getString("en"),
                        meaningEn = s.getString("enMeaning"),
                        meaningUr = s.getString("ur"),
                        makki = s.getString("place") == "makkah",
                        ayahs = s.getJSONArray("ayahs").strings(),
                    )
                }
            }
            fun translation(name: String): List<List<String>> =
                JSONObject(read(name)).getJSONArray("surahs").let { arr ->
                    (0 until arr.length()).map { arr.getJSONArray(it).strings() }
                }
            QuranText(surahs, translation("ur.json"), translation("en.json"))
        }.also { text = it }
    }

    fun reciters(context: Context): List<Reciter> = reciterList ?: run {
        val json = context.applicationContext.assets.open("quran/reciters.json").bufferedReader().use { it.readText() }
        val arr = JSONArray(json)
        (0 until arr.length()).map {
            val r = arr.getJSONObject(it)
            Reciter(r.getString("id"), r.getString("folder"), r.getString("en"), r.getString("ur"))
        }.also { reciterList = it }
    }

    private fun JSONArray.strings(): List<String> = (0 until length()).map { getString(it) }
}
