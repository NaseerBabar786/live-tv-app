package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

class CheckedListTest {
    private val m3u = """
        #EXTM3U
        #EXTINF:-1 tvg-id="a.pk" tvg-country="PK" group-title="Pakistan" tvg-language="Urdu" tvg-genre="News",A News
        http://a/1.m3u8
        #EXTINF:-1 tvg-country="IN" group-title="India" tvg-language="Tamil" tvg-genre="",B
        #EXTVLCOPT:http-user-agent=VLC/3.0.21 LibVLC/3.0.21
        http://b/1.m3u8
        #EXTINF:-1 tvg-country="IN" group-title="India" tvg-language="Hindi" tvg-genre="Movies",C
        http://c/1.m3u8
    """.trimIndent()

    @Test
    fun readsCountryLanguageAndType() {
        val all = CheckedList.convert(M3uParser.parse(m3u))
        assertEquals(listOf("pk", "in", "in"), all.map { it.country })
        assertEquals(listOf("Urdu", "Tamil", "Hindi"), all.map { it.language })
        assertEquals(listOf("News", "General", "Movies"), all.map { it.category })
        assertEquals("VLC/3.0.21 LibVLC/3.0.21", all[1].userAgent)
    }

    @Test
    fun sectionsKeepTheirLanguagesAndTitles() {
        val all = CheckedList.convert(M3uParser.parse(m3u))
        val picked = CheckedList.sections(all, listOf(Famelack.MIX[1], Famelack.Section("pk", "")))
        assertEquals(listOf("C" to "Indian", "A News" to "Pakistan"), picked.map { it.name to it.group })
    }
}
