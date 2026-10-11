package com.livetv.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TickerTextTest {
    @Test
    fun advertiseWordsAndSparkLeftOut() {
        assertEquals(
            "Hits  ·  Film songs  ·  Channel 23 on NextGen Cable",
            TickerText.clean("Spark Hits · Film songs · Channel 23 on NextGen Cable · Advertise free with us: WhatsApp 437 602 6500 · tv.bulkbazaar.ca/advertise"),
        )
        assertNull(TickerText.clean("Advertise your business free on NextGen Cable  ·  WhatsApp 437 602 6500  ·  tv.bulkbazaar.ca/advertise"))
    }

    @Test
    fun shownEndsWithFreeAndApps() {
        val line = TickerText.shown("Welcome to Spark TV, channel 1 on NextGen Cable · Spark TV")
        assertEquals(
            "Welcome to channel 1 on NextGen Cable, free for everyone  ·  Download our app on TV  ·  Lots more free apps at apps.bulkbazaar.ca",
            line,
        )
        assertEquals(line, TickerText.shown(line))
        assertNull(TickerText.shown(null))
    }
}
