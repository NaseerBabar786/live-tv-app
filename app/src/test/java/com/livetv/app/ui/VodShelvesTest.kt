package com.livetv.app.ui

import com.livetv.app.data.Channel
import com.livetv.app.data.Vod
import org.junit.Assert.assertEquals
import org.junit.Test

class VodShelvesTest {
    private fun yt(name: String, language: String, category: String) =
        Channel(name = name, url = "https://youtu.be/${name.hashCode().toString().padStart(11, '0').takeLast(11)}", language = language, category = category)

    @Test
    fun sparkTvAndMtaGetTheirOwnFolders() {
        val news = yt("Spark TV One News · 9 October 2026", "Urdu", "Shows").copy(group = "Spark TV One")
        val mta = yt("Friday Sermon Episode 3", "Urdu", "Shows").copy(group = "MTA Friday Sermon")
        val drama = yt("Kaffara Episode 1", "Urdu", "Series")
        val (shelves, folders) = library(
            listOf(
                com.livetv.app.data.Playlist("Pakistani dramas", Vod.DRAMAS_URL) to listOf(drama),
                com.livetv.app.data.Playlist("Spark TV One News", Vod.NEWS_ARCHIVE_URL) to listOf(news),
                com.livetv.app.data.Playlist("MTA", com.livetv.app.data.Mta.VIDEOS_URL) to listOf(mta),
            ),
        )
        val urdu = shelves.getValue(Vod.Language.URDU)
        assertEquals(listOf("Kaffara"), urdu.series.map { it.name })
        assertEquals(emptyList<String>(), urdu.shows.map { it.name })
        assertEquals(listOf("Spark TV One"), folders.getValue(Vod.Folder.SPARK).shows.map { it.name })
        assertEquals(listOf("Friday Sermon"), folders.getValue(Vod.Folder.MTA).shows.map { it.name })
    }

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
        // Punjabi serials and shows are listed too (owner, PR #353).
        assertEquals(listOf("Jatt"), shelves.getValue(Vod.Language.PUNJABI).series.map { it.name })
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

    @Test
    fun showsATitleListedTwiceOnce() {
        fun video(name: String, url: String, language: String, category: String) =
            Channel(name = name, url = url, language = language, category = category)
        val urdu = shelves(
            listOf(
                video("Izzat Episode 12", "https://youtu.be/aaaaaaaaaaa", "Urdu", "Series"),
                video("izzat - Episode 12", "https://www.dailymotion.com/video/x8abcd1", "Urdu", "Series"),
                video("Izzat Episode 13", "https://www.dailymotion.com/video/x8abcd2", "Urdu", "Series"),
                video("The Kid (1921)", "https://archive.org/download/kid/kid.mp4", "Urdu", "Movies"),
                video("Kid", "https://upload.wikimedia.org/kid.webm", "Urdu", "Movies"),
            ),
        ).getValue(Vod.Language.URDU)
        val izzat = urdu.series.single()
        assertEquals(listOf(12, 13), izzat.episodes.map { it.number })
        // The first list's copy is kept: YouTube's episode 12, the Archive's film.
        assertEquals("https://youtu.be/aaaaaaaaaaa", izzat.episodes.first().channel.url)
        assertEquals(listOf("The Kid (1921)"), urdu.movies.map { it.name })
    }
}
