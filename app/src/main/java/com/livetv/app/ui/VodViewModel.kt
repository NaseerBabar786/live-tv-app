package com.livetv.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.livetv.app.data.Channel
import com.livetv.app.data.ChannelRepository
import com.livetv.app.data.Playlist
import com.livetv.app.data.Vod
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** One language's movies, drama series, shows and kids' programmes (each show a folder of episodes). */
data class VodShelf(
    val movies: List<Channel> = emptyList(),
    val series: List<Vod.Show> = emptyList(),
    val shows: List<Vod.Show> = emptyList(),
    val kids: List<Vod.Show> = emptyList(),
) {
    val isEmpty: Boolean get() = movies.isEmpty() && series.isEmpty() && shows.isEmpty() && kids.isEmpty()
    val size: Int get() = movies.size + series.size + shows.size + kids.size

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
    /** False until a playlist has been saved in Settings > My playlists. */
    val hasPlaylists: Boolean = true,
)

/**
 * Sorts videos by language, then into Movies, Series, Shows or Kids; episodes are grouped into a
 * folder per drama or show. A title listed twice (in two lists, or from two sites) shows once,
 * the first list's copy. Punjabi has movies only (the owner's choice).
 */
fun shelves(items: List<Channel>): Map<Vod.Language, VodShelf> =
    items.distinctBy { Vod.sameTitleKey(it) }.groupBy { Vod.language(it) }.mapValues { (language, list) ->
        val (episodes, movies) = list.partition { Vod.kind(it) == Vod.Kind.EPISODE }
        val (kids, grownUp) = if (language == Vod.Language.PUNJABI) {
            emptyList<Channel>() to emptyList()
        } else {
            episodes.partition { Vod.isKids(it) }
        }
        val (shows, series) = grownUp.partition { Vod.isShow(it) }
        VodShelf(
            movies = movies.sortedBy { it.name.lowercase() },
            series = Vod.shows(series),
            shows = Vod.shows(shows),
            kids = Vod.shows(kids),
        )
    }

/** Live TV's Movies & Series: the movies and episodes in the viewer's saved playlists. */
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
            val shelves = shelves(repo.loadVod())
            _state.update { it.copy(loading = false, shelves = shelves) }
        }
    }
}
