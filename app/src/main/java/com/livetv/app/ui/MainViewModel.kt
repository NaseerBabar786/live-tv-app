package com.livetv.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.livetv.app.data.Channel
import com.livetv.app.data.ChannelRepository
import com.livetv.app.data.Famelack
import com.livetv.app.data.Updater
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Special group filters shown before the playlist's own groups. */
const val FILTER_ALL = "All"
const val FILTER_FAVORITES = "Favorites"

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
) {
    /** Screen title: the selected country's name when showing free channels by country. */
    val title: String
        get() = when (playlistSource) {
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

/** Progress of "Check for updates" in Settings. */
sealed interface UpdateState {
    data object Idle : UpdateState
    data object Checking : UpdateState
    data object UpToDate : UpdateState
    data class Available(val release: Updater.Release) : UpdateState
    data class Downloading(val release: Updater.Release, val progress: Float) : UpdateState
    /** The user was sent to allow installs from this app; pressing Update again continues. */
    data class NeedsPermission(val release: Updater.Release) : UpdateState
    data class Failed(val message: String) : UpdateState
}

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = ChannelRepository(app)
    private val updater = Updater(app)

    private val _update = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val update: StateFlow<UpdateState> = _update.asStateFlow()

    fun checkForUpdate() {
        if (_update.value is UpdateState.Checking || _update.value is UpdateState.Downloading) return
        _update.value = UpdateState.Checking
        viewModelScope.launch {
            _update.value = runCatching { updater.checkForUpdate() }.fold(
                onSuccess = { release -> release?.let { UpdateState.Available(it) } ?: UpdateState.UpToDate },
                onFailure = { UpdateState.Failed(it.message ?: "Could not check for updates.") },
            )
        }
    }

    /** Downloads [release] and opens the installer. */
    fun installUpdate(release: Updater.Release) {
        if (_update.value is UpdateState.Downloading) return
        if (!updater.ensureInstallAllowed()) {
            _update.value = UpdateState.NeedsPermission(release)
            return
        }
        _update.value = UpdateState.Downloading(release, 0f)
        viewModelScope.launch {
            runCatching {
                val apk = updater.download(release) { p -> _update.value = UpdateState.Downloading(release, p) }
                updater.install(apk)
            }.onSuccess {
                _update.value = UpdateState.Available(release)
            }.onFailure {
                _update.value = UpdateState.Failed(it.message ?: "The update could not be installed.")
            }
        }
    }

    private val _state = MutableStateFlow(
        UiState(favorites = repo.favorites, playlistSource = repo.playlistSource, languageFilter = repo.languages)
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
