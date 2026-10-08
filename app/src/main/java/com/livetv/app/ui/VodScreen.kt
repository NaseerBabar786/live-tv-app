package com.livetv.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil3.compose.SubcomposeAsyncImage
import android.os.SystemClock
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import com.livetv.app.data.Bilibili
import com.livetv.app.data.Channel
import com.livetv.app.data.Dailymotion
import com.livetv.app.data.LibraryFavorites
import com.livetv.app.data.LibraryReports
import com.livetv.app.data.Vimeo
import com.livetv.app.data.Vod
import com.livetv.app.data.YouTube
import com.livetv.app.player.AdBreak
import com.livetv.app.player.AdTiming
import com.livetv.app.player.LibraryAds
import com.livetv.app.player.LibraryVideo
import com.livetv.app.player.PlayerScreen

/**
 * Cable TV's Movies & Series. First a language (Urdu, Hindi, Punjabi, English), then its
 * Movies, Series and Shows as poster grids filtered by the playlists' own groups. Each
 * drama or show is a folder that opens its episode list; anything picked plays full
 * screen (YouTube videos in our film window with YouTube's embedded player, 1.9.99).
 * The lists are rebuilt every morning; what first showed up in the last [Vod.NEW_DAYS] days comes
 * first with a NEW mark (1.10.1); "Added this week" collects every section's last 7 days.
 * Holding OK on a film or series adds it to Favorites (owner, 2026-10-08), the first tile of the Library;
 * a favourite series carries on where the viewer stopped (see [LibraryFavorites]).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun VodScreen(inPictureInPicture: Boolean, onClose: () -> Unit, start: VodTarget? = null) {
    val vm = viewModel<VodViewModel>()
    val state by vm.state.collectAsStateWithLifecycle()

    val context = LocalContext.current
    remember { LibraryFavorites.load(context) }
    val favKeys by LibraryFavorites.keys.collectAsStateWithLifecycle()
    var languageName by rememberSaveable { mutableStateOf(start?.language?.name) }
    // The ★ Favorites tile opens its own page, in place of a language.
    val favView = languageName == FAV
    val language = languageName?.takeIf { it != FAV }?.let { Vod.Language.valueOf(it) }
    // A series opened from Favorites: Back from its episodes goes back to Favorites.
    var fromFav by rememberSaveable { mutableStateOf(false) }
    var tabName by rememberSaveable { mutableStateOf((start?.section ?: Vod.Section.MOVIES).name) }
    // "Added this week" is its own first tab: everything that came in during the last 7 days, all sections together.
    val weekTab = tabName == WEEK_TAB
    val tab = if (weekTab) Vod.Section.MOVIES else Vod.Section.valueOf(tabName)
    var group by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var searching by rememberSaveable { mutableStateOf(false) }
    var openShow by rememberSaveable { mutableStateOf(start?.show) }
    var playing by remember { mutableStateOf(start?.play) }
    // The favourites key of the series whose episode is playing, to remember where the viewer got to.
    var playingShow by remember { mutableStateOf<String?>(null) }
    val playMovie: (Channel) -> Unit = { movie ->
        playingShow = null
        LibraryFavorites.touch(context, LibraryFavorites.movieKey(movie))
        playing = movie
    }
    val playEpisode: (String, Channel) -> Unit = { showKey, episode ->
        playingShow = showKey
        LibraryFavorites.watched(context, showKey, episode, ended = false)
        playing = episode
    }
    val toggleFavorite: (String) -> Unit = { key ->
        val added = LibraryFavorites.toggle(context, key)
        android.widget.Toast.makeText(
            context,
            if (added) "★ Added to Favorites" else "Removed from Favorites",
            android.widget.Toast.LENGTH_SHORT,
        ).show()
    }
    // Worked out again after something plays, so the last one watched comes first.
    val favorites = remember(state.shelves, favKeys, playing) { favoriteItems(context, state.shelves, favKeys) }
    // After every video: "Did it play properly?" (owner, 2026-10-08; see LibraryReports).
    var askAbout by remember { mutableStateOf<Channel?>(null) }
    // Opened from the home screen for one video: Back from it goes straight back there.
    val stopPlaying: () -> Unit = {
        if (start?.play != null) onClose() else { askAbout = playing; playing = null }
    }
    val tabFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { vm.refreshIfChanged() }
    // Kept above the player so the lists keep their scroll position while something plays,
    // and the remote's highlight goes back to what was picked.
    val moviesGrid = rememberLazyGridState()
    val seriesGrid = rememberLazyGridState()
    val languageGrid = rememberLazyGridState()
    val favoritesGrid = rememberLazyGridState()
    val episodeList = rememberLazyListState()
    var lastPicked by rememberSaveable { mutableStateOf<String?>(null) }
    val pickedFocus = remember { FocusRequester() }
    val weekSince = remember { Vod.newSince() }
    // Only the newest batch is marked NEW; older titles show just their "Added" day.
    val newSince = remember(state.shelves) {
        Vod.newestSince(state.shelves.values.asSequence().flatMap { shelf ->
            shelf.movies.asSequence().map { it.added } +
                (shelf.series + shelf.shows + shelf.kids).asSequence().flatMap { show -> show.episodes.asSequence().map { it.channel.added } }
        })
    }

    playing?.let { channel ->
        // Cable TV's ad breaks run here too (1.9.89). A video in YouTube's (or another site's) own player
        // gets its break before it starts, on our own black screen, never over that player.
        val embed = Bilibili.isVideo(channel.url) || Dailymotion.videoId(channel.url) != null ||
            Vimeo.videoId(channel.url) != null || YouTube.videoId(channel.url) != null
        val wide = LocalConfiguration.current.screenWidthDp >= 400
        var waiting by remember(channel.id) {
            mutableStateOf(embed && wide && AdTiming.enabled && SystemClock.elapsedRealtime() >= AdTiming.nextFullAt)
        }
        DisposableEffect(channel.id) { onDispose { LibraryAds.now.value = null } }
        LaunchedEffect(channel.id, embed, waiting) { LibraryAds.now.value = LibraryVideo(channel.id, embed, waiting) }
        if (waiting) {
            LaunchedEffect(channel.id) {
                // The break comes up a moment after the video is picked; when it doesn't, the video plays.
                if (withTimeoutOrNull(5_000) { AdBreak.active.first { it } } != null) AdBreak.active.first { !it }
                waiting = false
            }
            BackHandler(onBack = stopPlaying)
            Box(Modifier.fillMaxSize().background(Color.Black))
            return
        }
        if (Bilibili.isVideo(channel.url)) {
            OpenInApp(url = channel.url, appName = "Bilibili", onDone = stopPlaying)
            return
        }
        (Dailymotion.videoId(channel.url)?.let(Dailymotion::embedUrl) ?: Vimeo.videoId(channel.url)?.let(Vimeo::embedUrl))?.let { src ->
            EmbedPlayer(src = src, onBack = stopPlaying)
            return
        }
        YouTube.videoId(channel.url)?.let { id ->
            YouTubePlayer(
                videoId = id,
                title = channel.name,
                onBack = stopPlaying,
                onEnded = { playingShow?.let { LibraryFavorites.watched(context, it, channel, ended = true) } },
            )
            return
        }
        PlayerScreen(
            channel = channel,
            favorite = false,
            inPictureInPicture = inPictureInPicture,
            onBack = stopPlaying,
            onToggleFavorite = {},
            showFavorite = false,
        )
        return
    }

    val shelf = language?.let { state.shelves[it] } ?: VodShelf()
    val folders = if (weekTab) Vod.Section.entries.flatMap { shelf.folders(it) } else shelf.folders(tab)
    val show = openShow?.let { name -> folders.firstOrNull { it.name == name } }
    val showKey = if (show != null && language != null) LibraryFavorites.showKey(language, show) else null
    val back: () -> Unit = {
        when {
            show != null -> when {
                start?.show != null -> onClose()
                fromFav -> { openShow = null; fromFav = false; lastPicked = showKey; languageName = FAV }
                else -> openShow = null
            }
            searching -> { searching = false; query = "" }
            favView -> { lastPicked = FAV; languageName = null }
            language != null -> { lastPicked = languageName; languageName = null; group = null }
            else -> onClose()
        }
    }
    BackHandler(onBack = back)
    BackHandler(enabled = askAbout != null) { askAbout = null }

    LaunchedEffect(show?.name, language, favView, state.loading) {
        if (state.loading) return@LaunchedEffect
        delay(100) // let the list lay out its items first
        if (runCatching { pickedFocus.requestFocus() }.isFailure) runCatching { tabFocus.requestFocus() }
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            // Top bar: back, title, Movies / Series, search.
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = back, modifier = Modifier.focusGlow()) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
                Column(Modifier.weight(1f).padding(start = 4.dp)) {
                    Text(
                        show?.name?.let { if (showKey in favKeys) "★ $it" else it }
                            ?: language?.label ?: if (favView) "★ Favorites" else "Library",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (show == null && language == null) {
                        Text(
                            if (favView) "Hold OK on a film or series to add or remove it" else "Updated every morning",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (show == null && language != null) {
                    if (searching) {
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it },
                            placeholder = { Text("Search") },
                            singleLine = true,
                            modifier = Modifier.width(220.dp),
                        )
                    }
                    IconButton(
                        onClick = {
                            if (searching) query = ""
                            searching = !searching
                        },
                        modifier = Modifier.focusGlow(),
                    ) {
                        Icon(
                            if (searching) Icons.Filled.Close else Icons.Filled.Search,
                            contentDescription = if (searching) "Close search" else "Search",
                        )
                    }
                }
            }

            askAbout?.let { video -> PlayedProperlyCard(video) { askAbout = null } }

            when {
                !state.hasPlaylists -> VodMessage(
                    "No playlists yet.\n\nAdd your provider's playlist in Settings > My playlists. " +
                        "Its movies and series will show here."
                )
                state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                show != null -> LazyColumn(
                    state = episodeList,
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(show.episodes, key = { it.channel.id }) { episode ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(CardShape)
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .then(if (episode.channel.id == lastPicked) Modifier.focusRequester(pickedFocus) else Modifier)
                                .focusGlow(CardShape)
                                .combinedClickable(
                                    onClick = {
                                        lastPicked = episode.channel.id
                                        if (showKey != null) playEpisode(showKey, episode.channel) else playMovie(episode.channel)
                                    },
                                    // Holding OK on any episode adds (or removes) the whole series.
                                    onLongClick = { showKey?.let(toggleFavorite) },
                                )
                                .padding(horizontal = 16.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Filled.PlayArrow, contentDescription = null)
                            Text(
                                episode.label,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(start = 12.dp).width(96.dp),
                            )
                            Column(Modifier.weight(1f, fill = false)) {
                                if (episode.label != episode.channel.name) {
                                    Text(episode.channel.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                episode.channel.desc?.let {
                                    Text(
                                        it,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                            Vod.length(episode.channel.mins)?.let {
                                Text(
                                    it,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(start = 12.dp),
                                )
                            }
                            if (Vod.isNew(episode.channel, newSince)) {
                                Text(
                                    "NEW",
                                    color = Color(0xFFFF5252),
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(start = 12.dp),
                                )
                            }
                            Vod.addedLabel(episode.channel.added)?.let {
                                Text(
                                    it,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(start = 12.dp),
                                )
                            }
                        }
                    }
                }
                favView -> if (favorites.isEmpty()) {
                    VodMessage("Nothing in Favorites yet.\n\nHold OK on a film or series to add it here.")
                } else {
                    PosterGrid(
                        favoritesGrid,
                        favorites.map { fav ->
                            val movie = fav.movie
                            val series = fav.show
                            if (movie != null) Poster(
                                fav.key, movie.name, movie.logo,
                                listOfNotNull(fav.language.label, Vod.Section.MOVIES.label, Vod.length(movie.mins)).joinToString(" · "),
                                favorite = true,
                            ) else Poster(
                                fav.key, series!!.name, series.logo,
                                "${fav.language.label} · ${fav.section.label} · ${series.episodes.size} episodes",
                                favorite = true,
                            )
                        },
                        lastPicked,
                        pickedFocus,
                        onHold = toggleFavorite,
                    ) { key ->
                        val fav = favorites.firstOrNull { it.key == key } ?: return@PosterGrid
                        lastPicked = key
                        fav.movie?.let(playMovie)
                        fav.show?.let { series ->
                            // Straight into the episode to carry on with; Back from it shows the series' episodes.
                            languageName = fav.language.name
                            tabName = fav.section.name
                            group = null
                            openShow = series.name
                            fromFav = true
                            LibraryFavorites.resumeEpisode(context, key, series)?.let { episode ->
                                lastPicked = episode.channel.id
                                playEpisode(key, episode.channel)
                            }
                        }
                    }
                }
                language == null -> PosterGrid(
                    languageGrid,
                    (if (favorites.isEmpty()) emptyList() else listOf(
                        Poster(FAV, "★ Favorites", null, if (favorites.size == 1) "1 title" else "${favorites.size} titles"),
                    )) + Vod.Language.entries.map { lang ->
                        val size = state.shelves[lang]?.size ?: 0
                        val fresh = state.shelves[lang]?.newCount(weekSince) ?: 0
                        Poster(
                            lang.name, lang.label, null,
                            (if (size == 1) "1 title" else "$size titles") + if (fresh > 0) " · $fresh newly added" else "",
                        )
                    },
                    lastPicked ?: Vod.Language.URDU.name,
                    pickedFocus,
                    columns = GridCells.Fixed(4),
                    tile = true,
                ) { name ->
                    if (name == FAV) {
                        languageName = FAV
                        lastPicked = null
                        return@PosterGrid
                    }
                    languageName = name
                    tabName = if ((state.shelves[Vod.Language.valueOf(name)]?.newCount(weekSince) ?: 0) > 0) WEEK_TAB else
                        Vod.Section.entries.firstOrNull { sectionItems(state, name, it).isNotEmpty() }?.name ?: Vod.Section.MOVIES.name
                    group = null
                    lastPicked = null
                }
                else -> {
                    val shelfLanguage = language ?: Vod.Language.ENGLISH // always set here
                    val q = query.trim()
                    // Newly added first (newest on top), the rest in their usual order.
                    val movies = shelf.movies.filter { q.isBlank() || it.name.contains(q, true) }
                        .sortedByDescending { if (Vod.isNew(it, newSince)) it.added.orEmpty() else "" }
                    val folderLists = Vod.Section.entries.associateWith { section ->
                        shelf.folders(section).filter { q.isBlank() || it.name.contains(q, true) }
                            .sortedByDescending { if (it.newEpisodes(newSince) > 0) it.added.orEmpty() else "" }
                    }
                    val weekMovies = movies.filter { Vod.isNew(it, weekSince) }
                    val weekFolders = Vod.Section.entries.flatMap { section ->
                        folderLists.getValue(section).filter { it.newEpisodes(weekSince) > 0 }.map { section to it }
                    }
                    val sections = Vod.Section.entries.filter { section ->
                        section == Vod.Section.MOVIES || (language != Vod.Language.PUNJABI && shelf.folders(section).isNotEmpty())
                    }
                    val groups = if (weekTab) emptyList() else (if (tab == Vod.Section.MOVIES) movies.mapNotNull { it.group } else
                        folderLists.getValue(tab).mapNotNull { it.group })
                        .groupingBy { it }.eachCount().entries
                        .sortedWith(compareBy({ -it.value }, { it.key }))
                        .map { it.key }
                        .takeIf { it.size > 1 }.orEmpty()
                    // Genre chips (owner, 2026-10-08: like the 1+List filter row), most titles first.
                    val genreChips = if (weekTab) emptyList() else (if (tab == Vod.Section.MOVIES) movies.flatMap { it.genres } else
                        folderLists.getValue(tab).flatMap { it.genres })
                        .groupingBy { it }.eachCount().filter { it.value >= 2 }.entries
                        .sortedWith(compareBy({ -it.value }, { it.key }))
                        .map { it.key }
                        .takeIf { it.size > 1 }.orEmpty()

                    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            val weekCount = weekMovies.size + weekFolders.size
                            if (weekCount > 0) {
                                item(key = "week") {
                                    VodChip(
                                        "★ Added this week ($weekCount)",
                                        weekTab,
                                        Modifier.focusRequester(tabFocus),
                                    ) {
                                        tabName = WEEK_TAB; group = null
                                    }
                                }
                            }
                            items(sections, key = { "tab:${it.name}" }) { section ->
                                val count = if (section == Vod.Section.MOVIES) movies.size else folderLists.getValue(section).size
                                VodChip(
                                    "${section.label} ($count)",
                                    !weekTab && tab == section,
                                    if (section == sections.first() && weekMovies.isEmpty() && weekFolders.isEmpty()) Modifier.focusRequester(tabFocus) else Modifier,
                                ) {
                                    tabName = section.name; group = null
                                }
                            }
                            items(genreChips, key = { "genre:$it" }) { g ->
                                VodChip(g, GENRE + g == group, outlined = true) { group = (GENRE + g).takeUnless { it == group } }
                            }
                            items(groups, key = { "group:$it" }) { g ->
                                VodChip(g, g == group, outlined = true) { group = g.takeUnless { it == group } }
                            }
                        }
                    }

                    if (weekTab) {
                        // Newest first, every section together; the label under each says what it is.
                        val week = (weekMovies.map { Triple(it.added.orEmpty(), it.id, Poster(it.id, it.name, it.logo, listOfNotNull(Vod.Section.MOVIES.label, Vod.length(it.mins)).joinToString(" · "), Vod.isNew(it, newSince), Vod.addedLabel(it.added), it.desc, LibraryFavorites.movieKey(it) in favKeys)) } +
                            weekFolders.map { (section, show) ->
                                val fresh = show.newEpisodes(weekSince)
                                Triple(show.added.orEmpty(), show.name, Poster(
                                    show.name, show.name, show.logo,
                                    "${section.label} · $fresh new " + if (fresh == 1) "episode" else "episodes",
                                    show.newEpisodes(newSince) > 0,
                                    Vod.addedLabel(show.added),
                                    show.desc,
                                    LibraryFavorites.showKey(shelfLanguage, show) in favKeys,
                                ))
                            }).sortedByDescending { it.first }
                        PosterGrid(
                            moviesGrid, week.map { it.third }, lastPicked, pickedFocus,
                            onHold = { key ->
                                val movie = weekMovies.firstOrNull { it.id == key }
                                val series = weekFolders.firstOrNull { it.second.name == key }?.second
                                when {
                                    movie != null -> toggleFavorite(LibraryFavorites.movieKey(movie))
                                    series != null -> toggleFavorite(LibraryFavorites.showKey(shelfLanguage, series))
                                }
                            },
                        ) { key ->
                            lastPicked = key
                            val movie = weekMovies.firstOrNull { it.id == key }
                            if (movie != null) playMovie(movie) else openShow = key
                        }
                    } else if (tab == Vod.Section.MOVIES) {
                        val list = movies.filter {
                            inChip(group, it.group, it.genres)
                        }
                        if (list.isEmpty()) {
                            VodMessage("No ${language?.label} movies yet.")
                        } else {
                            PosterGrid(
                                moviesGrid,
                                list.map {
                                    Poster(
                                        it.id, it.name, it.logo, Vod.length(it.mins), fresh = Vod.isNew(it, newSince),
                                        added = Vod.addedLabel(it.added), detail = it.desc,
                                        favorite = LibraryFavorites.movieKey(it) in favKeys,
                                    )
                                },
                                lastPicked,
                                pickedFocus,
                                onHold = { id -> list.firstOrNull { it.id == id }?.let { toggleFavorite(LibraryFavorites.movieKey(it)) } },
                            ) { id ->
                                lastPicked = id
                                list.firstOrNull { it.id == id }?.let(playMovie)
                            }
                        }
                    } else {
                        val list = folderLists.getValue(tab).filter {
                            inChip(group, it.group, it.genres)
                        }
                        if (list.isEmpty()) {
                            VodMessage("No ${language?.label} ${tab.label.lowercase()} yet.")
                        } else {
                            PosterGrid(
                                seriesGrid,
                                list.map {
                                    val fresh = it.newEpisodes(newSince)
                                    Poster(
                                        it.name, it.name, it.logo,
                                        "${it.episodes.size} episodes" +
                                            (Vod.length(it.episodeMins)?.let { len -> " · $len each" } ?: "") +
                                            if (fresh > 0) " · $fresh new" else "",
                                        fresh = fresh > 0,
                                        added = Vod.addedLabel(it.added),
                                        detail = it.desc,
                                        favorite = LibraryFavorites.showKey(shelfLanguage, it) in favKeys,
                                    )
                                },
                                lastPicked,
                                pickedFocus,
                                onHold = { name -> list.firstOrNull { it.name == name }?.let { toggleFavorite(LibraryFavorites.showKey(shelfLanguage, it)) } },
                            ) { name ->
                                lastPicked = name
                                openShow = name
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun sectionItems(state: VodState, language: String, section: Vod.Section): List<Any> {
    val shelf = state.shelves[Vod.Language.valueOf(language)] ?: return emptyList()
    return if (section == Vod.Section.MOVIES) shelf.movies else shelf.folders(section)
}

/** Marks a genre chip's filter value (never part of a real group name). */
private const val GENRE = "\u0000genre:"

/** Whether a title belongs under the picked chip: its genre chip, or its group's chip. */
private fun inChip(chip: String?, group: String?, genres: List<String>): Boolean = when {
    chip == null -> true
    chip.startsWith(GENRE) -> chip.removePrefix(GENRE) in genres
    else -> group == chip
}

/** The "Added this week" tab's name (never a real section name). */
private const val WEEK_TAB = "WEEK"

/** The ★ Favorites page's name, in place of a language's (never a real language name). */
private const val FAV = "FAVORITES"

/** One Library favourite as it is in today's lists: a film, or a series with its section. */
private class FavItem(
    val key: String,
    val language: Vod.Language,
    val section: Vod.Section,
    val movie: Channel? = null,
    val show: Vod.Show? = null,
)

/**
 * The saved favourites found in today's lists, the last one watched (or added) first. One that has left
 * the lists stays saved and shows again if it comes back.
 */
private fun favoriteItems(context: android.content.Context, shelves: Map<Vod.Language, VodShelf>, keys: Set<String>): List<FavItem> {
    if (keys.isEmpty()) return emptyList()
    val found = mutableListOf<FavItem>()
    for ((language, shelf) in shelves) {
        shelf.movies.forEach { movie ->
            val key = LibraryFavorites.movieKey(movie)
            if (key in keys) found += FavItem(key, language, Vod.Section.MOVIES, movie = movie)
        }
        Vod.Section.entries.forEach { section ->
            shelf.folders(section).forEach { show ->
                val key = LibraryFavorites.showKey(language, show)
                if (key in keys) found += FavItem(key, language, section, show = show)
            }
        }
    }
    return found.distinctBy { it.key }.sortedByDescending { LibraryFavorites.lastUsed(context, it.key) }
}

private data class Poster(
    val key: String,
    val title: String,
    val image: String?,
    val subtitle: String? = null,
    /** Newly added: a NEW mark on the picture. */
    val fresh: Boolean = false,
    /** "Added Oct 8": the day it (or its newest episode) came into the Library, shown on the picture. */
    val added: String? = null,
    /** A line or two about it, under the title (owner, 2026-10-08: every title says what it is). */
    val detail: String? = null,
    /** In the viewer's Library Favorites: a gold star on the picture. */
    val favorite: Boolean = false,
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PosterGrid(
    gridState: LazyGridState,
    posters: List<Poster>,
    focusKey: String?,
    focus: FocusRequester,
    columns: GridCells = GridCells.Adaptive(140.dp),
    /** Wide text tiles (the language picker) instead of 2:3 posters. */
    tile: Boolean = false,
    /** Holding OK on a poster (adds it to, or removes it from, Favorites). */
    onHold: ((String) -> Unit)? = null,
    onOpen: (String) -> Unit,
) {
    LazyVerticalGrid(
        state = gridState,
        columns = columns,
        contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(posters, key = { it.key }) { poster ->
            Column(
                Modifier
                    .then(if (poster.key == focusKey) Modifier.focusRequester(focus) else Modifier)
                    .focusGlow(CardShape)
                    .clip(CardShape)
                    .combinedClickable(
                        onClick = { onOpen(poster.key) },
                        onLongClick = onHold?.let { hold -> { hold(poster.key) } },
                    )
                    .padding(4.dp),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .aspectRatio(if (tile) 16f / 9f else 2f / 3f)
                        .clip(CardShape)
                        .background(if (tile) AccentBlue else MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    if (tile) {
                        Text(
                            poster.title,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                        )
                        return@Box
                    }
                    val placeholder = @Composable {
                        Icon(
                            Icons.Filled.Movie,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(48.dp),
                        )
                    }
                    if (poster.image != null) {
                        SubcomposeAsyncImage(
                            model = poster.image,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                            error = { placeholder() },
                            loading = { placeholder() },
                        )
                    } else {
                        placeholder()
                    }
                    if (poster.fresh) {
                        Text(
                            "NEW",
                            color = Color.White,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier
                                .align(Alignment.TopStart)
                                .padding(6.dp)
                                .clip(ChipShape)
                                .background(Color(0xFFD32F2F))
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                    if (poster.favorite) {
                        Text(
                            "★",
                            color = Color(0xFFFFC107),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(6.dp)
                                .clip(ChipShape)
                                .background(Color.Black.copy(alpha = 0.7f))
                                .padding(horizontal = 6.dp, vertical = 0.dp),
                        )
                    }
                    poster.added?.let { added ->
                        Text(
                            added,
                            color = Color.White,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier
                                .align(Alignment.BottomStart)
                                .padding(6.dp)
                                .clip(ChipShape)
                                .background(Color.Black.copy(alpha = 0.7f))
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                }
                if (!tile) Text(
                    poster.title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 6.dp),
                )
                poster.subtitle?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                poster.detail?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun VodChip(
    label: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    outlined: Boolean = false,
    onClick: () -> Unit,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label, fontWeight = if (outlined) FontWeight.Normal else FontWeight.Bold) },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = AccentBlue,
            selectedLabelColor = Color.White,
        ),
        modifier = modifier.focusGlow(ChipShape),
    )
}

@Composable
private fun VodMessage(text: String) {
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(text, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge)
    }
}

/**
 * "Did it play properly?" after a Library video (owner, 2026-10-08): Yes / No go to the owner
 * (LibraryReports), and a programme more viewers say No to comes off the Library the next morning.
 */
@Composable
private fun PlayedProperlyCard(video: Channel, onDone: () -> Unit) {
    val context = LocalContext.current
    val yes = remember { FocusRequester() }
    LaunchedEffect(video.id) {
        delay(300) // after the list has put the highlight back on what was picked
        runCatching { yes.requestFocus() }
        delay(30_000)
        onDone()
    }
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp)
            .clip(CardShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "Did \"${video.name}\" play properly?",
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(
            "✓ Yes, it played",
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier
                .padding(start = 12.dp)
                .focusRequester(yes)
                .focusGlow(ChipShape)
                .clip(ChipShape)
                .background(Color(0xFF2E7D32))
                .clickable { LibraryReports.send(context, video, ok = true); onDone() }
                .padding(horizontal = 14.dp, vertical = 8.dp),
        )
        Text(
            "✗ No, not working",
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier
                .padding(start = 12.dp)
                .focusGlow(ChipShape)
                .clip(ChipShape)
                .background(Color(0xFFD32F2F))
                .clickable {
                    LibraryReports.send(context, video, ok = false)
                    android.widget.Toast.makeText(context, "Thank you. We'll check it and take it off if it's broken.", android.widget.Toast.LENGTH_LONG).show()
                    onDone()
                }
                .padding(horizontal = 14.dp, vertical = 8.dp),
        )
    }
}
