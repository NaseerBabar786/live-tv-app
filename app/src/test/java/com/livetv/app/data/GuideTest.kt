package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class GuideTest {

    @Test
    fun keysMatchTheBuilder() {
        // The same names and keys as tools/build_epg.py gives.
        assertEquals("geonews", Guide.key("Geo News HD"))
        assertEquals("geonews", Guide.key("Geo News"))
        assertEquals("arydigital", Guide.key("ARY Digital (720p)"))
        assertEquals("cafe", Guide.key("Café TV"))
        assertEquals("starplus", Guide.key("Star Plus HD"))
        assertEquals("tv", Guide.key("TV"))
    }

    @Test
    fun nowAndNext() {
        val guide = Guide.parse(
            """{"updated":0,"channels":{"geonews":[[200,300,"Later"],[100,200,"Headlines"],[300,400,"Night"]]}}""",
        )
        val geo = Channel(name = "Geo News HD", url = "u")
        assertEquals("Headlines" to "Later", Guide.nowNext(guide, geo, 150).let { it.first?.title to it.second?.title })
        // Before the first programme: nothing now, the first one next.
        assertEquals(null to "Headlines", Guide.nowNext(guide, geo, 50).let { it.first?.title to it.second?.title })
        assertNull(Guide.nowNext(guide, geo, 500).first)
        assertNull(Guide.nowNext(guide, Channel(name = "Other", url = "x"), 150).first)
    }
}
