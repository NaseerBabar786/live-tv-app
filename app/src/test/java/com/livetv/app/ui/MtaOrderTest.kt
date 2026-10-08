package com.livetv.app.ui

import com.livetv.app.data.Channel
import com.livetv.app.data.Mta
import com.livetv.app.data.MyChannel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** MTA's channels, when on, come right after our Spark channels (owner, 2026-10-07), as 81 to 88 (2026-10-08). */
class MtaOrderTest {
    private val ours = Channel("Bazaar TV", "mychannel://main", number = 1)
    private val mta = Mta.CHANNELS.mapIndexed { i, c -> c.copy(number = MyChannel.MTA_FIRST + i) }
    private val geo = Channel("Geo News", "https://x/geo.m3u8", language = "Urdu", country = "pk", number = MyChannel.OTHERS_FIRST)
    private val cbc = Channel("CBC", "https://x/cbc.m3u8", language = "English", country = "ca", number = MyChannel.OTHERS_FIRST + 1)

    @Test
    fun mtaComesAfterOursAndBeforeFavorites() {
        val s = UiState(channels = listOf(ours) + mta + listOf(geo, cbc), favorites = setOf(cbc.id))
        val shown = s.visibleChannels
        assertEquals(ours, shown.first())
        assertEquals(mta, shown.subList(1, 9))
        assertEquals(listOf(cbc, geo), shown.drop(9))
        assertEquals(listOf(81, 88, 101), listOf(mta.first().number, mta.last().number, geo.number))
    }

    @Test
    fun favoritesKeepMtaAfterOursAndNumberTheRestAfterIt() {
        val s = UiState(channels = listOf(ours) + mta + listOf(geo, cbc), favorites = setOf(cbc.id), filter = FILTER_FAVORITES)
        val shown = s.visibleChannels
        assertEquals(listOf(ours) + mta, shown.take(9))
        assertEquals("CBC", shown[9].name)
        assertEquals(101, shown[9].number)
    }

    @Test
    fun mtaIgnoresTheLanguagePicker() {
        val s = UiState(channels = listOf(ours) + mta + listOf(geo, cbc), languageFilter = setOf("Urdu"))
        assertEquals(listOf(ours) + mta + listOf(geo), s.visibleChannels)
    }

    @Test
    fun aLanguageChipShowsThatLanguageOursFirst() {
        val urdu = Channel("Spark Dramas Urdu", "mychannel://dramas", number = 2, language = "Urdu", group = "Spark Urdu")
        val s = UiState(channels = listOf(ours, urdu) + mta + listOf(geo, cbc), language = "Urdu")
        assertEquals(listOf(urdu, geo), s.visibleChannels)
    }

    @Test
    fun onlyMtasOwnLinksCount() {
        assertTrue(Mta.CHANNELS.all(Mta::isMta))
        assertFalse(Mta.isMta(geo))
    }
}
