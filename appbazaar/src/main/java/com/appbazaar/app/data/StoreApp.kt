package com.appbazaar.app.data

import org.json.JSONObject
import java.net.URI

/** One app from the store's apps.json, the same file the apps.bulkbazaar.ca website shows. */
data class StoreApp(
    val id: String,
    val name: String,
    val tagline: String,
    val description: String,
    val whatsNew: String,
    val category: String,
    val version: String,
    val updated: String,
    val platforms: List<String>,
    /** Android package name, used to tell whether the app is installed and which version. */
    val packageName: String?,
    val iconUrl: String?,
    val iconLetter: String,
    val iconColor: Long,
    val bannerUrl: String?,
    val apkUrl: String?,
    val webUrl: String?,
    val tvCode: String?,
    val featured: Boolean,
    val paid: Boolean,
) {
    val forTv: Boolean get() = platforms.any { it.contains("TV", ignoreCase = true) }
    val forPhone: Boolean get() = platforms.any { it == "Android" || it.contains("phone", ignoreCase = true) }
}

object Catalog {

    /** The store's own website; apps.json and the pictures live here. */
    const val SITE = "https://apps.bulkbazaar.ca/"
    const val APPS_JSON = SITE + "apps.json"

    /** App Bazaar's own entry in apps.json, so it updates itself like any other app. */
    const val SELF_ID = "app-bazaar"

    /**
     * Reads apps.json. Pictures with relative paths ("icons/live-tv.svg") are made absolute
     * against [base]. Paid apps and entries marked "example" are left out: they can't be installed here.
     */
    fun parse(json: String, base: String = SITE): List<StoreApp> {
        val apps = JSONObject(json).optJSONArray("apps") ?: return emptyList()
        return (0 until apps.length()).mapNotNull { i ->
            val a = apps.optJSONObject(i) ?: return@mapNotNull null
            if (a.optBoolean("example")) return@mapNotNull null
            val id = a.optString("id").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val name = a.optString("name").ifBlank { id }
            val icon = a.optJSONObject("icon")
            val links = a.optJSONObject("links")
            val platforms = a.optJSONArray("platforms")
            StoreApp(
                id = id,
                name = name,
                tagline = a.optString("tagline"),
                description = a.optString("description"),
                whatsNew = a.optString("whatsNew"),
                category = a.optString("category"),
                version = a.optString("version"),
                updated = a.optString("updated"),
                platforms = platforms?.let { p -> (0 until p.length()).map { p.optString(it) } } ?: listOf("Android"),
                packageName = a.optString("package").takeIf { it.isNotBlank() },
                iconUrl = icon?.optString("image")?.takeIf { it.isNotBlank() }?.let { resolve(base, it) },
                iconLetter = icon?.optString("letter")?.takeIf { it.isNotBlank() } ?: name.take(1).uppercase(),
                iconColor = parseColor(icon?.optString("color")) ?: 0xFF12999C,
                bannerUrl = a.optString("banner").takeIf { it.isNotBlank() }?.let { resolve(base, it) },
                apkUrl = links?.optString("android")?.takeIf { it.isNotBlank() && !a.has("price") },
                webUrl = links?.optString("web")?.takeIf { it.isNotBlank() },
                tvCode = a.optString("tvCode").takeIf { it.isNotBlank() },
                featured = a.optBoolean("featured"),
                paid = a.has("price"),
            )
        }
    }

    fun resolve(base: String, path: String): String =
        runCatching { URI(base).resolve(path).toString() }.getOrDefault(path)

    /** "#1E1E2E" or "#801E1E2E" -> ARGB, or null when it isn't a colour. */
    fun parseColor(s: String?): Long? {
        val hex = s?.trim()?.removePrefix("#") ?: return null
        val v = hex.toLongOrNull(16) ?: return null
        return when (hex.length) {
            6 -> 0xFF000000 or v
            8 -> v
            else -> null
        }
    }
}
