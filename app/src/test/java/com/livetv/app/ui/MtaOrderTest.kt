package com.livetv.app.ui

import com.livetv.app.data.Channel
import com.livetv.app.data.Mta
import com.livetv.app.data.MyChannel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** MTA's channels, when on, come right after our Bazaar channels (owner, 2026-10-07). */
class MtaOrderTest {
    private val ours = Channel("Bazaar TV", "mychannel://main", number = 1)
    private val mta = Mta.CHANNELS.mapIndexed { i, c -> c.copy(number = MyChannel.COUNT + i + 1) }
    private val geo = Channel("Geo News", "https://x/geo.m3u8", language = "Urdu", country = "pk", number = MyChannel.COUNT + 9)
    private val cbc = Channel("CBC", "https://x/cbc.m3u8", language = "English", country = "ca", number = MyChannel.COUNT + 10)

    @Test
    fun mtaComesAfterOursAndBeforeFavorites() {
        val s = UiState(channels = listOf(ours) + mta + listOf(geo, cbc), favorites = setOf(cbc.id))
        val shown = s.visibleChannels
        assertEquals(ours, shown.first())
        assertEquals(mta, shown.subList(1, 9))
        assertEquals(listOf(cbc, geo), shown.drop(9))
        assertEquals(listOf(17, 24, 25), listOf(mta.first().number, mta.last().number, geo.number))
    }

    @Test
    fun favoritesKeepMtaAfterOursAndNumberTheRestAfterIt() {
        val s = UiState(channels = listOf(ours) + mta + listOf(geo, cbc), favorites = setOf(cbc.id), filter = FILTER_FAVORITES)
        val shown = s.visibleChannels
        assertEquals(listOf(ours) + mta, shown.take(9))
        assertEquals("CBC", shown[9].name)
        assertEquals(24, shown[9].number)
    }

    @Test
    fun mtaIgnoresTheLanguagePicker() {
        val s = UiState(channels = listOf(ours) + mta + listOf(geo, cbc), languageFilter = setOf("Urdu"))
        assertEquals(listOf(ours) + mta + listOf(geo), s.visibleChannels)
    }

    @Test
    fun onlyMtasOwnLinksCount() {
        assertTrue(Mta.CHANNELS.all(Mta::isMta))
        assertFalse(Mta.isMta(geo))
    }
}
