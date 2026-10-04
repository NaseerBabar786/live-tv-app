package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

class LocationTest {
    @Test
    fun citySearchResults() {
        val json = """{"results":[{"name":"Mississauga","latitude":43.58,"longitude":-79.65,
            "country_code":"CA","country":"Canada","admin1":"Ontario"},
            {"name":"Lahore","latitude":31.55,"longitude":74.34,"country_code":"PK","country":"Pakistan"}]}"""
        val places = Location.parseSearch(json)
        assertEquals(2, places.size)
        assertEquals("Mississauga", places[0].city)
        assertEquals("CA", places[0].country)
        assertEquals("Ontario, Canada", places[0].region)
        assertEquals("Mississauga, Ontario, Canada", places[0].label)
        assertEquals("Pakistan", places[1].region)
    }

    @Test
    fun noResults() {
        assertEquals(0, Location.parseSearch("""{"generationtime_ms":0.2}""").size)
    }
}
