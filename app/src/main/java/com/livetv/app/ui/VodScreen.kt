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
import com.livetv.app.data.YouTube
import com.livetv.app.player.PlayerScreen

private const val TAB_MOVIES = "Movies"
private const val TAB_SERIES = "Series"

/**
 * Live TV's Movies & Series: the movies and TV series in the viewer's saved playlists
 * (Settings > My playlists), as poster grids filtered by the playlists' own groups.
 * A show opens its episode list; anything picked plays full screen with a seek bar.
 */
@Composable
fun VodScreen(inPictureInPicture: Boolean, onClose: () -> Unit) {
    val vm = viewModel<VodViewModel>()
    val state by vm.state.collectAsStateWithLifecycle()

    var tab by rememberSaveable { mutableStateOf(TAB_MOVIES) }
    var group by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var searching by rememberSaveable { mutableStateOf(false) }
    var openShow by rememberSaveable { mutableStateOf<String?>(null) }
    var playing by remember { mutableStateOf<Channel?>(null) }
    val tabFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { vm.refreshIfChanged() }
    // Kept above the player so the lists keep their scroll position while something plays,
    // and the remote's highlight goes back to what was picked.
    val moviesGrid = rememberLazyGridState()
    val seriesGrid = rememberLazyGridState()
    val episodeList = rememberLazyListState()
    var lastPicked by rememberSaveable { mutableStateOf<String?>(null) }
    val pickedFocus = remember { FocusRequester() }

    playing?.let { channel ->
        if (Bilibili.isVideo(channel.url)) {
            OpenInApp(url = channel.url, appName = "Bilibili", onDone = { playing = null })
            return
        }
        YouTube.videoId(channel.url)?.let { id ->
            YouTubePlayer(videoId = id, onBack = { playing = null })
            return
        }
        PlayerScreen(
            channel = channel,
            favorite = false,
            inPictureInPicture = inPictureInPicture,
            onBack = { playing = null },
            onToggleFavorite = {},
            showFavorite = false,
        )
        return
    }

    val show = openShow?.let { name -> state.shows.firstOrNull { it.name == name } }
    BackHandler {
        when {
            show != null -> openShow = null
            searching -> { searching = false; query = "" }
            else -> onClose()
        }
    }

    LaunchedEffect(show?.name, state.loading) {
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
                IconButton(onClick = { if (show != null) openShow = null else onClose() }, modifier = Modifier.focusGlow()) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
                Text(
                    show?.name ?: "Movies & Series",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).padding(start = 4.dp),
                )
                if (show == null) {
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
                else -> {
                    val movies = state.movies.filter { query.isBlank() || it.name.contains(query.trim(), true) }
                    val shows = state.shows.filter { query.isBlank() || it.name.contains(query.trim(), true) }
                    val groups = (if (tab == TAB_MOVIES) movies.mapNotNull { it.group } else shows.mapNotNull { it.group })
                        .groupingBy { it }.eachCount().entries
                        .sortedWith(compareBy({ -it.value }, { it.key }))
                        .map { it.key }

                    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            item(key = "tab:movies") {
                                VodChip("$TAB_MOVIES (${movies.size})", tab == TAB_MOVIES, Modifier.focusRequester(tabFocus)) {
                                    tab = TAB_MOVIES; group = null
                                }
                            }
                            item(key = "tab:series") {
                                VodChip("$TAB_SERIES (${shows.size})", tab == TAB_SERIES) {
                                    tab = TAB_SERIES; group = null
                                }
                            }
                            items(groups, key = { "group:$it" }) { g ->
                                VodChip(g, g == group, outlined = true) { group = g.takeUnless { it == group } }
                            }
                        }
                    }

                    if (tab == TAB_MOVIES) {
                        val list = movies.filter { group == null || it.group == group }
                        if (list.isEmpty()) {
                            VodMessage("No movies found in your playlists.")
                        } else {
                            PosterGrid(moviesGrid, list.map { Poster(it.id, it.name, it.logo) }, lastPicked, pickedFocus) { id ->
                                lastPicked = id
                                playing = list.firstOrNull { it.id == id }
                            }
                        }
                    } else {
                        val list = shows.filter { group == null || it.group == group }
                        if (list.isEmpty()) {
                            VodMessage("No series found in your playlists.")
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

private data class Poster(val key: String, val title: String, val image: String?, val subtitle: String? = null)

@Composable
private fun PosterGrid(
    gridState: LazyGridState,
    posters: List<Poster>,
    focusKey: String?,
    focus: FocusRequester,
    onOpen: (String) -> Unit,
) {
    LazyVerticalGrid(
        state = gridState,
        columns = GridCells.Adaptive(140.dp),
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
                        .aspectRatio(2f / 3f)
                        .clip(CardShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
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
                Text(
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
