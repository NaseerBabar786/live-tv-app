package com.livetv.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.livetv.app.data.Channel
import com.livetv.app.data.ChannelRepository
import com.livetv.app.data.Famelack
import com.livetv.app.Edition
import com.livetv.app.data.Playlist
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Special group filters shown before the playlist's own groups. */
const val FILTER_ALL = "All"
const val FILTER_FAVORITES = "Favorites"

const val DEMO_PLAYLIST_NAME = "Demo channels"

/** Types that are not really genres, so they get no chip. */
private val notGenres = setOf("Geo-blocked")

data class UiState(
    val loading: Boolean = true,
    val error: String? = null,
    val channels: List<Channel> = emptyList(),
    val favorites: Set<String> = emptySet(),
    val query: String = "",
    val filter: String = FILTER_ALL,
    /** Languages chosen in Settings; empty shows every language. */
    val languageFilter: Set<String> = emptySet(),
    /** Third-row filter (genre); null shows every genre. */
    val category: String? = null,
    val playlistSource: String = "",
    val playing: Channel? = null,
    /** The channel watched most recently, so going back lands on it in the list. */
    val lastWatchedId: String? = null,
    val countries: List<Famelack.Country> = emptyList(),
    /** Playlists the viewer added (Stream Player Plus). */
    val playlists: List<Playlist> = emptyList(),
    /** Live TV's channel list: the main (Famelack) list or iptv-org's. */
    val provider: String = ChannelRepository.PROVIDER_FAMELACK,
) {
    /** Stream Player Plus with no playlist yet: the screen asks the viewer to add one. */
    val needsPlaylist: Boolean
        get() = !Edition.LIVE_TV && playlistSource.isBlank()

    /** Screen title: the selected country's name when showing free channels by country. */
    val title: String
        get() = playlists.firstOrNull { it.source == playlistSource }?.name ?: if (!Edition.LIVE_TV) {
            Edition.APP_NAME
        } else when (playlistSource) {
            Famelack.SOURCE_MIX -> "Live TV"
            Famelack.SOURCE_ALL -> "All countries"
            else -> Famelack.countryCode(playlistSource)
                ?.let { code -> countries.firstOrNull { it.code == code }?.name }
                ?: "Live TV"
        }

    /** First chip row: All, Favorites, then countries in playlist order (e.g. Pakistani, Indian, Canadian). */
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
        get() = inGroup.filter { languageFilter.isEmpty() || it.language in languageFilter }

    /** Every language in the loaded channels, most channels first, for the Settings picker. */
    val allLanguages: List<String>
        get() = byCount(channels.mapNotNull { it.language }).sortedBy { it == "Other" }

    /** Second chip row: the genres in the selected country and languages, most channels first. */
    val categories: List<String>
        get() = byCount(inLanguage.mapNotNull { it.category }.filter { it !in notGenres })
            .sortedBy { it == "General" }

    private fun byCount(values: List<String>): List<String> =
        values.groupingBy { it }.eachCount().entries
            .sortedWith(compareBy({ -it.value }, { it.key }))
            .map { it.key }

    val visibleChannels: List<Channel>
        get() = inLanguage
            .filter { category == null || it.category == category }
            .filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }
}

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = ChannelRepository(app)

    private val _state = MutableStateFlow(
        UiState(
            favorites = repo.favorites,
            playlistSource = repo.playlistSource,
            languageFilter = repo.languages,
            playlists = repo.playlists,
            provider = repo.provider,
        )
    )
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        reload()
    }

    fun loadCountries() {
        if (!Edition.LIVE_TV || _state.value.countries.isNotEmpty()) return
        viewModelScope.launch {
            repo.loadCountries().onSuccess { list -> _state.update { it.copy(countries = list) } }
        }
    }

    fun reload() {
        loadCountries()
        if (_state.value.needsPlaylist) {
            _state.update { it.copy(loading = false, error = null, channels = emptyList()) }
            return
        }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            repo.loadChannels()
                .onSuccess { list ->
                    val numbered = list.mapIndexed { i, channel -> channel.copy(number = i + 1) }
                    _state.update { it.copy(loading = false, channels = numbered) }
                }
                .onFailure { e ->
                    _state.update { it.copy(loading = false, error = e.message ?: "Could not load the playlist.") }
                }
        }
    }

    fun setPlaylistSource(source: String) {
        repo.playlistSource = source
        _state.update { it.copy(playlistSource = repo.playlistSource, filter = FILTER_ALL, category = null) }
        reload()
    }

    /** Saves a playlist (replacing one with the same link) and switches to it. */
    fun addPlaylist(name: String, source: String) {
        val list = repo.playlists.filter { it.source != source } + Playlist(name.trim(), source.trim())
        repo.playlists = list
        _state.update { it.copy(playlists = list) }
        setPlaylistSource(source)
    }

    /** Adds the bundled demo playlist: streams their owners publish openly, plus vendor test streams. */
    fun addDemoPlaylist() = addPlaylist(DEMO_PLAYLIST_NAME, ChannelRepository.SOURCE_SAMPLE)

    /**
     * Forgets a playlist. When it was the one showing, Live TV goes back to its built-in
     * channels and Stream Player Plus to the next saved playlist (or none).
     */
    fun removePlaylist(playlist: Playlist) {
        val list = repo.playlists.filter { it.source != playlist.source }
        repo.playlists = list
        _state.update { it.copy(playlists = list) }
        if (playlist.source == _state.value.playlistSource) {
            setPlaylistSource(if (Edition.LIVE_TV) "" else list.firstOrNull()?.source ?: "")
        }
    }

    /** Switches Live TV between the main channel list and iptv-org's, keeping the chosen countries. */
    fun setProvider(provider: String) {
        if (provider == repo.provider) return
        repo.provider = provider
        _state.update { it.copy(provider = provider, filter = FILTER_ALL, category = null) }
        reload()
    }

    /** iptv-org's published playlists, for "Find playlists online". */
    suspend fun playlistCatalogue() = repo.loadPlaylistCatalogue()

    fun setQuery(query: String) = _state.update { it.copy(query = query) }

    fun setFilter(filter: String) = _state.update { it.copy(filter = filter, category = null) }

    fun setLanguages(languages: Set<String>) {
        repo.languages = languages
        _state.update { it.copy(languageFilter = languages, category = null) }
    }

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
        _state.update { it.copy(playing = channel, lastWatchedId = channel.id) }
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
