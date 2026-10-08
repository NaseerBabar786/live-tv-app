package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VodTest {
    private fun ch(name: String, url: String, group: String? = null) = Channel(name = name, url = url, group = group)

    @Test
    fun liveStreamsAreNeverMovies() {
        assertEquals(Vod.Kind.LIVE, Vod.kind(ch("Star Gold", "http://x/live/star.m3u8", "Movies")))
        assertEquals(Vod.Kind.LIVE, Vod.kind(ch("Film Channel", "http://x/live/u/p/12.ts", "Movies")))
        assertEquals(Vod.Kind.LIVE, Vod.kind(ch("Movies 24", "http://x/movie/stream.m3u8")))
    }

    @Test
    fun xtreamLinksAndVideoFiles() {
        assertEquals(Vod.Kind.MOVIE, Vod.kind(ch("Inception", "http://x:8080/movie/u/p/123.mkv")))
        assertEquals(Vod.Kind.EPISODE, Vod.kind(ch("Some Show", "http://x:8080/series/u/p/456.mp4")))
        assertEquals(Vod.Kind.MOVIE, Vod.kind(ch("WALL-E 2008", "http://x/films/walle.mp4")))
        assertEquals(Vod.Kind.EPISODE, Vod.kind(ch("Ertugrul S01 E05", "http://x/v/e5.mp4")))
        assertEquals(Vod.Kind.EPISODE, Vod.kind(ch("Part 3", "http://x/v/p3.mkv", "Pakistani Dramas")))
    }

    @Test
    fun youTubeVideos() {
        assertEquals(Vod.Kind.EPISODE, Vod.kind(ch("Kaffara Episode 45", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")))
        assertEquals(Vod.Kind.MOVIE, Vod.kind(ch("A film", "https://youtu.be/dQw4w9WgXcQ")))
        assertEquals(Vod.Kind.LIVE, Vod.kind(ch("A channel", "https://www.youtube.com/@ARYDigitalasia")))
    }

    @Test
    fun parsesEpisodeNumbers() {
        assertEquals(Triple("Ertugrul", 1, 5), Vod.parse("Ertugrul S01 E05"))
        assertEquals(Triple("The Office", 2, 3), Vod.parse("The Office - S02E03 - The Dundies"))
        assertEquals(Triple("Friends", 1, 2), Vod.parse("Friends 1x02"))
        assertEquals(Triple("Mere Humsafar", null, 12), Vod.parse("Mere Humsafar Episode 12"))
        assertEquals(Triple("Kabhi Main", null, 7), Vod.parse("Kabhi Main - Ep. 7"))
        assertNull(Vod.parse("WALL-E 2008"))
        assertNull(Vod.parse("Inception"))
    }

    @Test
    fun groupsEpisodesIntoShows() {
        val shows = Vod.shows(
            listOf(
                ch("Friends S01E02", "u2"),
                ch("Friends S01E01", "u1"),
                ch("Dark S02E01", "d1"),
                ch("Chapter One", "x1", "Mystery Show"),
            )
        )
        assertEquals(listOf("Dark", "Friends", "Mystery Show"), shows.map { it.name })
        assertEquals(listOf("u1", "u2"), shows[1].episodes.map { it.channel.url })
        assertEquals("S1 E1", shows[1].episodes[0].label)
        assertEquals("Chapter One", shows[2].episodes[0].label)
    }
}

class VodLanguageTest {
    private fun ch(name: String, group: String? = null, language: String? = null, category: String? = null) =
        Channel(name = name, url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ", group = group, language = language, category = category)

    @Test
    fun languages() {
        assertEquals(Vod.Language.URDU, Vod.language(ch("Kaffara Episode 1", language = "Urdu")))
        assertEquals(Vod.Language.HINDI, Vod.language(ch("Pushpa", language = "hin")))
        assertEquals(Vod.Language.PUNJABI, Vod.language(ch("Carry On Jatta", language = "Punjabi")))
        assertEquals(Vod.Language.HINDI, Vod.language(ch("Pushpa", group = "Hindi dubbed movies")))
        assertEquals(Vod.Language.URDU, Vod.language(ch("Ishq Episode 2", group = "Pakistani Dramas")))
        assertEquals(Vod.Language.ENGLISH, Vod.language(ch("His Girl Friday (1940)", group = "1940s")))
    }

    @Test
    fun seriesAndShows() {
        assertEquals(true, Vod.isShow(ch("TAMASHA SEASON 5 Episode 55", category = "Shows")))
        assertEquals(false, Vod.isShow(ch("Kaffara Episode 45", category = "Series")))
        assertEquals(true, Vod.isShow(ch("Jeeto Pakistan Episode 3")))
        assertEquals(false, Vod.isShow(ch("Ishq Murshid Episode 30", group = "HUM TV dramas")))
    }

    @Test
    fun newlyAddedFromTheListsAddedDay() {
        val list = M3uParser.parse(
            """
            #EXTM3U
            #EXTINF:-1 added="2026-10-07" tvg-language="English" tvg-genre="Movies" group-title="FilmRise",New Film
            https://www.youtube.com/watch?v=aaaaaaaaaaa
            #EXTINF:-1 added="2026-09-07" tvg-language="English" tvg-genre="Movies" group-title="FilmRise",Old Film
            https://www.youtube.com/watch?v=bbbbbbbbbbb
            #EXTINF:-1 tvg-language="English",No Date
            https://www.youtube.com/watch?v=ccccccccccc
            """.trimIndent()
        )
        assertEquals("2026-10-07", list[0].added)
        val since = "2026-10-01"
        assertEquals(listOf(true, false, false), list.map { Vod.isNew(it, since) })
        val show = Vod.Show("Kaffara", null, null, listOf(
            Vod.Episode(Channel(name = "Kaffara Episode 1", url = "u1", added = "2026-09-01"), null, 1),
            Vod.Episode(Channel(name = "Kaffara Episode 2", url = "u2", added = "2026-10-06"), null, 2),
        ))
        assertEquals("2026-10-06", show.added)
        assertEquals(1, show.newEpisodes(since))
    }

    @Test
    fun newSinceCountsTodayAsTheSeventhDay() {
        val oct7 = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US).parse("2026-10-07 12:00")!!.time
        assertEquals("2026-10-01", Vod.newSince(oct7))
    }
}
