package com.livetv.app.account

import android.content.Context
import android.os.Build
import com.livetv.app.Watching
import com.livetv.app.sponsor.SponsorViews
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** The signed-in viewer, as Firebase knows them. */
data class User(val uid: String, val name: String, val email: String)

/**
 * Signing in to Live TV with a Google account, through Firebase's REST API (no Firebase SDK).
 *
 * A Google ID token, from the phone's account picker or the TV code flow ([TvSignIn]), is traded
 * for a Firebase session; the refresh token is kept so the viewer stays signed in. Each start
 * also records the viewer in Firestore (users/{uid}) so the owner can count them.
 */
class Account private constructor(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences("account", Context.MODE_PRIVATE)
    private val appVersion: String =
        runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: ""
    private val isTv: Boolean = context.packageManager.hasSystemFeature("android.software.leanback")

    private val _user = MutableStateFlow(savedUser())
    val user: StateFlow<User?> = _user

    /** Why the viewer was signed out, shown on the sign-in screen (for example, used on another device). */
    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice

    /**
     * This installation's id. It outlives signing out, so the account's record can say which one
     * device it's on: one free account, one device at a time.
     */
    private val deviceId: String = context.applicationContext.getSharedPreferences("device", Context.MODE_PRIVATE).let { p ->
        p.getString("id", null) ?: java.util.UUID.randomUUID().toString().also { p.edit().putString("id", it).apply() }
    }

    private var idToken: String? = null
    private var idTokenExpires = 0L

    private fun savedUser(): User? {
        val uid = prefs.getString(K_UID, null) ?: return null
        if (prefs.getString(K_REFRESH, null) == null) return null
        return User(uid, prefs.getString(K_NAME, "") ?: "", prefs.getString(K_EMAIL, "") ?: "")
    }

    val isAdmin: Boolean get() = _user.value?.email.equals(FirebaseConfig.ADMIN_EMAIL, ignoreCase = true)

    /** Trades a Google ID token for a Firebase session and remembers it. */
    suspend fun signInWithGoogleIdToken(googleIdToken: String): User = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("postBody", "id_token=${enc(googleIdToken)}&providerId=google.com")
            .put("requestUri", "https://tv.bulkbazaar.ca")
            .put("returnSecureToken", true)
            .put("returnIdpCredential", true)
        val r = Http.postJson("$IDENTITY/accounts:signInWithIdp?key=${FirebaseConfig.API_KEY}", body)
        val user = User(
            uid = r.getString("localId"),
            name = r.optString("displayName").ifBlank { r.optString("fullName") },
            email = r.optString("email"),
        )
        prefs.edit()
            .putString(K_UID, user.uid)
            .putString(K_NAME, user.name)
            .putString(K_EMAIL, user.email)
            .putString(K_REFRESH, r.getString("refreshToken"))
            // The next record claims the account for this device (the newest device wins).
            .putBoolean(K_CLAIM, true)
            .apply()
        _notice.value = null
        idToken = r.getString("idToken")
        idTokenExpires = System.currentTimeMillis() + r.optLong("expiresIn", 3600) * 1000
        _user.value = user
        user
    }

    fun signOut() {
        prefs.edit().clear().apply()
        idToken = null
        _user.value = null
    }

    /** A valid Firebase ID token for Firestore calls, refreshed when it's about to run out. */
    suspend fun token(): String = withContext(Dispatchers.IO) {
        idToken?.takeIf { System.currentTimeMillis() < idTokenExpires - 60_000 }?.let { return@withContext it }
        val refresh = prefs.getString(K_REFRESH, null) ?: throw IOException("Not signed in")
        val r = try {
            Http.postForm(
                "$SECURE_TOKEN/token?key=${FirebaseConfig.API_KEY}",
                mapOf("grant_type" to "refresh_token", "refresh_token" to refresh),
            )
        } catch (e: Http.Status) {
            // The account was removed or disabled: ask to sign in again.
            if (e.code in 400..403) signOut()
            throw e
        }
        prefs.edit().putString(K_REFRESH, r.getString("refresh_token")).apply()
        idToken = r.getString("id_token")
        idTokenExpires = System.currentTimeMillis() + r.optLong("expires_in", 3600) * 1000
        idToken!!
    }

    /**
     * Records this start in users/{uid}: name, email, last opened, app version and device type,
     * plus the join date the first time. Quietly does nothing when offline.
     *
     * One account, one device: just after signing in, this device becomes the account's device.
     * On later starts, if the account has since been signed in on another device, this one is
     * signed out.
     */
    suspend fun recordOpen() = withContext(Dispatchers.IO) {
        val u = _user.value ?: return@withContext
        runCatching {
            val t = token()
            val doc = Firestore.doc("users/${u.uid}")
            val existing = runCatching { Firestore.get(doc, t) }
                .getOrElse { if (it is Http.Status && it.code == 404) null else throw it }
            val exists = existing != null
            val claiming = prefs.getBoolean(K_CLAIM, false)
            val accountDevice = existing?.optJSONObject("fields")?.optJSONObject("deviceId")?.optString("stringValue")
            if (!claiming && !accountDevice.isNullOrEmpty() && accountDevice != deviceId) {
                signOut()
                _notice.value = "Your account is now being used on another device. " +
                    "A free account works on one device at a time. Sign in again to watch here."
                return@runCatching
            }
            val fields = mutableMapOf<String, Any>(
                "name" to u.name,
                "email" to u.email,
                "lastOpened" to Date(),
                "appVersion" to appVersion,
                "device" to if (isTv) "TV" else "Phone/tablet",
                "model" to "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
                "deviceId" to deviceId,
            )
            if (!exists) fields["joined"] = Date()
            Firestore.patch(doc, fields, t)
            if (claiming) prefs.edit().putBoolean(K_CLAIM, false).apply()
        }
        Unit
    }

    /**
     * Sends how long each channel was watched each day to usage/{day}_{uid}, and how often each
     * sponsor was shown to sponsorViews/{day}_{uid}, for the owner's stats page. Each day's
     * document holds that day's totals so far and is simply replaced.
     */
    suspend fun reportViewing() = withContext(Dispatchers.IO) {
        val u = _user.value ?: return@withContext
        val days = Watching.totals().filter { (_, m) -> m.isNotEmpty() }
        val sponsorDays = SponsorViews.totals().filter { (_, m) -> m.isNotEmpty() }
        if (days.isEmpty() && sponsorDays.isEmpty()) return@withContext
        runCatching {
            val t = token()
            // How often each sponsor was shown, in sponsorViews/{day}_{uid}, for the stats page.
            for ((day, sponsors) in sponsorDays) {
                val fields = mapOf<String, Any>(
                    "uid" to u.uid,
                    "day" to day,
                    "device" to if (isTv) "TV" else "Phone/tablet",
                    "sponsors" to sponsors,
                    "updated" to Date(),
                )
                Firestore.patch(Firestore.doc("sponsorViews/${day}_${u.uid}"), fields, t)
                SponsorViews.sent(day)
            }
            for ((day, channels) in days) {
                val fields = mapOf<String, Any>(
                    "uid" to u.uid,
                    "day" to day,
                    "device" to if (isTv) "TV" else "Phone/tablet",
                    "appVersion" to appVersion,
                    "seconds" to channels.values.sumOf { it.seconds },
                    "channels" to channels.mapValues { (_, e) ->
                        mapOf<String, Any>("n" to e.name, "c" to e.country, "g" to e.group, "t" to e.category, "s" to e.seconds)
                    },
                    "updated" to Date(),
                )
                Firestore.patch(Firestore.doc("usage/${day}_${u.uid}"), fields, t)
                Watching.sent(day)
            }
        }
        Unit
    }

    companion object {
        private const val IDENTITY = "https://identitytoolkit.googleapis.com/v1"
        private const val SECURE_TOKEN = "https://securetoken.googleapis.com/v1"
        private const val K_UID = "uid"
        private const val K_NAME = "name"
        private const val K_EMAIL = "email"
        private const val K_REFRESH = "refresh"
        private const val K_CLAIM = "claim_device"

        @Volatile private var instance: Account? = null
        fun get(context: Context): Account =
            instance ?: synchronized(this) { instance ?: Account(context).also { instance = it } }

        private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    }
}

/** Tiny JSON-over-HTTPS helpers. */
internal object Http {
    class Status(val code: Int, message: String) : IOException(message)

    fun postJson(url: String, body: JSONObject, bearer: String? = null): JSONObject =
        JSONObject(request("POST", url, body.toString(), "application/json", bearer).ifBlank { "{}" })

    fun postForm(url: String, form: Map<String, String>): JSONObject {
        val body = form.entries.joinToString("&") { (k, v) -> "$k=${URLEncoder.encode(v, "UTF-8")}" }
        return JSONObject(request("POST", url, body, "application/x-www-form-urlencoded", null))
    }

    fun request(method: String, url: String, body: String?, type: String?, bearer: String?): String {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = if (method == "PATCH") "POST" else method
            if (method == "PATCH") setRequestProperty("X-HTTP-Method-Override", "PATCH")
            connectTimeout = 15_000
            readTimeout = 20_000
            bearer?.let { setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", type ?: "application/json")
            }
        }
        try {
            if (body != null) conn.outputStream.use { it.write(body.toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) throw Status(code, errorMessage(text) ?: "HTTP $code")
            return text
        } finally {
            conn.disconnect()
        }
    }

    private fun errorMessage(text: String): String? = runCatching {
        val e = JSONObject(text).opt("error")
        when (e) {
            is JSONObject -> e.optString("message")
            is String -> e // OAuth errors: a code such as "authorization_pending"
            else -> null
        }
    }.getOrNull()
}

/** Firestore's REST API: just what the user record and the Suggestions forum need. */
internal object Firestore {
    private val base get() =
        "https://firestore.googleapis.com/v1/projects/${FirebaseConfig.PROJECT_ID}/databases/(default)/documents"

    fun doc(path: String) = "$base/$path"

    fun get(url: String, token: String): JSONObject =
        JSONObject(Http.request("GET", url, null, null, token))

    fun patch(url: String, fields: Map<String, Any>, token: String) {
        val mask = fields.keys.joinToString("&") { "updateMask.fieldPaths=$it" }
        Http.request("PATCH", "$url?$mask", JSONObject().put("fields", encode(fields)).toString(), null, token)
    }

    /** Adds a document to a collection (path like "posts" or "posts/{id}/replies"); returns its id. */
    fun create(collection: String, fields: Map<String, Any>, token: String): String {
        val r = Http.postJson("$base/$collection", JSONObject().put("fields", encode(fields)), token)
        return r.getString("name").substringAfterLast('/')
    }

    fun delete(path: String, token: String) {
        Http.request("DELETE", "$base/$path", null, null, token)
    }

    /** Documents of [collection] under [parent] ("" for top level), ordered by createdAt. */
    fun list(parent: String, collection: String, newestFirst: Boolean, limit: Int, token: String): List<Pair<String, JSONObject>> {
        val query = JSONObject().put(
            "structuredQuery",
            JSONObject()
                .put("from", JSONArray().put(JSONObject().put("collectionId", collection)))
                .put(
                    "orderBy",
                    JSONArray().put(
                        JSONObject()
                            .put("field", JSONObject().put("fieldPath", "createdAt"))
                            .put("direction", if (newestFirst) "DESCENDING" else "ASCENDING"),
                    ),
                )
                .put("limit", limit),
        )
        val url = if (parent.isEmpty()) "$base:runQuery" else "$base/$parent:runQuery"
        val arr = JSONArray(Http.request("POST", url, query.toString(), "application/json", token))
        return (0 until arr.length()).mapNotNull { i ->
            val d = arr.getJSONObject(i).optJSONObject("document") ?: return@mapNotNull null
            d.getString("name").substringAfterLast('/') to (d.optJSONObject("fields") ?: JSONObject())
        }
    }

    private fun encode(fields: Map<String, Any>): JSONObject {
        val out = JSONObject()
        for ((k, v) in fields) {
            out.put(
                k,
                when (v) {
                    is Date -> JSONObject().put("timestampValue", iso(v))
                    is Int, is Long -> JSONObject().put("integerValue", v.toString())
                    is Boolean -> JSONObject().put("booleanValue", v)
                    is Map<*, *> -> JSONObject().put(
                        "mapValue",
                        JSONObject().put("fields", encode(v.entries.associate { (k, x) -> k.toString() to x!! })),
                    )
                    else -> JSONObject().put("stringValue", v.toString())
                },
            )
        }
        return out
    }

    fun iso(d: Date): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }.format(d)

    fun parseIso(s: String): Date? = runCatching {
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }.parse(s.take(19))
    }.getOrNull()

    fun JSONObject.str(field: String): String = optJSONObject(field)?.optString("stringValue") ?: ""
    fun JSONObject.time(field: String): Date? = optJSONObject(field)?.optString("timestampValue")?.let(::parseIso)
}
