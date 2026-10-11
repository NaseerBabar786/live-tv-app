package com.livetv.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.livetv.app.data.Channel
import com.livetv.app.data.ChannelRepository
import com.livetv.app.data.Playlist
import com.livetv.app.data.Vod
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** One language's movies, drama series, shows and kids' programmes (each show a folder of episodes). */
data class VodShelf(
    val movies: List<Channel> = emptyList(),
    val series: List<Vod.Show> = emptyList(),
    val shows: List<Vod.Show> = emptyList(),
    val kids: List<Vod.Show> = emptyList(),
) {
    val isEmpty: Boolean get() = movies.isEmpty() && series.isEmpty() && shows.isEmpty() && kids.isEmpty()
    val size: Int get() = movies.size + series.size + shows.size + kids.size

    /** How many titles (films, or shows with a new episode) are newly added since [since]. */
    fun newCount(since: String): Int =
        movies.count { Vod.isNew(it, since) } + (series + shows + kids).count { it.newEpisodes(since) > 0 }

    /** The folders of the Series, Shows or Kids section (none for Movies). */
    fun folders(section: Vod.Section): List<Vod.Show> = when (section) {
        Vod.Section.MOVIES -> emptyList()
        Vod.Section.SERIES -> series
        Vod.Section.SHOWS -> shows
        Vod.Section.KIDS -> kids
    }
}

/**
 * Where the Library opens when a movie or show is picked on Live TV Max's home screen: [play]
 * starts that video at once, [show] opens that show's episodes. Back then returns to the home screen.
 */
data class VodTarget(
    val language: Vod.Language,
    val section: Vod.Section,
    val show: String? = null,
    val play: Channel? = null,
)

data class VodState(
    val loading: Boolean = true,
    val shelves: Map<Vod.Language, VodShelf> = emptyMap(),
    /** The Spark TV and MTA folders' own shelves (none when they're empty). */
    val folders: Map<Vod.Folder, VodShelf> = emptyMap(),
    /** The owner's Logo-free folder by language, each with its Movies, Series, Shows and Kids (owner, 2026-10-11). */
    val logoFree: Map<Vod.Language, VodShelf> = emptyMap(),
    /** False until a playlist has been saved in Settings > My playlists. */
    val hasPlaylists: Boolean = true,
)

/**
 * Sorts videos by language, then into Movies, Series, Shows or Kids; episodes are grouped into a
 * folder per drama or show. A title listed twice (in two lists, or from two sites) shows once,
 * the first list's copy.
 */
fun shelves(items: List<Channel>): Map<Vod.Language, VodShelf> =
    items.distinctBy { Vod.sameTitleKey(it) }.groupBy { Vod.language(it) }.mapValues { (_, list) -> shelf(list) }

/** One shelf's Movies, Series, Shows and Kids, each drama or show a folder of its episodes. */
private fun shelf(list: List<Channel>): VodShelf {
    val (episodes, movies) = list.partition { Vod.kind(it) == Vod.Kind.EPISODE }
    val (kids, grownUp) = episodes.partition { Vod.isKids(it) }
    val (shows, series) = grownUp.partition { Vod.isShow(it) }
    return VodShelf(
        movies = movies.sortedBy { it.name.lowercase() },
        series = Vod.shows(series),
        shows = Vod.shows(shows),
        kids = Vod.shows(kids),
    )
}

/**
 * The language shelves and the main-page folders' shelves: Spark TV's and MTA's lists go in their own
 * folders, everything else by language. A video in two lists counts once, the first list's copy.
 */
fun library(lists: List<Pair<Playlist, List<Channel>>>): Pair<Map<Vod.Language, VodShelf>, Map<Vod.Folder, VodShelf>> {
    val seen = HashSet<String>()
    val byFolder = lists.map { (playlist, items) -> Vod.folder(playlist.source) to items.filter { seen.add(it.id) } }
    // One shelf for every language in the folder, so a programme with episodes in two languages is one folder
    // (two with the same name crashed the grid on the emulator).
    val folders = Vod.Folder.entries.associateWith { folder ->
        shelf(byFolder.filter { it.first == folder }.flatMap { it.second }.distinctBy { Vod.sameTitleKey(it) })
    }.filterValues { !it.isEmpty }
    return shelves(byFolder.filter { it.first == null }.flatMap { it.second }) to folders
}

/** NextGen Cable's Movies & Series: the movies and episodes in the viewer's saved playlists. */
class VodViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = ChannelRepository(app)

    private val _state = MutableStateFlow(VodState())
    val state: StateFlow<VodState> = _state.asStateFlow()

    /** The playlists (and MTA setting) the lists were last loaded from. */
    private var loadedFor: Pair<List<Playlist>, Boolean>? = null

    /** Loads the lists the first time, and again whenever the saved playlists or MTA setting have changed. */
    fun refreshIfChanged() {
        if (repo.playlists to repo.showMta != loadedFor) reload()
    }

    fun reload() {
        loadedFor = repo.playlists to repo.showMta
        val hasPlaylists = repo.playlists.isNotEmpty() || Vod.builtIn().isNotEmpty()
        _state.update { it.copy(loading = hasPlaylists, hasPlaylists = hasPlaylists) }
        if (!hasPlaylists) return
        viewModelScope.launch {
            // Sorting tens of thousands of titles takes seconds on a Chromecast: off the main thread, or
            // the remote's keys wait and Android closes the app as "not responding" (2026-10-08).
            val lists = repo.loadVodLists()
            val (shelves, folders) = withContext(Dispatchers.Default) { library(lists) }
            val logoFree = withContext(Dispatchers.Default) {
                shelves(lists.filter { Vod.folder(it.first.source) == Vod.Folder.LOGO_FREE }.flatMap { it.second })
                    .filterValues { !it.isEmpty }
            }
            _state.update { it.copy(loading = false, shelves = shelves, folders = folders, logoFree = logoFree) }
        }
    }
}
