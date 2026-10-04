package com.livetv.app.ui

import android.app.Application
import android.widget.Toast
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.livetv.app.data.Channel
import com.livetv.app.data.ChannelRepository
import com.livetv.app.data.Famelack
import com.livetv.app.Edition
import com.livetv.app.data.Playlist
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Special group filters shown before the playlist's own groups. */
const val FILTER_ALL = "All"
const val FILTER_FAVORITES = "Favorites"

/** The most channels Favorites can hold. */
const val MAX_FAVORITES = 100

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
    /** Whether MTA's channels and Library programmes are shown (Live TV only). */
    val showMta: Boolean = false,
) {
    /** Stream Player Plus with no playlist yet: the screen asks the viewer to add one. */
    val needsPlaylist: Boolean
        get() = !Edition.LIVE_TV && playlistSource.isBlank()

    /** Screen title: the selected country's name when showing free channels by country. */
    val title: String
        get() = playlists.firstOrNull { it.source == playlistSource }?.name ?: if (!Edition.LIVE_TV) {
            Edition.APP_NAME
        } else when (playlistSource) {
            Famelack.SOURCE_MIX -> Edition.APP_NAME
            Famelack.SOURCE_ALL -> "All countries"
            else -> Famelack.countryCode(playlistSource)
                ?.let { code -> countries.firstOrNull { it.code == code }?.name }
                ?: Edition.APP_NAME
        }

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

    /**
     * Favorites come first, then the rest in list order; channels keep their numbers.
     * Inside Favorites the channels are grouped by country (Pakistan, India, Canada, UK, USA,
     * then the rest) and numbered 1, 2, 3... from the top.
     */
    val visibleChannels: List<Channel>
        get() {
            val shown = inLanguage
                .filter { category == null || it.category == category }
                .filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }
            if (filter != FILTER_FAVORITES) return shown.sortedBy { it.id !in favorites }
            return shown
                .sortedWith(compareBy({ countryRank(it) }, { countryName(it) }, { it.number }))
                .mapIndexed { i, channel -> channel.copy(number = i + 1) }
        }

    private fun countryRank(channel: Channel): Int {
        val code = channel.country ?: Famelack.MIX.firstOrNull { it.title == channel.group }?.country
        return Famelack.MIX.indexOfFirst { it.country == code || (code == "gb" && it.country == "uk") }
            .takeIf { it >= 0 } ?: Famelack.MIX.size
    }

    private fun countryName(channel: Channel): String = channel.group ?: channel.country ?: ""
}

class MainViewModel(app: Application) : AndroidViewModel(app) {
    /** Whether the channels have loaded since the app opened (it opens on Favorites only then). */
    private var opened = false


    private val repo = ChannelRepository(app)

    private val _state = MutableStateFlow(
        UiState(
            favorites = repo.favorites,
            playlistSource = repo.playlistSource,
            languageFilter = repo.languages,
            playlists = repo.playlists,
            provider = repo.provider,
            showMta = repo.showMta,
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
                    // The app opens on Favorites (when there are any) and on the channel watched
                    // last time, or the first favorite when that one isn't a favorite.
                    val opening = !opened
                    opened = true
                    _state.update {
                        val favorites = numbered.filter { c -> c.id in it.favorites }
                        val onFavorites = opening && favorites.isNotEmpty()
                        val last = repo.lastChannelUrl?.let { url -> numbered.firstOrNull { c -> c.url == url } }
                        val start = when {
                            !opening -> it.lastWatchedId
                            onFavorites -> (last?.takeIf { c -> c.id in it.favorites } ?: favorites.first()).id
                            else -> last?.id
                        }
                        it.copy(
                            loading = false,
                            channels = numbered,
                            lastWatchedId = start,
                            filter = if (onFavorites) FILTER_FAVORITES else it.filter,
                            category = if (onFavorites) null else it.category,
                        )
                    }
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

    fun setShowMta(show: Boolean) {
        if (show == repo.showMta) return
        repo.showMta = show
        _state.update { it.copy(showMta = show, category = null) }
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
        val current = repo.favorites
        // Favorites holds at most MAX_FAVORITES channels (the user's choice).
        if (channel.id !in current && current.size >= MAX_FAVORITES) {
            Toast.makeText(
                getApplication(),
                "Favorites is full ($MAX_FAVORITES channels). Remove one to add another.",
                Toast.LENGTH_LONG,
            ).show()
            return
        }
        val updated = current.toMutableSet().apply {
            if (!add(channel.id)) remove(channel.id)
        }
        repo.favorites = updated
        _state.update { it.copy(favorites = updated) }
    }

    /** Reminder shown over the first channel opened after the app starts, until 6 favourites. */
    var favoritesTip by mutableStateOf<String?>(null)
    private var tipChecked = false

    fun play(channel: Channel) {
        if (!tipChecked) {
            tipChecked = true
            if (_state.value.favorites.size < 6) {
                favoritesTip = "Save at least 6 channels in Favourites. Press ☆ at the top of this screen, " +
                    "or hold OK on a channel in the list."
            }
        }
        repo.lastChannelUrl = channel.url
        _state.update { it.copy(playing = channel, lastWatchedId = channel.id) }
    }

    /** Remembers a channel watched without full screen (1+List's player) as the last one watched. */
    fun watched(channel: Channel) {
        repo.lastChannelUrl = channel.url
        _state.update { it.copy(lastWatchedId = channel.id) }
    }

    fun stop() {
        favoritesTip = null
        clearTyped()
        numberPadOpen = false
        _state.update { it.copy(playing = null) }
    }

    /** Digits typed for a channel number while one is playing (remote keys or the on-screen pad). */
    var typedNumber by mutableStateOf("")
        private set

    /** Whether the on-screen number pad is open (Up and Down then move on the pad). */
    var numberPadOpen by mutableStateOf(false)

    /** True while the full-screen channel bar is hidden; OK then only brings it back. */
    var channelBarHidden by mutableStateOf(false)
    /** Bumped to bring the channel bar back for another 10 seconds. */
    var channelBarWake by mutableIntStateOf(0)

    private var typedJob: Job? = null

    /** Adds a digit; 2 seconds after the last one the app goes to that channel. */
    fun typeDigit(digit: Int) {
        if (typedNumber.length >= 4) typedNumber = ""
        typedNumber += digit
        typedJob?.cancel()
        typedJob = viewModelScope.launch {
            delay(2_000)
            goToTyped()
        }
    }

    fun deleteDigit() {
        typedNumber = typedNumber.dropLast(1)
        typedJob?.cancel()
    }

    /** Goes to the channel with the typed number in the list being watched. */
    fun goToTyped() {
        typedJob?.cancel()
        val number = typedNumber.toIntOrNull()
        typedNumber = ""
        if (number == null) return
        val s = _state.value
        val channel = s.visibleChannels.firstOrNull { it.number == number }
            ?: s.channels.takeIf { s.filter != FILTER_FAVORITES }?.firstOrNull { it.number == number }
        if (channel == null) {
            Toast.makeText(getApplication(), "No channel $number", Toast.LENGTH_SHORT).show()
            return
        }
        numberPadOpen = false
        play(channel)
    }

    fun clearTyped() {
        typedJob?.cancel()
        typedNumber = ""
    }

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
