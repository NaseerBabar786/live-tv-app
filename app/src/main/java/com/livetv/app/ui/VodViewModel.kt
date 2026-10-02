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

/** One language's movies, drama series and shows (each show a folder of episodes). */
data class VodShelf(
    val movies: List<Channel> = emptyList(),
    val series: List<Vod.Show> = emptyList(),
    val shows: List<Vod.Show> = emptyList(),
) {
    val isEmpty: Boolean get() = movies.isEmpty() && series.isEmpty() && shows.isEmpty()
    val size: Int get() = movies.size + series.size + shows.size
}

data class VodState(
    val loading: Boolean = true,
    val shelves: Map<Vod.Language, VodShelf> = emptyMap(),
    /** False until a playlist has been saved in Settings > My playlists. */
    val hasPlaylists: Boolean = true,
)

/**
 * Sorts videos by language, then into Movies, Series or Shows; episodes are grouped into a
 * folder per drama or show. Punjabi has movies only (the owner's choice).
 */
fun shelves(items: List<Channel>): Map<Vod.Language, VodShelf> =
    items.groupBy { Vod.language(it) }.mapValues { (language, list) ->
        val (episodes, movies) = list.partition { Vod.kind(it) == Vod.Kind.EPISODE }
        val (shows, series) = if (language == Vod.Language.PUNJABI) {
            emptyList<Channel>() to emptyList()
        } else {
            episodes.partition { Vod.isShow(it) }
        }
        VodShelf(
            movies = movies.sortedBy { it.name.lowercase() },
            series = Vod.shows(series),
            shows = Vod.shows(shows),
        )
    }

/** Live TV's Movies & Series: the movies and episodes in the viewer's saved playlists. */
class VodViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = ChannelRepository(app)

    private val _state = MutableStateFlow(VodState())
    val state: StateFlow<VodState> = _state.asStateFlow()

    /** The playlists the lists were last loaded from. */
    private var loadedFor: List<Playlist>? = null

    /** Loads the lists the first time, and again whenever the saved playlists have changed. */
    fun refreshIfChanged() {
        if (repo.playlists != loadedFor) reload()
    }

    fun reload() {
        loadedFor = repo.playlists
        val hasPlaylists = repo.playlists.isNotEmpty() || Vod.builtIn().isNotEmpty()
        _state.update { it.copy(loading = hasPlaylists, hasPlaylists = hasPlaylists) }
        if (!hasPlaylists) return
        viewModelScope.launch {
            val shelves = shelves(repo.loadVod())
            _state.update { it.copy(loading = false, shelves = shelves) }
        }
    }
}
