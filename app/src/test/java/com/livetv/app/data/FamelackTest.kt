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
        assertEquals("English", channels[0].group)
        assertEquals("Geo-blocked", channels[1].group)
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
