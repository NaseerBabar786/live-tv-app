package com.livetv.app.sponsor

import android.content.Context
import android.content.SharedPreferences
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.livetv.app.Watching
import com.livetv.app.account.Account
import com.livetv.app.account.Firestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** A business that pays to be shown in Cable TV, as the owner set it up on tv.bulkbazaar.ca/sponsors. */
class Sponsor(
    val id: String,
    val name: String,
    /** A short line about the business, e.g. "Fresh halal meat, open 7 days". */
    val line: String,
    /** Phone number or website. */
    val contact: String,
    /** First and last day to show ("yyyy-MM-dd"), empty when open-ended. */
    val start: String,
    val end: String,
    val active: Boolean,
    val picture: ImageBitmap?,
    /** An optional wide 8:1 banner for the 1×2 bar; null when the sponsor has none. */
    val banner: ImageBitmap? = null,
    /** An optional MP4 link, played muted in News mode's sponsor corner; empty when there is none. */
    val video: String = "",
    /** The sponsor's website, opened inside the app when a viewer presses OK on the sponsor tile; empty when there is none. */
    val website: String = "",
    /** The channel change pop-up plays [video] to the end instead of showing the picture (chosen on /sponsors). */
    val popupVideo: Boolean = false,
) {
    /** The address to open: the website box, or else the "phone or website" box when it holds a web address; null when neither does. */
    val site: String? get() = siteUrl(website) ?: siteUrl(contact)
        ?: "https://bulkbazaar.ca".takeIf { name.contains("bulk bazaar", ignoreCase = true) }

    fun showsOn(day: String) =
        active && picture != null && (start.isEmpty() || day >= start) && (end.isEmpty() || day <= end)
}

/**
 * The sponsors to show. They come from Firestore (sponsors/{id}) and are kept in a file, so the
 * start screen can show one straight away, before the new list arrives.
 */
/** [text] as a web address when it looks like one ("bulkbazaar.ca", "www.x.com/shop", "http://…"); null for a phone number or blank. */
fun siteUrl(text: String): String? {
    val t = text.trim()
    if (t.isEmpty() || t.any { it.isWhitespace() }) return null
    val host = t.removePrefix("https://").removePrefix("http://").substringBefore('/').substringBefore('?')
    if (!Regex("^[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}$").matches(host)) return null
    return if (t.startsWith("http://") || t.startsWith("https://")) t else "https://$t"
}

object Sponsors {
    private val _all = MutableStateFlow<List<Sponsor>>(emptyList())
    val all: StateFlow<List<Sponsor>> = _all.asStateFlow()

    private var file: File? = null
    private var prefs: SharedPreferences? = null

    private val _ticker = MutableStateFlow<String?>(DEFAULT_TICKER)
    /** The scrolling "advertise with us" line, as the owner typed it on the website; null when turned off. */
    val ticker: StateFlow<String?> = _ticker.asStateFlow()

    /** Today's sponsors, in the order the owner added them. */
    fun current(): List<Sponsor> = _all.value.filter { it.showsOn(Watching.today(System.currentTimeMillis())) }

    /** Reads the saved list (once). */
    suspend fun init(context: Context) = withContext(Dispatchers.IO) {
        synchronized(this@Sponsors) {
            if (file != null) return@withContext
            file = File(context.applicationContext.filesDir, "sponsors.json")
            prefs = context.applicationContext.getSharedPreferences("sponsors", Context.MODE_PRIVATE)
        }
        runCatching { file!!.takeIf { it.exists() }?.readText()?.let { _all.value = parse(JSONArray(it)) } }
        prefs!!.takeIf { it.contains(K_TICKER) }?.let { _ticker.value = it.getString(K_TICKER, "")?.takeIf { t -> t.isNotEmpty() } }
        Unit
    }

    /** Fetches the owner's latest list; quietly keeps the saved one when offline. */
    suspend fun refresh(account: Account) = withContext(Dispatchers.IO) {
        if (account.user.value == null) return@withContext
        runCatching {
            val docs = Firestore.list("", "sponsors", newestFirst = false, limit = 50, token = account.token())
            val arr = JSONArray()
            var ticker: String? = DEFAULT_TICKER
            for ((id, f) in docs) {
                // The ticker's words live in the same collection, so no new Firebase rule is needed.
                if (id == TICKER_ID) {
                    val on = f.optJSONObject("active")?.optBoolean("booleanValue") ?: false
                    // Words saved before the rename to Cable TV (1.9.48) still say the old name.
                    ticker = f.text("text").trim().replace("Free Live TV", "Cable TV").takeIf { on && it.isNotEmpty() }
                    continue
                }
                arr.put(
                    JSONObject()
                        .put("id", id)
                        .put("name", f.text("name"))
                        .put("line", f.text("line"))
                        .put("contact", f.text("contact"))
                        .put("start", f.text("start"))
                        .put("end", f.text("end"))
                        .put("active", f.optJSONObject("active")?.optBoolean("booleanValue") ?: false)
                        .put("image", f.text("image"))
                        .put("banner", f.text("banner"))
                        .put("video", f.text("video"))
                        .put("website", f.text("website"))
                        .put("popup", f.text("popup")),
                )
            }
            file?.writeText(arr.toString())
            _all.value = parse(arr)
            prefs?.edit()?.putString(K_TICKER, ticker ?: "")?.apply()
            _ticker.value = ticker
        }
        Unit
    }

    /** The next sponsor in turn for [place] ("start" or "card"); null when there are none today. */
    fun next(place: String): Sponsor? {
        val list = current()
        if (list.isEmpty()) return null
        val p = prefs
        val i = p?.getInt("next_$place", 0) ?: 0
        p?.edit()?.putInt("next_$place", i + 1)?.apply()
        return list[Math.floorMod(i, list.size)]
    }

    private fun parse(arr: JSONArray): List<Sponsor> = (0 until arr.length()).mapNotNull { i ->
        val o = arr.optJSONObject(i) ?: return@mapNotNull null
        Sponsor(
            id = o.optString("id"),
            name = o.optString("name"),
            line = o.optString("line"),
            contact = o.optString("contact"),
            start = o.optString("start"),
            end = o.optString("end"),
            active = o.optBoolean("active"),
            picture = if (o.optBoolean("active")) decode(o.optString("image")) else null,
            banner = if (o.optBoolean("active")) o.optString("banner").takeIf { it.isNotEmpty() }?.let(::decode) else null,
            video = o.optString("video").trim().takeIf { it.startsWith("https://") }.orEmpty(),
            website = o.optString("website").trim(),
            popupVideo = o.optString("popup") == "video",
        )
    }

    /** The picture is a JPEG "data:" URL, made small by the admin page. */
    private fun decode(dataUrl: String): ImageBitmap? = runCatching {
        val bytes = Base64.decode(dataUrl.substringAfter(','), Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    }.getOrNull()

    private fun JSONObject.text(field: String): String = optJSONObject(field)?.optString("stringValue") ?: ""

    /** The ticker's document in sponsors/; older app versions skip it because it has no picture. */
    private const val TICKER_ID = "_ticker"
    private const val K_TICKER = "ticker"
    const val DEFAULT_TICKER = "Advertise your business on Cable TV  ·  WhatsApp 437 602 6500  ·  tv.bulkbazaar.ca/advertise"
}

/**
 * Counts how often each sponsor is shown, per day and place, so the owner can tell sponsors how
 * many times their ad was seen. Cable TV sends the totals to Firebase with the viewing totals.
 */
object SponsorViews {
    private var prefs: SharedPreferences? = null
    /** Day → sponsor id → name and counts per place. */
    private var days = JSONObject()

    @Synchronized
    fun init(context: Context) {
        if (prefs != null) return
        prefs = context.applicationContext.getSharedPreferences("sponsor_views", Context.MODE_PRIVATE)
        days = runCatching { JSONObject(prefs!!.getString(K_DAYS, "{}")!!) }.getOrDefault(JSONObject())
        // Counts that were never sent don't pile up.
        val keep = Watching.today(System.currentTimeMillis() - 7 * 24 * 3600_000L)
        days.keys().asSequence().toList().filter { it < keep }.forEach { days.remove(it) }
    }

    /** [sponsor] was shown at [place]: "start", "strip", "card", "bar" (1×2), or "click" (OK on the sponsor opened their website). */
    @Synchronized
    fun count(sponsor: Sponsor, place: String) {
        val day = Watching.today(System.currentTimeMillis())
        val d = days.optJSONObject(day) ?: JSONObject().also { days.put(day, it) }
        val s = d.optJSONObject(sponsor.id) ?: JSONObject().also { d.put(sponsor.id, it) }
        s.put("n", sponsor.name.take(80))
        s.put(place, s.optLong(place) + 1)
        save()
    }

    /** Every day's counts, oldest first: day → sponsor id → { n, start, strip, card, bar, click }. */
    @Synchronized
    fun totals(): List<Pair<String, Map<String, Map<String, Any>>>> =
        days.keys().asSequence().sorted().map { day ->
            val d = days.getJSONObject(day)
            day to d.keys().asSequence().associateWith { id ->
                val s = d.getJSONObject(id)
                mapOf<String, Any>(
                    "n" to s.optString("n"),
                    "start" to s.optLong("start"),
                    "strip" to s.optLong("strip"),
                    "card" to s.optLong("card"),
                    "bar" to s.optLong("bar"),
                    "click" to s.optLong("click"),
                )
            }
        }.toList()

    /** A day before today, once sent, is no longer needed. */
    @Synchronized
    fun sent(day: String) {
        if (day < Watching.today(System.currentTimeMillis())) {
            days.remove(day)
            save()
        }
    }

    private fun save() {
        prefs?.edit()?.putString(K_DAYS, days.toString())?.apply()
    }

    private const val K_DAYS = "days"
}
