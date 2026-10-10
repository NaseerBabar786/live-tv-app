package com.livetv.app.data

import android.content.Context
import com.livetv.app.Edition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * How many titles the Library has, shown under the Library button in the top bar (owner, 2026-10-10): it
 * goes up as new films and programmes come in. The number is counted every morning when the lists are
 * rebuilt (tools/library_titles.py, library-count.json); MTA's programmes count only when MTA is on.
 * The last number is kept, so the button shows it at once on the next start.
 */
object LibraryCount {

    private const val URL_COUNT = "https://tv.bulkbazaar.ca/library-count.json"
    private const val PREFS = "library_count"

    private val _titles = MutableStateFlow(0)
    val titles: StateFlow<Int> = _titles.asStateFlow()

    /** The kept number at once, then today's from the website. */
    suspend fun load(context: Context) {
        if (!Edition.HAS_VOD) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val mta = ChannelRepository(context).showMta
        fun total(main: Int, extra: Int) = main + if (mta) extra else 0
        _titles.value = total(prefs.getInt("titles", 0), prefs.getInt("mta", 0))
        val json = withContext(Dispatchers.IO) {
            runCatching {
                val conn = URL(URL_COUNT).openConnection() as HttpURLConnection
                conn.connectTimeout = 15_000
                conn.readTimeout = 20_000
                conn.setRequestProperty("User-Agent", Edition.USER_AGENT)
                try {
                    JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                } finally {
                    conn.disconnect()
                }
            }.getOrNull()
        } ?: return
        val main = json.optInt("titles", 0).takeIf { it > 0 } ?: return
        val extra = json.optInt("mta", 0)
        prefs.edit().putInt("titles", main).putInt("mta", extra).apply()
        _titles.value = total(main, extra)
    }

    /** "1,482 titles" style number for the button: "1,482". */
    fun label(n: Int): String = String.format(java.util.Locale.US, "%,d", n)
}
