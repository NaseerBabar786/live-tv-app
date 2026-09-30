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

    @Test
    fun readsCatalogue() {
        val md = """
            ### Grouped by category
            <table>
                <tr><td>News</td><td align="right">1004</td><td nowrap><code>https://iptv-org.github.io/iptv/categories/news.m3u</code></td></tr>
            </table>
            ### Grouped by language
                <tr><td align="left">Urdu</td><td align="right">84</td><td align="left" nowrap><code>https://iptv-org.github.io/iptv/languages/urd.m3u</code></td></tr>
            ### Grouped by broadcast area
            #### Countries
            - 🇵🇰 Pakistan <code>https://iptv-org.github.io/iptv/countries/pk.m3u</code>
              - Sindh <code>https://iptv-org.github.io/iptv/subdivisions/pk-sd.m3u</code>
            #### Regions
            - Asia <code>https://iptv-org.github.io/iptv/regions/asia.m3u</code>
            ### Grouped by sources
            - Ignored <code>https://iptv-org.github.io/iptv/sources/x.m3u</code>
        """.trimIndent()
        val listings = IptvOrg.parseCatalogue(md)
        assertEquals(
            listOf(
                IptvOrg.Listing(IptvOrg.Kind.CATEGORY, "News", "https://iptv-org.github.io/iptv/categories/news.m3u", 1004),
                IptvOrg.Listing(IptvOrg.Kind.LANGUAGE, "Urdu", "https://iptv-org.github.io/iptv/languages/urd.m3u", 84),
                IptvOrg.Listing(IptvOrg.Kind.COUNTRY, "Pakistan", "https://iptv-org.github.io/iptv/countries/pk.m3u"),
                IptvOrg.Listing(IptvOrg.Kind.REGION, "Asia", "https://iptv-org.github.io/iptv/regions/asia.m3u"),
            ),
            listings,
        )
    }
}
