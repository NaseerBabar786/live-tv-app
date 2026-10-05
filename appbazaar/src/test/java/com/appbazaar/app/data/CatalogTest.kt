package com.appbazaar.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogTest {

    private val json = """
        {"store":{"name":"App Bazaar"},"apps":[
          {"id":"live-tv","name":"Live TV","tagline":"t","category":"Entertainment",
           "icon":{"image":"icons/live-tv.svg","color":"#1E1E2E"},"banner":"images/live-tv.jpg",
           "version":"1.9.10","platforms":["Android","Android TV"],"package":"com.naseerbabar.livetv",
           "links":{"android":"https://example.com/LiveTV.apk","web":"https://tv.bulkbazaar.ca"},
           "tvCode":"tv.bulkbazaar.ca/get"},
          {"id":"notes","name":"notes","icon":{"letter":"N","color":"#D97757"},"platforms":["Android"],
           "links":{"android":"https://example.com/n.apk"}},
          {"id":"paid","name":"Paid","price":"${'$'}2.99","links":{"android":"https://example.com/p.apk"}},
          {"id":"demo","name":"Demo","example":true},
          {"name":"No id"}
        ]}
    """.trimIndent()

    @Test
    fun readsAppsAndMakesPicturesAbsolute() {
        val apps = Catalog.parse(json)
        assertEquals(listOf("live-tv", "notes", "paid"), apps.map { it.id })
        val tv = apps[0]
        assertEquals("https://apps.bulkbazaar.ca/icons/live-tv.svg", tv.iconUrl)
        assertEquals("https://apps.bulkbazaar.ca/images/live-tv.jpg", tv.bannerUrl)
        assertEquals("com.naseerbabar.livetv", tv.packageName)
        assertEquals(0xFF1E1E2E, tv.iconColor)
        assertTrue(tv.forTv && tv.forPhone)
        assertEquals("tv.bulkbazaar.ca/get", tv.tvCode)
    }

    @Test
    fun appsWithoutPicturesUseTheirLetter() {
        val notes = Catalog.parse(json)[1]
        assertNull(notes.iconUrl)
        assertEquals("N", notes.iconLetter)
        assertNull(notes.packageName)
        assertFalse(notes.forTv)
    }

    @Test
    fun paidAppsAreNeverDownloadable() {
        assertNull(Catalog.parse(json)[2].apkUrl)
    }

    @Test
    fun colours() {
        assertEquals(0xFF0F9D74, Catalog.parseColor("#0F9D74"))
        assertNull(Catalog.parseColor("teal"))
    }
}
