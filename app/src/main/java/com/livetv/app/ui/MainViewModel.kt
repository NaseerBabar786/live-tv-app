package com.livetv.app.ui

import android.app.Application
import android.widget.Toast
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.livetv.app.data.Channel
import com.livetv.app.data.ChannelRepository
import com.livetv.app.data.Famelack
import com.livetv.app.data.Mta
import com.livetv.app.data.MyChannel
import com.livetv.app.Edition
import com.livetv.app.Plans
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
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Special group filters shown before the playlist's own groups. */
const val FILTER_ALL = "All"
const val FILTER_FAVORITES = "Favorites"

/** The most channels Favorites can hold. */
const val MAX_FAVORITES = 200

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
    /** A language chip (Urdu, Hindi, English, Punjabi): only channels in that language, ours first; null for all. */
    val language: String? = null,
    val playlistSource: String = "",
    val playing: Channel? = null,
    /** The channel watched most recently, so going back lands on it in the list. */
    val lastWatchedId: String? = null,
    val countries: List<Famelack.Country> = emptyList(),
    /** Playlists the viewer added (Stream Player Plus). */
    val playlists: List<Playlist> = emptyList(),
    /** Cable TV's channel list: the main (Famelack) list or iptv-org's. */
    val provider: String = ChannelRepository.PROVIDER_FAMELACK,
    /** Whether MTA's channels and Library programmes are shown (Cable TV only). */
    val showMta: Boolean = false,
    /** A Cable TV package without all channels: only [Plans.freeChannel]s are listed. */
    val freeOnly: Boolean = false,
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
            if (freeOnly && !Plans.freeChannel(it)) return@filter false
            when (filter) {
                FILTER_ALL -> true
                FILTER_FAVORITES -> it.id in favorites || leads(it)
                else -> it.group == filter
            }
        }

    private val inLanguage: List<Channel>
        get() = inGroup.filter { languageFilter.isEmpty() || it.language in languageFilter || leads(it) }

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
     * Our channels, then MTA's (when on), then favorites, then the rest in list order; channels keep their numbers.
     * Inside Favorites the other channels are grouped by country (Pakistan, India, Canada, UK, USA,
     * then the rest) and numbered from [MyChannel.OTHERS_FIRST], after our language blocks (1 to 79) and MTA's 81 to 88.
     */
    val visibleChannels: List<Channel>
        get() {
            val shown = inLanguage
                .filter { language == null || it.language == language }
                .filter { category == null || it.category == category }
                .filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }
            // The owner's own channels (by language, 1 to 79) always lead, then MTA's when they're on.
            if (filter != FILTER_FAVORITES) {
                return shown.sortedWith(compareBy({ !MyChannel.isMine(it) }, { !Mta.isMta(it) }, { it.id !in favorites }))
            }
            val (lead, rest) = shown.partition { leads(it) }
            val first = lead.sortedBy { !MyChannel.isMine(it) }
            return first + rest
                .sortedWith(compareBy({ countryRank(it) }, { countryName(it) }, { it.number }))
                .mapIndexed { i, channel -> channel.copy(number = MyChannel.OTHERS_FIRST + i) }
        }

    /**
     * The Favorites row of Duo mode, the same channels 1+List shows under Favorites: our own channels,
     * MTA's (when on), then the saved favourites grouped by country. Channels keep their own numbers.
     */
    val favoriteChannels: List<Channel>
        get() {
            val (lead, rest) = channels
                .filter { it.id in favorites || leads(it) }
                .filter { languageFilter.isEmpty() || it.language in languageFilter || leads(it) }
                .partition { leads(it) }
            return lead.sortedBy { !MyChannel.isMine(it) } +
                rest.sortedWith(compareBy({ countryRank(it) }, { countryName(it) }, { it.number }))
        }

    /** Our Bazaar channels and MTA's (when on): always listed first, in every language and in Favorites. */
    private fun leads(channel: Channel) = MyChannel.isMine(channel) || Mta.isMta(channel)

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
        // Cable TV's Free package lists only its few channels; the channel watched last moves onto one of them.
        viewModelScope.launch {
            combine(Plans.current, Plans.features, Plans.extraChannels) { _, _, _ -> !Plans.has(Plans.Feature.AllChannels) }.collect { freeOnly ->
                _state.update { s ->
                    val last = s.channels.firstOrNull { it.id == s.lastWatchedId }
                    val keep = !freeOnly || last == null || Plans.freeChannel(last)
                    s.copy(
                        freeOnly = freeOnly,
                        lastWatchedId = if (keep) s.lastWatchedId else s.channels.firstOrNull(Plans::freeChannel)?.id,
                    )
                }
            }
        }
        // Favourites without it in the package (a Free viewer's minute is up): back to All, favourites kept.
        viewModelScope.launch {
            combine(Plans.current, Plans.features, Plans.trying) { _, _, _ -> Plans.canUse(Plans.Feature.Favorites) }.collect { can ->
                if (!can) _state.update { s -> if (s.filter == FILTER_FAVORITES) s.copy(filter = FILTER_ALL, category = null) else s }
            }
        }
        // The owner's own channels (tv.bulkbazaar.ca/studio) join the list when they're switched on.
        if (Edition.LIVE_TV) {
            MyChannel.init(app)
            viewModelScope.launch {
                MyChannel.configs.collect { _ -> _state.update { it.copy(channels = withMyChannel(it.channels)) } }
            }
        }
    }

    /** MTA's channels (when on, first in [list]) take 81 to 88 and every other channel 101 on, after our language blocks. */
    private fun numberOthers(list: List<Channel>): List<Channel> {
        val (mta, rest) = list.partition { Mta.isMta(it) }
        return mta.mapIndexed { i, c -> c.copy(number = MyChannel.MTA_FIRST + i) } +
            rest.mapIndexed { i, c -> c.copy(number = MyChannel.OTHERS_FIRST + i) }
    }

    /** [list] with the owner's channels first (those that are on): Bazaar TV, Cinema, Music, Hits, Kids, Sports, Travel and Comedy. */
    private fun withMyChannel(list: List<Channel>): List<Channel> {
        val rest = list.filterNot { MyChannel.isMine(it) }
        if (rest.isEmpty() || !Edition.LIVE_TV) return rest
        return MyChannel.channels() + rest
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
                    val numbered = withMyChannel(numberOthers(list))
                    // The app opens on Favorites (when there are any) and on the channel watched
                    // last time, or the first favorite when that one isn't a favorite.
                    val opening = !opened
                    opened = true
                    _state.update {
                        val favorites = numbered.filter { c -> c.id in it.favorites }
                        // Favourites is Gold: on Free the app opens on All (the saved favourites are kept).
                        val onFavorites = opening && favorites.isNotEmpty() && Plans.has(Plans.Feature.Favorites)
                        val last = repo.lastChannelUrl?.let { url -> numbered.firstOrNull { c -> c.url == url } }
                            ?.takeIf { c -> !it.freeOnly || Plans.freeChannel(c) }
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
     * Forgets a playlist. When it was the one showing, Cable TV goes back to its built-in
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

    /** Switches Cable TV between the main channel list and iptv-org's, keeping the chosen countries. */
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

    fun setFilter(filter: String) {
        // Favourites is Gold (owner, 2026-10-08): on Free, a minute's try.
        if (filter == FILTER_FAVORITES) Plans.ask("Favourites", Plans.Feature.Favorites)
        _state.update { it.copy(filter = filter, category = null, language = if (filter == FILTER_ALL) null else it.language) }
    }

    /** A language chip in 1+List: our channels in that language first, then the others in it; null for every language. */
    fun setLanguage(language: String?) = _state.update { it.copy(language = language) }

    fun setLanguages(languages: Set<String>) {
        repo.languages = languages
        _state.update { it.copy(languageFilter = languages, category = null) }
    }

    fun setCategory(category: String?) = _state.update { it.copy(category = category) }

    fun toggleFavorite(channel: Channel) {
        Plans.ask("Favourites", Plans.Feature.Favorites)
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
        if (!Plans.allowsChannel(channel)) {
            Plans.ask(channel.name, Plans.Feature.AllChannels)
            return
        }
        // Full screen is Gold (owner, 2026-10-08): on Free it's a minute's try, then 1+List again.
        Plans.ask("Full screen", Plans.Feature.FullScreen)
        if (!tipChecked && Plans.canUse(Plans.Feature.Favorites)) {
            tipChecked = true
            if (_state.value.favorites.size < 6) {
                favoritesTip = "Save at least 6 channels in Favourites. Press ☆ at the top of this screen, " +
                    "or hold OK on a channel in the list."
            }
        }
        rememberPrevious(channel)
        repo.lastChannelUrl = channel.url
        _state.update { it.copy(playing = channel, lastWatchedId = channel.id) }
        com.livetv.app.extras.HomeScreenRow.watched(getApplication(), channel)
    }

    /** Remembers a channel watched without full screen (1+List's player) as the last one watched. */
    fun watched(channel: Channel) {
        rememberPrevious(channel)
        repo.lastChannelUrl = channel.url
        _state.update { it.copy(lastWatchedId = channel.id) }
        com.livetv.app.extras.HomeScreenRow.watched(getApplication(), channel)
    }

    /** The channel watched before the one on now, for the Last channel button (owner, 2026-10-09). */
    private var previousId: String? = null

    private fun rememberPrevious(next: Channel) {
        val now = _state.value.playing?.id ?: _state.value.lastWatchedId
        if (now != null && now != next.id) previousId = now
    }

    /** Back to the channel watched before (the remote's Last / Recall key, or the ↺ button); full screen stays full screen. */
    fun lastChannel() {
        val s = _state.value
        val previous = s.channels.firstOrNull { it.id == previousId } ?: return
        if (!Plans.allowsChannel(previous)) return
        if (s.playing != null) play(previous) else watched(previous)
    }

    /** Bumped to open 1+List's search bar (voice search filled it in). */
    var searchWake by mutableIntStateOf(0)

    /**
     * What the viewer said (voice search): while a channel is full screen the best match opens at once; otherwise the
     * list shows the channels that match, with the best one in the player.
     */
    fun spoken(text: String) {
        val said = text.trim()
        if (said.isEmpty()) return
        val best = bestMatch(said, _state.value.channels.filter(Plans::allowsChannel)) ?: run {
            Toast.makeText(getApplication(), "No channel called \"$said\"", Toast.LENGTH_SHORT).show()
            return
        }
        if (_state.value.playing != null) {
            play(best)
            return
        }
        val matches = _state.value.channels.count { it.name.contains(said, ignoreCase = true) }
        setQuery(if (matches > 0) said else best.name)
        searchWake++
        watched(best)
    }

    /** The channel whose name best fits [said]: the whole phrase in the name first, then the most words, ours first. */
    private fun bestMatch(said: String, channels: List<Channel>): Channel? {
        val words = said.lowercase().split(Regex("\\s+")).filter { it.length > 1 && it != "channel" && it != "tv" }
        val key = ChannelRepository.nameKey(said)
        fun score(c: Channel): Int {
            val name = c.name.lowercase()
            val nameKey = ChannelRepository.nameKey(c.name)
            var s = 0
            if (nameKey == key) s += 1000
            if (key.isNotEmpty() && nameKey.startsWith(key)) s += 500
            if (name.contains(said.lowercase())) s += 300
            s += words.count { name.contains(it) } * 50
            if (MyChannel.isMine(c)) s += 5
            return s
        }
        return channels.maxByOrNull(::score)?.takeIf { score(it) >= 50 }
    }

    /** Another family profile was picked: its favourites, last channel and languages are read again. */
    fun profileChanged() {
        previousId = null
        opened = false
        _state.update {
            it.copy(favorites = repo.favorites, languageFilter = repo.languages, playing = null, lastWatchedId = null, filter = FILTER_ALL, category = null)
        }
        reload()
    }

    /** A channel to open once the channels have loaded (a click on the TV's home screen). */
    var pendingUrl: String? = null

    /** Opens [pendingUrl] when its channel is in the list: full screen with Gold, in 1+List's player otherwise. */
    fun openPending() {
        val url = pendingUrl ?: return
        val channel = _state.value.channels.firstOrNull { it.url == url } ?: return
        pendingUrl = null
        if (Plans.has(Plans.Feature.FullScreen)) play(channel) else watched(channel)
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
        if (typedNumber.length >= 8) typedNumber = ""
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
        val typed = typedNumber
        val number = typed.toIntOrNull()
        typedNumber = ""
        if (number == null) return
        // The owner's own channels are in language blocks (Urdu 1 to 19, Hindi 21 to 39, English 41 to 59,
        // Punjabi 61 to 79); the rows of zeros that reached them before 1.9.45 (0 to 00000000) still work.
        MyChannel.byDial(typed)?.takeIf { Edition.LIVE_TV }?.let {
            numberPadOpen = false
            play(it)
            return
        }
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
