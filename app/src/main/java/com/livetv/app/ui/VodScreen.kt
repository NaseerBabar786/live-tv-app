package com.livetv.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil3.compose.SubcomposeAsyncImage
import kotlinx.coroutines.delay
import com.livetv.app.data.Bilibili
import com.livetv.app.data.Channel
import com.livetv.app.data.Dailymotion
import com.livetv.app.data.Vimeo
import com.livetv.app.data.Vod
import com.livetv.app.data.YouTube
import com.livetv.app.player.PlayerScreen

/**
 * Free Live TV's Movies & Series. First a language (Urdu, Hindi, Punjabi, English), then its
 * Movies, Series and Shows as poster grids filtered by the playlists' own groups. Each
 * drama or show is a folder that opens its episode list; anything picked plays full
 * screen (YouTube videos in YouTube's player).
 */
@Composable
fun VodScreen(inPictureInPicture: Boolean, onClose: () -> Unit, start: VodTarget? = null) {
    val vm = viewModel<VodViewModel>()
    val state by vm.state.collectAsStateWithLifecycle()

    var languageName by rememberSaveable { mutableStateOf(start?.language?.name) }
    val language = languageName?.let { Vod.Language.valueOf(it) }
    var tabName by rememberSaveable { mutableStateOf((start?.section ?: Vod.Section.MOVIES).name) }
    val tab = Vod.Section.valueOf(tabName)
    var group by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var searching by rememberSaveable { mutableStateOf(false) }
    var openShow by rememberSaveable { mutableStateOf(start?.show) }
    var playing by remember { mutableStateOf(start?.play) }
    // Opened from the home screen for one video: Back from it goes straight back there.
    val stopPlaying: () -> Unit = { if (start?.play != null) onClose() else playing = null }
    val tabFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { vm.refreshIfChanged() }
    // Kept above the player so the lists keep their scroll position while something plays,
    // and the remote's highlight goes back to what was picked.
    val moviesGrid = rememberLazyGridState()
    val seriesGrid = rememberLazyGridState()
    val languageGrid = rememberLazyGridState()
    val episodeList = rememberLazyListState()
    var lastPicked by rememberSaveable { mutableStateOf<String?>(null) }
    val pickedFocus = remember { FocusRequester() }

    playing?.let { channel ->
        if (Bilibili.isVideo(channel.url)) {
            OpenInApp(url = channel.url, appName = "Bilibili", onDone = stopPlaying)
            return
        }
        (Dailymotion.videoId(channel.url)?.let(Dailymotion::embedUrl) ?: Vimeo.videoId(channel.url)?.let(Vimeo::embedUrl))?.let { src ->
            EmbedPlayer(src = src, onBack = stopPlaying)
            return
        }
        YouTube.videoId(channel.url)?.let { id ->
            YouTubePlayer(videoId = id, onBack = stopPlaying)
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
    val folders = shelf.folders(tab)
    val show = openShow?.let { name -> folders.firstOrNull { it.name == name } }
    val back: () -> Unit = {
        when {
            show != null -> if (start?.show != null) onClose() else openShow = null
            searching -> { searching = false; query = "" }
            language != null -> { lastPicked = languageName; languageName = null; group = null }
            else -> onClose()
        }
    }
    BackHandler(onBack = back)

    LaunchedEffect(show?.name, language, state.loading) {
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
                        show?.name ?: language?.label ?: "Library",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (show == null && language == null) {
                        Text(
                            "Weekly Updates",
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
                                .clickable { lastPicked = episode.channel.id; playing = episode.channel }
                                .padding(horizontal = 16.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Filled.PlayArrow, contentDescription = null)
                            Text(
                                episode.label,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(start = 12.dp).width(96.dp),
                            )
                            if (episode.label != episode.channel.name) {
                                Text(episode.channel.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
                language == null -> PosterGrid(
                    languageGrid,
                    Vod.Language.entries.map { lang ->
                        val size = state.shelves[lang]?.size ?: 0
                        Poster(lang.name, lang.label, null, if (size == 1) "1 title" else "$size titles")
                    },
                    lastPicked ?: Vod.Language.URDU.name,
                    pickedFocus,
                    columns = GridCells.Fixed(4),
                    tile = true,
                ) { name ->
                    languageName = name
                    tabName = Vod.Section.entries.firstOrNull { sectionItems(state, name, it).isNotEmpty() }?.name ?: Vod.Section.MOVIES.name
                    group = null
                    lastPicked = null
                }
                else -> {
                    val q = query.trim()
                    val movies = shelf.movies.filter { q.isBlank() || it.name.contains(q, true) }
                    val folderLists = Vod.Section.entries.associateWith { section ->
                        shelf.folders(section).filter { q.isBlank() || it.name.contains(q, true) }
                    }
                    val sections = Vod.Section.entries.filter { section ->
                        section == Vod.Section.MOVIES || (language != Vod.Language.PUNJABI && shelf.folders(section).isNotEmpty())
                    }
                    val groups = (if (tab == Vod.Section.MOVIES) movies.mapNotNull { it.group } else
                        folderLists.getValue(tab).mapNotNull { it.group })
                        .groupingBy { it }.eachCount().entries
                        .sortedWith(compareBy({ -it.value }, { it.key }))
                        .map { it.key }
                        .takeIf { it.size > 1 }.orEmpty()

                    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            items(sections, key = { "tab:${it.name}" }) { section ->
                                val count = if (section == Vod.Section.MOVIES) movies.size else folderLists.getValue(section).size
                                VodChip(
                                    "${section.label} ($count)",
                                    tab == section,
                                    if (section == sections.first()) Modifier.focusRequester(tabFocus) else Modifier,
                                ) {
                                    tabName = section.name; group = null
                                }
                            }
                            items(groups, key = { "group:$it" }) { g ->
                                VodChip(g, g == group, outlined = true) { group = g.takeUnless { it == group } }
                            }
                        }
                    }

                    if (tab == Vod.Section.MOVIES) {
                        val list = movies.filter { group == null || it.group == group }
                        if (list.isEmpty()) {
                            VodMessage("No ${language?.label} movies yet.")
                        } else {
                            PosterGrid(moviesGrid, list.map { Poster(it.id, it.name, it.logo) }, lastPicked, pickedFocus) { id ->
                                lastPicked = id
                                playing = list.firstOrNull { it.id == id }
                            }
                        }
                    } else {
                        val list = folderLists.getValue(tab).filter { group == null || it.group == group }
                        if (list.isEmpty()) {
                            VodMessage("No ${language?.label} ${tab.label.lowercase()} yet.")
                        } else {
                            PosterGrid(
                                seriesGrid,
                                list.map { Poster(it.name, it.name, it.logo, "${it.episodes.size} episodes") },
                                lastPicked,
                                pickedFocus,
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

private data class Poster(val key: String, val title: String, val image: String?, val subtitle: String? = null)

@Composable
private fun PosterGrid(
    gridState: LazyGridState,
    posters: List<Poster>,
    focusKey: String?,
    focus: FocusRequester,
    columns: GridCells = GridCells.Adaptive(140.dp),
    /** Wide text tiles (the language picker) instead of 2:3 posters. */
    tile: Boolean = false,
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
                    .clickable { onOpen(poster.key) }
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
