package com.iqraquran.app.data

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** A language the Quran can be read in alongside the Arabic. */
data class TranslationLang(val code: String, val en: String, val native: String, val rtl: Boolean, val translator: String)

/**
 * The translations: Urdu and English ship inside the app; the other languages (tools/build_quran.py,
 * docs/quran/tr) are downloaded the first time they're picked and kept on the device.
 */
object Translations {
    const val BASE = "https://tv.bulkbazaar.ca/quran/tr/"

    val builtIn = listOf(
        TranslationLang("ur", "Urdu", "اردو", true, "Fateh Muhammad Jalandhari"),
        TranslationLang("en", "English", "English", false, "Saheeh International"),
    )

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences("iqra_quran", Context.MODE_PRIVATE)

    /** Every language to choose from: the built-in two, then the downloadable ones (list kept for offline use). */
    fun list(context: Context): List<TranslationLang> = builtIn + parseIndex(prefs(context).getString("tr_index", null))

    suspend fun refreshList(context: Context): List<TranslationLang> = withContext(Dispatchers.IO) {
        runCatching {
            val text = fetch(BASE + "index.json")
            if (parseIndex(text).isNotEmpty()) prefs(context).edit().putString("tr_index", text).apply()
        }
        list(context)
    }

    /** A downloadable language's text, per surah and ayah: from the device, else downloaded now (null when offline). */
    suspend fun load(context: Context, code: String): List<List<String>>? = withContext(Dispatchers.IO) {
        val file = File(context.applicationContext.filesDir, "tr/$code.json")
        val text = if (file.exists()) file.readText() else runCatching {
            fetch("$BASE$code.json").also { t ->
                file.parentFile?.mkdirs()
                File(file.path + ".part").apply { writeText(t) }.renameTo(file)
            }
        }.getOrNull() ?: return@withContext null
        runCatching { parse(text) }.getOrNull()
    }

    fun parse(text: String): List<List<String>> {
        val arr = JSONObject(text).getJSONArray("surahs")
        return (0 until arr.length()).map { i -> arr.getJSONArray(i).let { a -> (0 until a.length()).map { a.getString(it) } } }
    }

    fun parseIndex(text: String?): List<TranslationLang> = runCatching {
        val arr = JSONObject(text!!).getJSONArray("languages")
        (0 until arr.length()).map {
            val o = arr.getJSONObject(it)
            TranslationLang(o.getString("code"), o.getString("en"), o.optString("native", o.getString("en")), o.optBoolean("rtl"), o.optString("translator"))
        }.filter { l -> builtIn.none { it.code == l.code } }
    }.getOrDefault(emptyList())

    private fun fetch(url: String): String =
        (URL(url).openConnection() as HttpURLConnection).run {
            connectTimeout = 15_000
            readTimeout = 60_000
            setRequestProperty("User-Agent", "IqraQuran-Android/1.0")
            inputStream.bufferedReader().use { it.readText() }
        }
}
