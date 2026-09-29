package com.livetv.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.livetv.app.data.Channel
import com.livetv.app.data.ChannelRepository
import com.livetv.app.data.Famelack
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Special group filters shown before the playlist's own groups. */
const val FILTER_ALL = "All"
const val FILTER_FAVORITES = "Favorites"

data class UiState(
    val loading: Boolean = true,
    val error: String? = null,
    val channels: List<Channel> = emptyList(),
    val favorites: Set<String> = emptySet(),
    val query: String = "",
    val filter: String = FILTER_ALL,
    /** Second-row filter; null shows every language. */
    val language: String? = null,
    /** Third-row filter; null shows every type. */
    val category: String? = null,
    val playlistSource: String = "",
    val playing: Channel? = null,
    val countries: List<Famelack.Country> = emptyList(),
) {
    /** Screen title: the selected country's name when showing free channels by country. */
    val title: String
        get() = when (playlistSource) {
            Famelack.SOURCE_MIX -> "Pakistan · India · Canada"
            Famelack.SOURCE_ALL -> "All countries"
            else -> Famelack.countryCode(playlistSource)
                ?.let { code -> countries.firstOrNull { it.code == code }?.name }
                ?: "Live TV"
        }

    /** First chip row, in playlist order (e.g. Pakistani, Indian, Canadian). */
    val groups: List<String>
        get() = listOf(FILTER_ALL, FILTER_FAVORITES) + channels.mapNotNull { it.group }.distinct()

    private val inGroup: List<Channel>
        get() = channels.filter {
            when (filter) {
                FILTER_ALL -> true
                FILTER_FAVORITES -> it.id in favorites
                else -> it.group == filter
            }
        }

    private val inLanguage: List<Channel>
        get() = inGroup.filter { language == null || it.language == language }

    /** Second chip row: the languages in the selected country, most channels first. */
    val languages: List<String>
        get() = inGroup.mapNotNull { it.language }.groupingBy { it }.eachCount()
            .entries.sortedWith(compareBy({ it.key == "Other" }, { -it.value }, { it.key }))
            .map { it.key }

    /** Third chip row: the types in the selected country and language. */
    val categories: List<String>
        get() = inLanguage.mapNotNull { it.category }.distinct().sortedWith(
            // Geo-blocked and General go last.
            compareBy<String>({ it == "Geo-blocked" }, { it == "General" }, { it })
        )

    val visibleChannels: List<Channel>
        get() = inLanguage
            .filter { category == null || it.category == category }
            .filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }
}

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = ChannelRepository(app)

    private val _state = MutableStateFlow(
        UiState(favorites = repo.favorites, playlistSource = repo.playlistSource)
    )
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        reload()
    }

    fun loadCountries() {
        if (_state.value.countries.isNotEmpty()) return
        viewModelScope.launch {
            repo.loadCountries().onSuccess { list -> _state.update { it.copy(countries = list) } }
        }
    }

    fun reload() {
        loadCountries()
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            repo.loadChannels()
                .onSuccess { list -> _state.update { it.copy(loading = false, channels = list) } }
                .onFailure { e ->
                    _state.update { it.copy(loading = false, error = e.message ?: "Could not load the playlist.") }
                }
        }
    }

    fun setPlaylistSource(source: String) {
        repo.playlistSource = source
        _state.update { it.copy(playlistSource = repo.playlistSource, filter = FILTER_ALL, language = null, category = null) }
        reload()
    }

    fun setQuery(query: String) = _state.update { it.copy(query = query) }

    fun setFilter(filter: String) = _state.update { it.copy(filter = filter, language = null, category = null) }

    fun setLanguage(language: String?) = _state.update { it.copy(language = language, category = null) }

    fun setCategory(category: String?) = _state.update { it.copy(category = category) }

    fun toggleFavorite(channel: Channel) {
        val updated = repo.favorites.toMutableSet().apply {
            if (!add(channel.id)) remove(channel.id)
        }
        repo.favorites = updated
        _state.update { it.copy(favorites = updated) }
    }

    fun play(channel: Channel) {
        repo.lastChannelUrl = channel.url
        _state.update { it.copy(playing = channel) }
    }

    fun stop() = _state.update { it.copy(playing = null) }

    /** Moves to the next (+1) or previous (-1) channel in the current list, wrapping around. */
    fun zap(direction: Int) {
        val s = _state.value
        val list = s.visibleChannels.ifEmpty { s.channels }
        if (list.isEmpty()) return
        val index = list.indexOfFirst { it.id == s.playing?.id }
        val next = list[((index + direction) % list.size + list.size) % list.size]
        play(next)
    }
}
