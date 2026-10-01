package com.livecam.app.ui

import android.content.Context
import android.webkit.CookieManager

/**
 * Keeps the Wyze sign-in across Back, app restarts and updates. Wyze keeps part of its sign-in
 * in cookies that only last while the browser is open, which an app's WebView loses whenever
 * the screen closes. Their values are saved here as the page changes and put back before the
 * page loads again, valid for 30 days. A cookie that's still there is never touched, so a new
 * sign-in or a sign-out always wins.
 */
object WyzeSignIn {
    private val SITES = listOf("https://my.wyze.com", "https://auth.wyze.com", "https://wyze.com")
    private const val PREFS = "wyze_sign_in"
    private const val KEEP_SECONDS = 30 * 24 * 60 * 60

    fun save(context: Context) {
        val cookies = CookieManager.getInstance()
        val edit = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        for (site in SITES) {
            val current = cookies.getCookie(site)
            if (current.isNullOrBlank()) edit.remove(site) else edit.putString(site, current)
        }
        edit.apply()
        cookies.flush()
    }

    fun restore(context: Context) {
        val cookies = CookieManager.getInstance()
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        for (site in SITES) {
            val saved = prefs.getString(site, null) ?: continue
            val present = names(cookies.getCookie(site))
            for (pair in saved.split(";").map { it.trim() }.filter { '=' in it }) {
                if (pair.substringBefore('=') in present) continue
                cookies.setCookie(site, "$pair; Max-Age=$KEEP_SECONDS; Path=/; Secure")
            }
        }
        cookies.flush()
    }

    private fun names(cookie: String?): Set<String> =
        cookie.orEmpty().split(";").map { it.trim().substringBefore('=') }.filter { it.isNotEmpty() }.toSet()
}
