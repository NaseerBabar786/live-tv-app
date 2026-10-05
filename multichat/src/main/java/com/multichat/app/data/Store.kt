package com.multichat.app.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** One WhatsApp account, shown in its own WebView profile. */
data class Account(
    val id: String,
    val name: String,
    val color: Int,
    /** Path of the account's photo in the app's private storage, or null for initials. */
    val photo: String? = null,
    val muted: Boolean = false,
    val quietOn: Boolean = false,
    val quietFrom: Int = 22 * 60,
    val quietTo: Int = 7 * 60,
)

/** A saved quick reply. */
data class Template(val id: String, val title: String, val text: String)

data class Settings(
    val pinSalt: String? = null,
    val pinHash: String? = null,
    val fingerprint: Boolean = true,
    /** Minutes away from the app before it locks again; 0 locks as soon as you leave. */
    val autoLockMinutes: Int = 1,
    /** Notifications show only the account name, not the message. */
    val hidePreview: Boolean = false,
    /** Keeps a small "running" notification so Android does not close the accounts. */
    val keepRunning: Boolean = true,
    /** Text size of the WhatsApp pages, in percent. */
    val textZoom: Int = 100,
    val active: String? = null,
) {
    val hasPin: Boolean get() = pinHash != null && pinSalt != null
}

/** Accounts, quick replies and settings, saved on the phone only. */
object Store {

    val COLORS = listOf(
        0xFF25A18E, 0xFF1E88E5, 0xFF8E24AA, 0xFFE53935, 0xFFFB8C00,
        0xFFFDD835, 0xFF43A047, 0xFF00ACC1, 0xFFD81B60, 0xFF6D4C41,
    ).map { it.toInt() }

    private lateinit var prefs: SharedPreferences
    private lateinit var photoDir: File

    private val _accounts = MutableStateFlow<List<Account>>(emptyList())
    val accounts: StateFlow<List<Account>> = _accounts.asStateFlow()

    private val _templates = MutableStateFlow<List<Template>>(emptyList())
    val templates: StateFlow<List<Template>> = _templates.asStateFlow()

    private val _settings = MutableStateFlow(Settings())
    val settings: StateFlow<Settings> = _settings.asStateFlow()

    fun init(context: Context) {
        if (::prefs.isInitialized) return
        prefs = context.applicationContext.getSharedPreferences("multichat", Context.MODE_PRIVATE)
        photoDir = File(context.applicationContext.filesDir, "photos").apply { mkdirs() }
        _accounts.value = readAccounts()
        _templates.value = readTemplates()
        _settings.value = readSettings()
    }

    fun newId(): String = UUID.randomUUID().toString().replace("-", "").take(12)

    fun account(id: String?): Account? = _accounts.value.firstOrNull { it.id == id }

    fun newAccount(): Account {
        val list = _accounts.value
        val used = list.map { it.color }.toSet()
        val color = COLORS.firstOrNull { it !in used } ?: COLORS[list.size % COLORS.size]
        val acc = Account(id = newId(), name = "Account ${list.size + 1}", color = color)
        setAccounts(list + acc)
        return acc
    }

    fun saveAccount(acc: Account) = setAccounts(_accounts.value.map { if (it.id == acc.id) acc else it })

    fun removeAccount(id: String) {
        account(id)?.photo?.let { File(it).delete() }
        setAccounts(_accounts.value.filterNot { it.id == id })
        if (_settings.value.active == id) update { it.copy(active = _accounts.value.firstOrNull()?.id) }
    }

    fun move(id: String, delta: Int) {
        val list = _accounts.value.toMutableList()
        val i = list.indexOfFirst { it.id == id }
        val j = i + delta
        if (i < 0 || j !in list.indices) return
        list[i] = list[j].also { list[j] = list[i] }
        setAccounts(list)
    }

    /** Where to save a new photo for the account; a new name each time so pictures refresh. */
    fun newPhotoFile(id: String): File = File(photoDir, "$id-${System.currentTimeMillis()}.jpg")

    fun saveTemplates(list: List<Template>) {
        _templates.value = list
        prefs.edit().putString("templates", JSONArray().apply {
            list.forEach { put(JSONObject().put("id", it.id).put("title", it.title).put("text", it.text)) }
        }.toString()).apply()
    }

    fun update(change: (Settings) -> Settings) {
        val s = change(_settings.value)
        _settings.value = s
        prefs.edit().putString("settings", JSONObject().apply {
            put("pinSalt", s.pinSalt ?: JSONObject.NULL)
            put("pinHash", s.pinHash ?: JSONObject.NULL)
            put("fingerprint", s.fingerprint)
            put("autoLockMinutes", s.autoLockMinutes)
            put("hidePreview", s.hidePreview)
            put("keepRunning", s.keepRunning)
            put("textZoom", s.textZoom)
            put("active", s.active ?: JSONObject.NULL)
        }.toString()).apply()
    }

    private fun setAccounts(list: List<Account>) {
        _accounts.value = list
        prefs.edit().putString("accounts", JSONArray().apply {
            list.forEach {
                put(JSONObject().apply {
                    put("id", it.id)
                    put("name", it.name)
                    put("color", it.color)
                    put("photo", it.photo ?: JSONObject.NULL)
                    put("muted", it.muted)
                    put("quietOn", it.quietOn)
                    put("quietFrom", it.quietFrom)
                    put("quietTo", it.quietTo)
                })
            }
        }.toString()).apply()
    }

    private fun readAccounts(): List<Account> = runCatching {
        val arr = JSONArray(prefs.getString("accounts", "[]"))
        (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            Account(
                id = o.getString("id"),
                name = o.optString("name", "Account"),
                color = o.optInt("color", COLORS[0]),
                photo = o.optString("photo").takeIf { it.isNotBlank() && it != "null" && File(it).exists() },
                muted = o.optBoolean("muted"),
                quietOn = o.optBoolean("quietOn"),
                quietFrom = o.optInt("quietFrom", 22 * 60),
                quietTo = o.optInt("quietTo", 7 * 60),
            )
        }
    }.getOrDefault(emptyList())

    private fun readTemplates(): List<Template> {
        val saved = prefs.getString("templates", null)
            ?: return listOf(
                Template("t1", "Thanks", "Thank you for your message. I will get back to you shortly."),
                Template("t2", "Address", "Our address is "),
                Template("t3", "Busy", "Sorry, I am busy right now. I will call you back soon."),
            )
        return runCatching {
            val arr = JSONArray(saved)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                Template(o.getString("id"), o.optString("title"), o.optString("text"))
            }
        }.getOrDefault(emptyList())
    }

    private fun readSettings(): Settings = runCatching {
        val o = JSONObject(prefs.getString("settings", "{}") ?: "{}")
        fun str(key: String) = o.optString(key).takeIf { it.isNotBlank() && it != "null" }
        Settings(
            pinSalt = str("pinSalt"),
            pinHash = str("pinHash"),
            fingerprint = o.optBoolean("fingerprint", true),
            autoLockMinutes = o.optInt("autoLockMinutes", 1),
            hidePreview = o.optBoolean("hidePreview", false),
            keepRunning = o.optBoolean("keepRunning", true),
            textZoom = o.optInt("textZoom", 100),
            active = str("active"),
        )
    }.getOrDefault(Settings())
}
