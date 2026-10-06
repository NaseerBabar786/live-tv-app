package com.appbazaar.app.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Loads the app list from the website. The last good copy is kept on the device, so the store
 * still opens without internet; a fresh copy replaces it every time the store is opened.
 */
class StoreRepository(context: Context) {

    private val appContext = context.applicationContext
    private val cache = File(appContext.filesDir, "apps.json")

    fun cached(): List<StoreApp> =
        runCatching { if (cache.exists()) Catalog.parse(cache.readText()) else emptyList() }.getOrDefault(emptyList())

    suspend fun refresh(): List<StoreApp> = withContext(Dispatchers.IO) {
        // A changing query skips any stale copy kept by the phone or GitHub Pages' cache.
        val text = Net.fetchText(Catalog.APPS_JSON + "?t=" + System.currentTimeMillis())
        val apps = Catalog.parse(text)
        if (apps.isNotEmpty()) runCatching { cache.writeText(text) }
        // On the owner's device, newer test builds show as updates before anyone else gets them.
        if (OwnerTest.isOwner(appContext)) runCatching { OwnerTest.withTestBuilds(apps) }.getOrDefault(apps) else apps
    }
}
