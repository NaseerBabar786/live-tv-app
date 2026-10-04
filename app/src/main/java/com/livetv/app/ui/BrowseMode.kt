package com.livetv.app.ui

import android.content.Context
import android.net.ConnectivityManager
import android.view.TextureView
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import coil3.compose.SubcomposeAsyncImage
import com.livetv.app.Edition
import com.livetv.app.Watching
import com.livetv.app.data.Channel
import com.livetv.app.player.StreamPlayer
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.max

/** One row of cards on the Browse screen. */
private class BrowseRow(val key: String, val title: String, val channels: List<Channel>)

/** Where the Browse screen was (row, card and scroll), kept while a channel plays full screen. */
private var sessionRowKey: String? = null
private val sessionCardIndex = mutableStateMapOf<String, Int>()
private var sessionListIndex = 0
private var sessionListOffset = 0

private const val PREFS = "browse"
private const val K_RECENT = "recent"
private const val MAX_RECENT = 20
private const val MAX_PER_ROW = 80

/**
 * "Browse" mode: a home screen like a streaming app's. A rail of icons on the left (Search, Home,
 * Favorites, Games, the layout button and Settings), a search bar on top, and rows of big channel
 * cards: Continue watching, Favorites, then one row per country and per genre. The highlighted
 * card plays the channel live after a moment; OK opens it full screen and Back returns here.
 */
@Composable
internal fun BrowseMode(
    /** Every channel, already limited to the languages chosen in Settings. */
    channels: List<Channel>,
    favorites: Set<String>,
    lastWatchedId: String?,
    query: String,
    onQueryChange: (String) -> Unit,
    sound: Boolean,
    playing: Boolean,
    /** The layout button (Back from the cards lands here, as it does on the other layouts' top bar). */
    modeFocus: FocusRequester,
    modeLabel: String,
    onNextMode: () -> Unit,
    onOpen: (Channel) -> Unit,
    onOpenGames: (() -> Unit)?,
    onOpenSettings: () -> Unit,
    /** Whether the rail has the remote's cursor (Back there asks to exit). */
    onRailFocused: (Boolean) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val palette = Themes.current
    val prefs = remember { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    var recent by remember {
        mutableStateOf(prefs.getString(K_RECENT, null)?.split('\n')?.filter { it.isNotBlank() }.orEmpty())
    }
    fun open(channel: Channel) {
        recent = (listOf(channel.id) + recent.filter { it != channel.id }).take(MAX_RECENT)
        prefs.edit().putString(K_RECENT, recent.joinToString("\n")).apply()
        onOpen(channel)
    }

    var searchOpen by remember { mutableStateOf(query.isNotBlank()) }
    val searchFocus = remember { FocusRequester() }
    val byId = remember(channels) { channels.associateBy { it.id } }
    val rows = remember(channels, favorites, recent, lastWatchedId, query) {
        buildList {
            val q = query.trim()
            if (q.isNotEmpty()) {
                add(BrowseRow("search", "Results for \"$q\"", channels.filter { it.name.contains(q, ignoreCase = true) }))
            }
            val watched = (recent + listOfNotNull(lastWatchedId)).distinct().mapNotNull { byId[it] }
            add(BrowseRow("recent", "Continue watching", watched))
            add(BrowseRow("favorites", "Favorites", channels.filter { it.id in favorites }))
            channels.mapNotNull { it.group }.distinct().forEach { group ->
                add(BrowseRow("group:$group", group, channels.filter { it.group == group }))
            }
            channels.mapNotNull { it.category }
                .filter { it !in setOf("General", "Undefined", "Other") }
                .groupingBy { it }.eachCount().entries
                .sortedByDescending { it.value }
                .take(8)
                .forEach { (category, _) ->
                    add(BrowseRow("genre:$category", category, channels.filter { it.category == category }))
                }
        }.filter { it.channels.isNotEmpty() }.map { BrowseRow(it.key, it.title, it.channels.take(MAX_PER_ROW)) }
    }

    // One live preview at a time, on the highlighted card (Wi-Fi or Ethernet only).
    val stream = remember { StreamPlayer(context, preview = true) }
    var showing by remember { mutableStateOf(false) }
    var focusedKey by remember { mutableStateOf<Pair<String, String>?>(null) } // row key, channel id
    var previewId by remember { mutableStateOf<String?>(null) }
    DisposableEffect(stream) {
        val listener = object : Player.Listener {
            override fun onRenderedFirstFrame() {
                showing = true
            }
        }
        stream.player.addListener(listener)
        onDispose {
            stream.player.removeListener(listener)
            Watching.stop(stream)
            stream.release()
        }
    }
    LaunchedEffect(focusedKey, playing) {
        stream.stop()
        showing = false
        previewId = null
        val id = focusedKey?.second
        if (!playing || id == null) return@LaunchedEffect
        delay(900) // only once the cursor rests on a card
        if (metered(context)) return@LaunchedEffect
        val channel = byId[id] ?: return@LaunchedEffect
        previewId = id
        stream.play(channel)
    }
    LaunchedEffect(sound) { stream.player.volume = if (sound) 1f else 0f }
    DisposableEffect(previewId, sound, playing) {
        val channel = previewId?.let { byId[it] }
        if (channel != null && sound && playing) Watching.watch(stream, channel)
        onDispose { Watching.stop(stream) }
    }

    val listState = rememberLazyListState(sessionListIndex, sessionListOffset)
    DisposableEffect(Unit) {
        onDispose {
            sessionListIndex = listState.firstVisibleItemIndex
            sessionListOffset = listState.firstVisibleItemScrollOffset
        }
    }
    val rowFocus = remember { mutableMapOf<String, FocusRequester>() }
    fun rowRequester(key: String) = rowFocus.getOrPut(key) { FocusRequester() }
    fun focusRow(key: String) {
        val index = rows.indexOfFirst { it.key == key }
        if (index < 0) return
        scope.launch {
            listState.animateScrollToItem(index + 1) // the header is item 0
            withFrameNanos { }
            withFrameNanos { }
            runCatching { rowRequester(key).requestFocus() }
        }
    }
    // Opening, or coming back from full screen: the cursor goes back to the card it was on.
    LaunchedEffect(rows.isNotEmpty()) {
        if (rows.isEmpty()) return@LaunchedEffect
        val key = sessionRowKey?.takeIf { k -> rows.any { it.key == k } } ?: rows.first().key
        withFrameNanos { }
        withFrameNanos { }
        if (listState.layoutInfo.visibleItemsInfo.any { it.key == key }) runCatching { rowRequester(key).requestFocus() }
        else focusRow(key)
    }
    BackHandler(enabled = searchOpen) {
        onQueryChange("")
        searchOpen = false
    }

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(palette.homeTop, palette.homeBottom))),
    ) {
        val railCollapsed = 76.dp
        val contentWidth = maxWidth - railCollapsed - 24.dp
        val cardWidth = contentWidth / 3.35f
        LazyColumn(
            state = listState,
            contentPadding = PaddingValues(start = railCollapsed + 8.dp, end = 0.dp, top = 18.dp, bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            item(key = "header") {
                Row(
                    Modifier.fillMaxWidth().padding(start = 14.dp, end = 28.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (searchOpen) {
                        LaunchedEffect(Unit) { withFrameNanos { }; runCatching { searchFocus.requestFocus() } }
                        OutlinedTextField(
                            value = query,
                            onValueChange = onQueryChange,
                            placeholder = { Text("Search channels") },
                            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                            singleLine = true,
                            shape = RoundedCornerShape(50),
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                            keyboardActions = KeyboardActions(onSearch = { if (query.isNotBlank()) focusRow("search") }),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = palette.surfaceVariant,
                                unfocusedContainerColor = palette.surfaceVariant,
                            ),
                            modifier = Modifier.width(contentWidth * 0.45f).focusRequester(searchFocus),
                        )
                    } else {
                        Row(
                            Modifier
                                .width(contentWidth * 0.45f)
                                .height(48.dp)
                                .focusGlow()
                                .clip(RoundedCornerShape(50))
                                .background(palette.surfaceVariant)
                                .clickable { searchOpen = true }
                                .padding(horizontal = 18.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Filled.Search, contentDescription = null, tint = palette.onSurfaceVariant)
                            Spacer(Modifier.width(12.dp))
                            Text("Search", color = palette.onSurfaceVariant, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    Column(horizontalAlignment = Alignment.End) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AppLogo(size = 30.dp)
                            Spacer(Modifier.width(8.dp))
                            Text(Edition.APP_NAME, fontWeight = FontWeight.Bold, fontSize = 20.sp, color = palette.onSurface)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Clock()
                            if (Edition.HAS_WEATHER) WeatherNow()
                        }
                    }
                }
            }
            if (rows.isEmpty()) {
                item(key = "empty") {
                    Text(
                        if (query.isNotBlank()) "No channels match \"$query\"." else "Loading channels…",
                        color = palette.onSurfaceVariant,
                        modifier = Modifier.padding(24.dp),
                    )
                }
            }
            items(rows.size, key = { rows[it].key }) { r ->
                val row = rows[r]
                val focusIndex = (sessionCardIndex[row.key] ?: 0).coerceIn(0, row.channels.lastIndex)
                Column {
                    Text(
                        row.title,
                        color = palette.onSurface,
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        modifier = Modifier.padding(start = 14.dp, bottom = 2.dp),
                    )
                    LazyRow(
                        state = rememberLazyListState(max(0, focusIndex - 1)),
                        horizontalArrangement = Arrangement.spacedBy(18.dp),
                        contentPadding = PaddingValues(start = 14.dp, end = 40.dp, top = 10.dp, bottom = 10.dp),
                    ) {
                        itemsIndexed(row.channels, key = { _, c -> c.id }) { i, channel ->
                            val here = focusedKey == row.key to channel.id
                            BrowseCard(
                                channel = channel,
                                width = cardWidth,
                                favorite = channel.id in favorites,
                                stream = stream.takeIf { here && previewId == channel.id },
                                showing = here && showing,
                                modifier = if (i == focusIndex) Modifier.focusRequester(rowRequester(row.key)) else Modifier,
                                onFocused = {
                                    focusedKey = row.key to channel.id
                                    sessionRowKey = row.key
                                    sessionCardIndex[row.key] = i
                                },
                                onClick = { open(channel) },
                            )
                        }
                    }
                }
            }
        }

        // The rail: icons only, opening out with their names while the cursor is on it.
        var railFocused by remember { mutableStateOf(false) }
        val railWidth by animateDpAsState(if (railFocused) 210.dp else railCollapsed, label = "rail")
        Column(
            Modifier
                .fillMaxHeight()
                .width(railWidth)
                .background(
                    if (railFocused) {
                        Brush.horizontalGradient(listOf(palette.homeTop, palette.homeTop.copy(alpha = 0.92f)))
                    } else {
                        Brush.horizontalGradient(listOf(palette.homeTop.copy(alpha = 0.85f), Color.Transparent))
                    },
                )
                .onFocusChanged { railFocused = it.hasFocus; onRailFocused(it.hasFocus) }
                .padding(vertical = 24.dp, horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically),
        ) {
            // Only while that row is on screen (an unattached requester can't take the cursor).
            val backKey = focusedKey?.first ?: rows.firstOrNull()?.key
            val back = backKey?.takeIf { k -> listState.layoutInfo.visibleItemsInfo.any { it.key == k } }?.let { rowRequester(it) }
            RailItem(Icons.Filled.Search, "Search", railFocused, right = back) {
                searchOpen = true
                scope.launch { listState.animateScrollToItem(0) }
            }
            RailItem(Icons.Filled.Home, "Home", railFocused, right = back) { rows.firstOrNull()?.let { focusRow(it.key) } }
            RailItem(Icons.Filled.Star, "Favorites", railFocused, right = back) {
                if (rows.any { it.key == "favorites" }) focusRow("favorites")
                else android.widget.Toast.makeText(context, "No favorites yet. Hold OK on a channel in 1+List to add one.", android.widget.Toast.LENGTH_LONG).show()
            }
            if (onOpenGames != null) RailItem(Icons.Filled.SportsEsports, "Games", railFocused, right = back, onClick = onOpenGames)
            RailItem(Icons.Filled.Tv, "$modeLabel Mode", railFocused, Modifier.focusRequester(modeFocus), right = back, onClick = onNextMode)
            RailItem(Icons.Filled.Settings, "Settings", railFocused, right = back, onClick = onOpenSettings)
        }
    }
}

@Composable
private fun RailItem(
    icon: ImageVector,
    label: String,
    expanded: Boolean,
    modifier: Modifier = Modifier,
    /** Where Right goes: the card the cursor was on. */
    right: FocusRequester? = null,
    onClick: () -> Unit,
) {
    Row(
        modifier
            .focusProperties { if (right != null) this.right = right }
            .fillMaxWidth()
            .height(44.dp)
            .focusGlow(RoundedCornerShape(22.dp))
            .clip(RoundedCornerShape(22.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = label, tint = Themes.current.onSurface, modifier = Modifier.size(24.dp))
        if (expanded) {
            Spacer(Modifier.width(14.dp))
            Text(label, color = Themes.current.onSurface, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Clip)
        }
    }
}

/** A big 16:9 card: the logo (or the live picture once it starts), with the name and details under it. */
@Composable
private fun BrowseCard(
    channel: Channel,
    width: androidx.compose.ui.unit.Dp,
    favorite: Boolean,
    stream: StreamPlayer?,
    showing: Boolean,
    modifier: Modifier,
    onFocused: () -> Unit,
    onClick: () -> Unit,
) {
    val palette = Themes.current
    var focused by remember { mutableStateOf(false) }
    Column(Modifier.width(width)) {
        Box(
            modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .onFocusChanged {
                    focused = it.hasFocus
                    if (it.hasFocus) onFocused()
                }
                .focusGlow(CardShape)
                .clip(CardShape)
                .background(Brush.linearGradient(listOf(palette.surfaceVariant, palette.surface)))
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            if (channel.logo != null) {
                SubcomposeAsyncImage(
                    model = channel.logo,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize().padding(horizontal = 40.dp, vertical = 24.dp),
                    error = { Initials(channel.name) },
                    loading = { Initials(channel.name) },
                )
            } else {
                Initials(channel.name)
            }
            if (stream != null) {
                AndroidView(
                    factory = { ctx -> TextureView(ctx).also { stream.player.setVideoTextureView(it) } },
                    onRelease = { stream.player.clearVideoTextureView(it) },
                    modifier = Modifier
                        .fillMaxSize()
                        .background(if (showing) Color.Black else Color.Transparent)
                        .graphicsLayer { alpha = if (showing) 1f else 0f },
                )
            }
            Text(
                "LIVE",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(8.dp)
                    .background(Color(0xFFE53935), RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 1.dp),
            )
            if (channel.number > 0) {
                Text(
                    "${channel.number}",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(8.dp)
                        .background(Color.Black.copy(alpha = 0.7f), RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 1.dp),
                )
            }
            if (favorite) {
                Icon(
                    Icons.Filled.Star,
                    contentDescription = null,
                    tint = palette.secondary,
                    modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).size(20.dp),
                )
            }
        }
        Text(
            channel.name,
            color = if (focused) palette.onSurface else palette.onSurface.copy(alpha = 0.85f),
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 10.dp, start = 2.dp),
        )
        val details = listOfNotNull(channel.group, channel.category, channel.language).distinct().joinToString(" · ")
        if (details.isNotEmpty()) {
            Text(
                details,
                color = palette.onSurfaceVariant,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 2.dp),
            )
        }
    }
}

private fun metered(context: Context): Boolean =
    (context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager)?.isActiveNetworkMetered ?: true
