package com.livetv.app.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import com.livetv.app.R
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import com.livetv.app.Edition
import com.livetv.app.data.Channel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChannelListScreen(
    state: UiState,
    onPlay: (Channel) -> Unit,
    onToggleFavorite: (Channel) -> Unit,
    onQueryChange: (String) -> Unit,
    onFilterChange: (String) -> Unit,
    onCategoryChange: (String?) -> Unit,
    onRefresh: () -> Unit,
    /** This app's Settings dialog; it calls the given function to close. */
    settings: @Composable (onDismiss: () -> Unit) -> Unit,
    /** Stream Player Plus: adds the built-in demo playlist. */
    onTryDemo: () -> Unit = {},
) {
    var searching by rememberSaveable { mutableStateOf(false) }
    var showSettings by rememberSaveable { mutableStateOf(false) }
    val gridState = rememberLazyGridState()
    val lastWatchedFocus = remember { FocusRequester() }

    // Coming back from the player: scroll to the channel that was playing and put the
    // remote's cursor on it.
    LaunchedEffect(Unit) {
        val index = state.visibleChannels.indexOfFirst { it.id == state.lastWatchedId }
        if (index >= 0) {
            gridState.scrollToItem(index)
            withFrameNanos { }
            runCatching { lastWatchedFocus.requestFocus() }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (searching) {
                        OutlinedTextField(
                            value = state.query,
                            onValueChange = onQueryChange,
                            placeholder = { Text("Search channels") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AppLogo()
                            Spacer(Modifier.width(12.dp))
                            Text(state.title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                },
                actions = {
                    IconButton(modifier = Modifier.focusGlow(), onClick = {
                        if (searching) onQueryChange("")
                        searching = !searching
                    }) {
                        Icon(
                            if (searching) Icons.Filled.Close else Icons.Filled.Search,
                            contentDescription = if (searching) "Close search" else "Search",
                        )
                    }
                    IconButton(onClick = { showSettings = true }, modifier = Modifier.focusGlow()) {
                        Icon(Icons.Filled.Settings, contentDescription = "Settings")
                    }
                },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.loading,
            onRefresh = onRefresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            Column(Modifier.fillMaxSize()) {
                if (state.needsPlaylist) {
                    Message(
                        text = "Add a playlist to start watching.\n\nPaste a playlist link (M3U) from your TV " +
                            "provider, or open a playlist file saved on this device. " +
                            "${Edition.APP_NAME} doesn't include any channels.",
                        action = "Add a playlist",
                        onAction = { showSettings = true },
                        secondAction = "Try demo channels",
                        onSecondAction = onTryDemo,
                    )
                    return@Column
                }
                // Countries. Tapping the selected one again goes back to every channel.
                ChipRow(
                    items = state.groups,
                    selected = setOfNotNull(state.filter),
                    onSelect = { onFilterChange(if (it == state.filter) FILTER_ALL else it) },
                )
                // All, Favorites, then genres. All clears every filter; tapping a selected genre clears it.
                ChipRow(
                    items = listOf(FILTER_ALL, FILTER_FAVORITES) + state.categories,
                    selected = setOfNotNull(
                        FILTER_ALL.takeIf { state.filter == FILTER_ALL && state.category == null },
                        state.filter.takeIf { it == FILTER_FAVORITES },
                        state.category,
                    ),
                    onSelect = {
                        when (it) {
                            FILTER_ALL -> onFilterChange(FILTER_ALL)
                            FILTER_FAVORITES -> onFilterChange(if (state.filter == FILTER_FAVORITES) FILTER_ALL else FILTER_FAVORITES)
                            else -> onCategoryChange(it.takeUnless { c -> c == state.category })
                        }
                    },
                )

                val channels = state.visibleChannels
                when {
                    state.error != null && state.channels.isEmpty() -> Message(
                        text = state.error,
                        action = "Retry",
                        onAction = onRefresh,
                    )
                    !state.loading && channels.isEmpty() -> Message(
                        text = if (state.filter == FILTER_FAVORITES) {
                            "No favorites yet. Long-press a channel or tap its star to add one."
                        } else {
                            "No channels match."
                        },
                    )
                    else -> LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 150.dp),
                        contentPadding = PaddingValues(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        state = gridState,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(channels, key = { it.id }) { channel ->
                            ChannelCard(
                                channel = channel,
                                favorite = channel.id in state.favorites,
                                onClick = { onPlay(channel) },
                                onToggleFavorite = { onToggleFavorite(channel) },
                                focusRequester = lastWatchedFocus.takeIf { channel.id == state.lastWatchedId },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showSettings) settings { showSettings = false }
}

@Composable
private fun ChipRow(items: List<String>, selected: Set<String>, onSelect: (String) -> Unit) {
    // Without the extra invisible touch margin around chips, the focus glow hugs the chip's edges.
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
        ChipRowContent(items, selected, onSelect)
    }
}

@Composable
private fun ChipRowContent(items: List<String>, selected: Set<String>, onSelect: (String) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(items, key = { it }) { item ->
            FilterChip(
                selected = item in selected,
                onClick = { onSelect(item) },
                label = { Text(item) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = AccentBlue,
                    selectedLabelColor = Color.White,
                    selectedLeadingIconColor = Color.White,
                ),
                modifier = Modifier.focusGlow(ChipShape),
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChannelCard(
    channel: Channel,
    favorite: Boolean,
    onClick: () -> Unit,
    onToggleFavorite: () -> Unit,
    focusRequester: FocusRequester? = null,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier
            .fillMaxWidth()
            .focusGlow(CardShape)
            .clip(CardShape)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .combinedClickable(onClick = onClick, onLongClick = onToggleFavorite),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            if (channel.logo != null) {
                SubcomposeAsyncImage(
                    model = channel.logo,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    error = { Initials(channel.name) },
                    loading = { Initials(channel.name) },
                )
            } else {
                Initials(channel.name)
            }
            if (channel.number > 0) {
                Text(
                    "${channel.number}",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(6.dp)
                        .background(AccentBlue, ChipShape)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
            IconButton(
                onClick = onToggleFavorite,
                modifier = Modifier.align(Alignment.TopEnd).focusGlow(),
            ) {
                Icon(
                    if (favorite) Icons.Filled.Star else Icons.Outlined.StarBorder,
                    contentDescription = if (favorite) "Remove from favorites" else "Add to favorites",
                    tint = if (favorite) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            Text(
                channel.name,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                channel.group ?: " ",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** The app icon: a white TV with a red play button on a red tile. */
@Composable
private fun AppLogo() {
    Box(
        Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(colorResource(R.color.ic_launcher_background)),
    ) {
        Image(
            painter = painterResource(R.drawable.ic_launcher_foreground),
            contentDescription = null,
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { scaleX = 1.3f; scaleY = 1.3f },
        )
    }
}

@Composable
private fun Initials(name: String) {
    val initials = name.split(' ', '-', '_')
        .filter { it.isNotBlank() }
        .take(2)
        .joinToString("") { it.first().uppercase() }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            initials,
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun Message(
    text: String,
    action: String? = null,
    onAction: () -> Unit = {},
    secondAction: String? = null,
    onSecondAction: () -> Unit = {},
) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text, textAlign = TextAlign.Center)
        if (action != null) {
            Spacer(Modifier.height(16.dp))
            AccentButton(onClick = onAction, modifier = Modifier.focusGlow()) { Text(action) }
        }
        if (secondAction != null) {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(
                onClick = onSecondAction,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = AccentText),
                modifier = Modifier.focusGlow(),
            ) { Text(secondAction) }
        }
    }
}
