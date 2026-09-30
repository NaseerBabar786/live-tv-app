package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

class IptvOrgTest {

    private val india = """
        #EXTM3U
        #EXTINF:-1 tvg-id="a" tvg-logo="https://x/a.png" group-title="News",Aaj Tak (1080p)
        https://a.example/live.m3u8
        #EXTINF:-1 tvg-id="b" group-title="Kids;Religious",Bal TV (576p) [Not 24/7]
        https://b.example/live.m3u8
        #EXTINF:-1 tvg-id="c" group-title="Undefined",Tamil One (720p) [Geo-blocked]
        https://c.example/live.m3u8
    """.trimIndent()

    private val languages = mapOf(
        "https://a.example/live.m3u8" to "Hindi",
        "https://b.example/live.m3u8" to "Panjabi",
        "https://c.example/live.m3u8" to "Tamil",
    )

    @Test
    fun cleansNamesAndMapsCategories() {
        val channels = IptvOrg.convert(M3uParser.parse(india), languages, section = "Indian")
        assertEquals(listOf("Aaj Tak", "Bal TV", "Tamil One"), channels.map { it.name })
        assertEquals(listOf("News", "Kids", "Geo-blocked"), channels.map { it.category })
        assertEquals(listOf("Hindi", "Punjabi", "Tamil"), channels.map { it.language })
        assertEquals(setOf("Indian"), channels.map { it.group }.toSet())
    }

    @Test
    fun keepsOnlyChosenLanguages() {
        val channels = IptvOrg.convert(
            M3uParser.parse(india), languages, section = "Indian",
            keepLanguages = setOf("Hindi", "Urdu", "Punjabi"),
        )
        assertEquals(listOf("Aaj Tak", "Bal TV"), channels.map { it.name })
    }

    @Test
    fun keepsEverythingWithoutLanguageIndex() {
        val channels = IptvOrg.convert(
            M3uParser.parse(india), emptyMap(), section = "Indian",
            keepLanguages = setOf("Hindi"),
        )
        assertEquals(3, channels.size)
    }
}
