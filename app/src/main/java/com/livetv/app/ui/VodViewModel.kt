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

data class VodState(
    val loading: Boolean = true,
    val movies: List<Channel> = emptyList(),
    val shows: List<Vod.Show> = emptyList(),
    /** False until a playlist has been saved in Settings > My playlists. */
    val hasPlaylists: Boolean = true,
)

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
        val hasPlaylists = repo.playlists.isNotEmpty()
        _state.update { it.copy(loading = hasPlaylists, hasPlaylists = hasPlaylists) }
        if (!hasPlaylists) return
        viewModelScope.launch {
            val items = repo.loadVod()
            val (episodes, movies) = items.partition { Vod.kind(it) == Vod.Kind.EPISODE }
            _state.update {
                it.copy(
                    loading = false,
                    movies = movies.sortedBy { m -> m.name.lowercase() },
                    shows = Vod.shows(episodes),
                )
            }
        }
    }
}
