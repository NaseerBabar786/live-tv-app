package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

class FamelackTest {

    @Test
    fun parsesChannelsAndSkipsYoutubeOnly() {
        val json = """
            [
              {"nanoid":"a1","name":"News One","sources":{"streams":["https://x/one.m3u8","https://y/one.m3u8"]},
               "languages":["eng"],"country":"ca","isGeoBlocked":false},
              {"nanoid":"b2","name":"Tube Only","sources":{"youtube":["abc"]},
               "languages":["eng"],"country":"ca","isGeoBlocked":false},
              {"nanoid":"c3","name":"Blocked","sources":{"streams":["https://z/b.m3u8"]},
               "languages":["fra"],"country":"ca","isGeoBlocked":true}
            ]
        """.trimIndent()

        val channels = Famelack.parseChannels(json)

        assertEquals(listOf("News One", "Blocked"), channels.map { it.name })
        assertEquals("https://x/one.m3u8", channels[0].url)
        assertEquals(listOf("https://y/one.m3u8"), channels[0].alternates)
        assertEquals("English", channels[0].category)
        assertEquals("Geo-blocked", channels[1].category)
    }

    @Test
    fun appliesLogoAndCategory() {
        val json = """
            [{"nanoid":"a1","name":"News One","sources":{"streams":["https://x/one.m3u8"]},
              "languages":["eng"],"country":"ca","isGeoBlocked":false},
             {"nanoid":"g1","name":"Gen","sources":{"streams":["https://x/g.m3u8"]},
              "languages":["urd"],"country":"pk","isGeoBlocked":false}]
        """.trimIndent()
        val info = Famelack.parseInfo("""{"a1":["https://logo/a.png","news"],"g1":["https://logo/g.png","general"]}""")

        val channels = Famelack.parseChannels(json, info)

        assertEquals("https://logo/a.png", channels[0].logo)
        assertEquals("News", channels[0].category)
        // "general" says nothing useful, so the language is used instead.
        assertEquals("Urdu", channels[1].category)
    }

    @Test
    fun sectionAndLanguageFilter() {
        val json = """
            [{"nanoid":"h","name":"Hindi One","sources":{"streams":["https://x/h.m3u8"]},"languages":["hin"],"isGeoBlocked":false},
             {"nanoid":"t","name":"Tamil One","sources":{"streams":["https://x/t.m3u8"]},"languages":["tam"],"isGeoBlocked":false},
             {"nanoid":"p","name":"Punjabi One","sources":{"streams":["https://x/p.m3u8"]},"languages":["eng","pan"],"isGeoBlocked":false}]
        """.trimIndent()

        val channels = Famelack.parseChannels(json, section = "Indian", languages = setOf("hin", "urd", "pan"))

        assertEquals(listOf("Hindi One", "Punjabi One"), channels.map { it.name })
        assertEquals(listOf("Indian", "Indian"), channels.map { it.group })
        // The matching language names the category, not the first one listed.
        assertEquals("Punjabi", channels[1].category)
    }

    @Test
    fun parsesCountriesSortedByName() {
        val json = """
            {"PK":{"country":"Pakistan","channelCount":73},
             "CA":{"country":"Canada","channelCount":161},
             "ZZ":{"country":"Empty","channelCount":0}}
        """.trimIndent()

        val countries = Famelack.parseCountries(json)

        assertEquals(listOf("ca", "pk"), countries.map { it.code })
        assertEquals(161, countries[0].channelCount)
    }

    @Test
    fun sourceRoundTrip() {
        assertEquals("pk", Famelack.countryCode(Famelack.source("PK")))
        assertEquals(null, Famelack.countryCode("https://example.com/list.m3u"))
    }
}
