package com.livetv.app.ui

import com.livetv.app.data.Channel
import com.livetv.app.data.Vod
import org.junit.Assert.assertEquals
import org.junit.Test

class VodShelvesTest {
    private fun yt(name: String, language: String, category: String) =
        Channel(name = name, url = "https://youtu.be/${name.hashCode().toString().padStart(11, '0').takeLast(11)}", language = language, category = category)

    @Test
    fun sortsByLanguageSectionAndFolder() {
        val shelves = shelves(
            listOf(
                yt("Kaffara Episode 1", "Urdu", "Series"),
                yt("Kaffara Episode 2", "Urdu", "Series"),
                yt("Tamasha Episode 55", "Urdu", "Shows"),
                yt("Pushpa", "Hindi", "Movies"),
                yt("Jatt Episode 1", "Punjabi", "Series"),
            ),
        )
        val urdu = shelves.getValue(Vod.Language.URDU)
        assertEquals(listOf("Kaffara"), urdu.series.map { it.name })
        assertEquals(2, urdu.series.single().episodes.size)
        assertEquals(listOf("Tamasha"), urdu.shows.map { it.name })
        assertEquals(listOf("Pushpa"), shelves.getValue(Vod.Language.HINDI).movies.map { it.name })
        // Punjabi is movies only.
        assertEquals(true, shelves.getValue(Vod.Language.PUNJABI).isEmpty)
    }

    @Test
    fun fileUnnumberedShowsKidsAndTelefilmsByGenre() {
        fun item(name: String, group: String, category: String) =
            yt(name, "Urdu", category).copy(group = group)
        val urdu = shelves(
            listOf(
                item("Chicken Karahi Recipe", "Food Fusion", "Shows"),
                item("Aloo Keema", "Food Fusion", "Shows"),
                item("Burka Avenger Episode 1", "Burka Avenger", "Kids"),
                item("Mann Pagal", "Telefilms", "Movies"),
            ),
        ).getValue(Vod.Language.URDU)
        assertEquals(listOf("Food Fusion"), urdu.shows.map { it.name })
        assertEquals(2, urdu.shows.single().episodes.size)
        assertEquals(listOf("Burka Avenger"), urdu.kids.map { it.name })
        assertEquals(listOf("Mann Pagal"), urdu.movies.map { it.name })
        assertEquals(true, urdu.series.isEmpty())
        assertEquals(urdu.kids, urdu.folders(Vod.Section.KIDS))
    }
}
