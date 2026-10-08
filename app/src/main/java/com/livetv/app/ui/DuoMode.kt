package com.livetv.app.ui

import androidx.compose.runtime.key
import com.livetv.app.BuildConfig
import com.livetv.app.data.MyChannel
import android.content.Context
import android.view.TextureView
import android.widget.Toast
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import coil3.compose.SubcomposeAsyncImage
import com.livetv.app.Edition
import com.livetv.app.data.Channel
import com.livetv.app.data.YouTube
import com.livetv.app.player.StreamPlayer
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/** One row of cards under the two players: Favorites or a country. */
private class DuoRow(val key: String, val title: String, val channels: List<Channel>)

/** Where the remote's cursor is: the Modes button, one of the two players, or the cards. */
private enum class DuoAt { Modes, Players, Cards }

/** Where the cursor was, kept while a channel plays full screen. */
private var sessionDuoAt = DuoAt.Cards
private var sessionDuoPlayer = 0
private var sessionDuoRow: String? = null
private val sessionDuoCard = mutableStateMapOf<String, Int>()

private const val PREFS = "duo"
private const val K_LEFT = "left"
private const val K_RIGHT = "right"
/** Which player the next card goes into (0 left, 1 right). */
private const val K_NEXT = "next"
/** The countries whose rows come first, in this order (after Favorites and All channels). */
private val COUNTRY_ORDER = listOf("pk", "in", "ca", "us")

private val Yellow = Color(0xFFFFD54F)
private val PlayerShape = RoundedCornerShape(22.dp)

/**
 * "Duo" mode, like the Google TV home screen: a top bar with the Modes button and the clock, two
 * big rounded players side by side that keep playing (both silent), and rows of channel cards
 * underneath like Browse. OK on a card puts the channel into one of the two players, taking turns
 * (the one marked "Next" is the one that changed least recently). Up from the first row goes to
 * the players, Left and Right pick one, and OK there opens it full screen with sound; Back from
 * full screen comes back here. Both players play at low quality so a Chromecast stays smooth.
 */
@Composable
internal fun DuoMode(
    /** Every channel, already limited to the languages chosen in Settings. */
    channels: List<Channel>,
    favorites: Set<String>,
    lastWatchedId: String?,
    playing: Boolean,
    focus: FocusRequester,
    onOpen: (Channel) -> Unit,
    onToggleFavorite: (Channel) -> Unit,
    onModes: () -> Unit,
    /** Back on the Modes button: shows the app's top bar. */
    onBack: () -> Unit,
    /** Duo has the remote's cursor again (the top bar hides). */
    onFocused: () -> Unit,
) {
    val context = LocalContext.current
    val palette = Themes.current
    val prefs = remember { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    val byId = remember(channels) { channels.associateBy { it.id } }

    // Favorites, then every channel (our own first), then the countries: Pakistan, India, Canada and the
    // US first, then all the others in list order (owner's order, 1.9.61). Rows scroll through every channel.
    val rows = remember(channels, favorites) {
        buildList {
            val favs = channels.filter { it.id in favorites }
            if (favs.isNotEmpty()) add(DuoRow("favorites", "Favorites", favs))
            if (channels.isNotEmpty()) add(DuoRow("all", "All channels", channels))
            val byGroup = channels.filter { it.group != null }.groupBy { it.group!! }
                    byGroup.entries
                .sortedBy { (_, list) -> COUNTRY_ORDER.indexOf(list.first().country?.lowercase()).let { if (it < 0) Int.MAX_VALUE else it } }
                .forEach { (group, list) -> add(DuoRow("group:$group", group, list)) }
        }
    }

    // The two players' channels, saved so they're still there the next time.
    var ids by remember {
        mutableStateOf(listOf(prefs.getString(K_LEFT, null), prefs.getString(K_RIGHT, null)))
    }
    var nextPlayer by remember { mutableIntStateOf(prefs.getInt(K_NEXT, 0).coerceIn(0, 1)) }
    fun setPlayer(i: Int, id: String) {
        ids = ids.toMutableList().also { it[i] = id }
        nextPlayer = 1 - i
        prefs.edit().putString(if (i == 0) K_LEFT else K_RIGHT, id).putInt(K_NEXT, nextPlayer).apply()
    }
    LaunchedEffect(channels.isNotEmpty()) {
        if (channels.isEmpty()) return@LaunchedEffect
        // First time (or a saved channel is gone): the last channel watched and the next favourite.
        // Our own channels come last here: their pages take a while to start (owner, 1.10.23).
        val quickFirst = channels.sortedBy { MyChannel.isMine(it) }
        val pool = (listOfNotNull(lastWatchedId) + quickFirst.filter { it.id in favorites }.map { it.id } + quickFirst.map { it.id })
            .filter { it in byId }.distinct()
        val left = ids[0]?.takeIf { it in byId } ?: pool.firstOrNull { it != ids[1] }
        val right = ids[1]?.takeIf { it in byId } ?: pool.firstOrNull { it != left }
        ids = listOf(left, right)
    }
    val players = ids.map { id -> id?.let { byId[it] } }

    var at by remember { mutableStateOf(sessionDuoAt) }
    var playerAt by remember { mutableIntStateOf(sessionDuoPlayer) }
    var rowKey by remember { mutableStateOf(sessionDuoRow) }
    val rowAt = rows.indexOfFirst { it.key == rowKey }.let { if (it < 0) 0 else it }
    val row = rows.getOrNull(rowAt)
    val cardAt = row?.let { (sessionDuoCard[it.key] ?: 0).coerceIn(0, (it.channels.size - 1).coerceAtLeast(0)) } ?: 0
    LaunchedEffect(at, playerAt, rowKey) {
        sessionDuoAt = at
        sessionDuoPlayer = playerAt
        sessionDuoRow = rowKey
    }
    fun moveCard(to: Int) {
        val r = row ?: return
        sessionDuoCard[r.key] = to.coerceIn(0, (r.channels.size - 1).coerceAtLeast(0))
    }
    fun moveRow(to: Int) {
        val r = rows.getOrNull(to.coerceIn(0, (rows.size - 1).coerceAtLeast(0))) ?: return
        rowKey = r.key
    }

    // Holding OK on a card, or a long press on it: adds the channel to Favorites (or takes it off).
    fun toggleFavorite(channel: Channel) {
        val adding = channel.id !in favorites
        onToggleFavorite(channel)
        Toast.makeText(
            context,
            if (adding) "${channel.name} added to Favorites" else "${channel.name} removed from Favorites",
            Toast.LENGTH_SHORT,
        ).show()
    }
    // OK on a card: the channel goes into the player marked "Next".
    fun playCard(channel: Channel) {
        val already = ids.indexOf(channel.id)
        if (already >= 0) {
            // Already in a player: nothing to swap, just show it.
            Toast.makeText(context, "${channel.name} is already playing", Toast.LENGTH_SHORT).show()
        } else {
            setPlayer(nextPlayer, channel.id)
        }
    }
    // A tap on a card or a player moves the cursor there (then does what OK does).
    fun pointAtCard(r: DuoRow, ci: Int) {
        at = DuoAt.Cards
        rowKey = r.key
        sessionDuoCard[r.key] = ci
    }
    fun pointAtPlayer(i: Int) {
        at = DuoAt.Players
        playerAt = i
    }

    // The two players: silent, low quality, and the right one starts a moment after the left.
    val streams = remember {
        List(2) {
            StreamPlayer(context, preview = true).apply {
                player.volume = 0f
                player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
                    .setMaxVideoSize(640, 360).setMaxVideoBitrate(900_000).setMaxVideoFrameRate(30).build()
            }
        }
    }
    val views = remember { List(2) { ViewHolder() } }
    val showing = remember { mutableStateMapOf<Int, Boolean>() }
    val shownIds = remember { mutableStateMapOf<Int, String>() }
    DisposableEffect(Unit) {
        val listeners = List(2) { i ->
            object : Player.Listener {
                override fun onRenderedFirstFrame() {
                    showing[i] = true
                }
            }.also { streams[i].player.addListener(it) }
        }
        onDispose {
            streams.forEachIndexed { i, s ->
                s.player.removeListener(listeners[i])
                s.release()
            }
        }
    }
    // Our YouTube channels and Bazaar Hits play their own page, silent like the other players (1.9.60),
    // not their backup films.
    val pageFailed = remember { mutableStateMapOf<String, Boolean>() }
    val pages = (0..1).map { i ->
        players[i]?.takeIf { playing && pageFailed[it.id] != true }
            ?.let { MyChannel.pageFor(it, BuildConfig.VERSION_CODE) }?.let { "$it&mute=1" }
    }
    for (i in 0..1) {
        LaunchedEffect(players[i]?.id, playing, pages[i]) {
            // The channel going away keeps its last frame as its card's picture.
            shownIds[i]?.let { if (showing[i] == true) keepPicture(it, views[i].picture()) }
            streams[i].stop()
            showing[i] = false
            shownIds.remove(i)
            val channel = players[i] ?: return@LaunchedEffect
            if (!playing) return@LaunchedEffect
            if (i == 1) delay(1_200)
            shownIds[i] = channel.id
            if (pages[i] == null) streams[i].play(channel)
        }
    }

    // The cards' pictures: saved ones load from the device; for the rest a third, silent player
    // opens the cards near the cursor in turn and keeps a frame (Wi-Fi or Ethernet only).
    val rowStates = remember { mutableMapOf<String, LazyListState>() }
    fun stateOf(key: String) = rowStates.getOrPut(key) { LazyListState(((sessionDuoCard[key] ?: 0) - 1).coerceAtLeast(0)) }
    val nearby = remember(rows, rowAt, cardAt) {
        val here = row?.channels.orEmpty().let { list ->
            listOf(0, 1, -1, 2, -2, 3, -3, 4, 5, 6).mapNotNull { list.getOrNull(cardAt + it) }
        }
        val around = listOf(rowAt + 1, rowAt - 1, rowAt + 2).mapNotNull { rows.getOrNull(it) }.flatMap { r ->
            val start = (sessionDuoCard[r.key] ?: 0) - 1
            (start until start + 7).mapNotNull { r.channels.getOrNull(it) }
        }
        (here + around).distinctBy { it.id }
    }
    LaunchedEffect(nearby) { nearby.forEach { showSavedPicture(it.id) } }
    var movedAt by remember { mutableLongStateOf(0L) }
    LaunchedEffect(at, playerAt, rowKey, cardAt) { movedAt = System.currentTimeMillis() }
    val grabber = remember {
        StreamPlayer(context, preview = true).apply {
            player.volume = 0f
            player.trackSelectionParameters = player.trackSelectionParameters.buildUpon().setMaxVideoSize(426, 240).build()
        }
    }
    val grabView = remember { ViewHolder() }
    var grabShowing by remember { mutableStateOf(false) }
    DisposableEffect(grabber) {
        val listener = object : Player.Listener {
            override fun onRenderedFirstFrame() {
                grabShowing = true
            }
        }
        grabber.player.addListener(listener)
        onDispose {
            grabber.player.removeListener(listener)
            grabber.release()
        }
    }
    val wanted by rememberUpdatedState(nearby.filter { it.id !in shownIds.values })
    LaunchedEffect(playing) {
        if (!playing) return@LaunchedEffect
        delay(4_000) // let the two players start first
        while (true) {
            if (metered(context)) {
                delay(10_000)
                continue
            }
            val still = System.currentTimeMillis() - movedAt
            if (still < 1_000) {
                delay(1_000 - still)
                continue
            }
            val now = System.currentTimeMillis()
            val channel = wanted.firstOrNull { now - (browsePictureAt[it.id] ?: 0L) > PICTURE_FRESH_MS }
            if (channel == null || YouTube.isYouTube(channel.url) || MyChannel.pageFor(channel, BuildConfig.VERSION_CODE) != null) {
                if (channel != null) browsePictureAt[channel.id] = now
                delay(1_000)
                continue
            }
            grabShowing = false
            val startedAt = movedAt
            var interrupted = false
            try {
                grabber.play(channel)
                withTimeoutOrNull(10_000) { snapshotFlow { grabShowing || movedAt != startedAt }.first { it } }
                if (grabShowing && movedAt == startedAt) delay(400)
                if (grabShowing && movedAt == startedAt) keepPicture(channel.id, grabView.picture())
                interrupted = movedAt != startedAt
            } finally {
                grabber.stop()
                grabShowing = false
            }
            if (!interrupted) browsePictureAt[channel.id] = System.currentTimeMillis()
            delay(400)
        }
    }

    // The highlighted row sits at the top of the cards, and its highlighted card stays in view.
    val columnState = rememberLazyListState(rowAt)
    LaunchedEffect(rowKey, rows.size) { if (rows.isNotEmpty()) columnState.animateScrollToItem(rowAt) }
    LaunchedEffect(rowKey, cardAt) {
        row?.let { stateOf(it.key).animateScrollToItem((cardAt - 1).coerceAtLeast(0)) }
    }

    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    val isPhone = rememberIsPhone()
    var held by remember { mutableStateOf(false) }

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(palette.homeTop, palette.homeBottom)))
            .focusRequester(focus)
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onPreviewKeyEvent { e ->
                when {
                    e.key == Key.Back -> {
                        if (e.type == KeyEventType.KeyUp) {
                            if (at == DuoAt.Modes) onBack() else at = DuoAt.Modes
                        }
                        true
                    }
                    e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter -> {
                        if (e.type == KeyEventType.KeyDown) {
                            // Held down on a card: adds the channel to Favorites (or takes it off).
                            if (at == DuoAt.Cards && e.nativeKeyEvent.repeatCount >= 6 && !held) {
                                held = true
                                row?.channels?.getOrNull(cardAt)?.let { toggleFavorite(it) }
                            }
                        } else if (e.type == KeyEventType.KeyUp) {
                            if (!held) {
                                when (at) {
                                    DuoAt.Modes -> onModes()
                                    DuoAt.Players -> players[playerAt]?.let(onOpen)
                                    DuoAt.Cards -> row?.channels?.getOrNull(cardAt)?.let { playCard(it) }
                                }
                            }
                            held = false
                        }
                        true
                    }
                    e.type != KeyEventType.KeyDown -> false
                    e.key == Key.DirectionLeft -> {
                        when (at) {
                            DuoAt.Players -> playerAt = 0
                            DuoAt.Cards -> moveCard(cardAt - 1)
                            DuoAt.Modes -> {}
                        }
                        true
                    }
                    e.key == Key.DirectionRight -> {
                        when (at) {
                            DuoAt.Players -> playerAt = 1
                            DuoAt.Cards -> moveCard(cardAt + 1)
                            DuoAt.Modes -> {}
                        }
                        true
                    }
                    e.key == Key.DirectionUp -> {
                        when {
                            at == DuoAt.Players -> at = DuoAt.Modes
                            at == DuoAt.Cards && rowAt == 0 -> at = DuoAt.Players
                            at == DuoAt.Cards -> moveRow(rowAt - 1)
                        }
                        true
                    }
                    e.key == Key.DirectionDown -> {
                        when (at) {
                            DuoAt.Modes -> at = DuoAt.Players
                            DuoAt.Players -> if (rows.isNotEmpty()) {
                                at = DuoAt.Cards
                                moveRow(0)
                            }
                            DuoAt.Cards -> moveRow(rowAt + 1)
                        }
                        true
                    }
                    e.key == Key.ChannelUp -> { at = DuoAt.Cards; moveRow(rowAt - 1); true }
                    e.key == Key.ChannelDown -> { at = DuoAt.Cards; moveRow(rowAt + 1); true }
                    else -> false
                }
            }
            .focusable(),
    ) {
        val side = 32.dp
        val gap = 20.dp
        val barHeight = 54.dp
        // Two 16:9 players side by side, at most 45% of the screen's height.
        val fullWidth = (maxWidth - side * 2 - gap) / 2
        val playerHeight = minOf(fullWidth * 9f / 16f, maxHeight * 0.45f)
        val playerWidth = playerHeight * 16f / 9f
        val cardHeight = maxHeight * 0.19f
        val cardWidth = cardHeight * 16f / 9f

        Column(Modifier.fillMaxSize()) {
            // The top bar: Modes, the clock and the weather.
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(barHeight)
                    .padding(horizontal = side),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val modesFocused = at == DuoAt.Modes
                // Just the Modes icon and word, plain; a yellow highlight when the remote is on it.
                Row(
                    Modifier
                        .clip(RoundedCornerShape(50))
                        .tap {
                            at = DuoAt.Modes
                            onModes()
                        }
                        .background(if (modesFocused) Yellow else Color.Transparent)
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val ink = if (modesFocused) Color.Black else Color.White.copy(alpha = 0.85f)
                    Icon(Icons.Filled.Dashboard, contentDescription = null, tint = ink, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Modes", color = ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                }
                Spacer(Modifier.weight(1f))
                Clock()
                if (Edition.HAS_WEATHER) {
                    Spacer(Modifier.width(12.dp))
                    WeatherNow()
                }
                Spacer(Modifier.width(12.dp))
                Text("Cable TV", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            }

            // The two players.
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = side),
                horizontalArrangement = Arrangement.spacedBy(gap, Alignment.CenterHorizontally),
            ) {
                for (i in 0..1) {
                    DuoPlayer(
                        channel = players[i],
                        width = playerWidth,
                        height = playerHeight,
                        focused = at == DuoAt.Players && playerAt == i,
                        next = at == DuoAt.Cards && nextPlayer == i,
                        favorite = players[i]?.id in favorites,
                        showVideo = shownIds[i] != null && shownIds[i] == players[i]?.id,
                        showing = showing[i] == true,
                        page = pages[i],
                        onPageFailed = { players[i]?.let { c -> if (MyChannel.webPage(c) != null) pageFailed[c.id] = true } },
                        attach = { view -> views[i].view = view; streams[i].player.setVideoTextureView(view) },
                        detach = { view ->
                            if (views[i].view === view) views[i].view = null
                            streams[i].player.clearVideoTextureView(view)
                        },
                        onTap = {
                            pointAtPlayer(i)
                            players[i]?.let(onOpen)
                        },
                    )
                }
            }

            // The rows of channel cards.
            if (rows.isEmpty()) {
                Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    Text("Loading channels…", color = palette.onSurfaceVariant)
                }
            } else {
                LazyColumn(
                    state = columnState,
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    contentPadding = PaddingValues(top = 10.dp, bottom = 60.dp),
                    // On a phone the finger scrolls the rows; on a TV only the remote's cursor moves them.
                    userScrollEnabled = isPhone,
                ) {
                    itemsIndexed(rows, key = { _, r -> r.key }) { ri, r ->
                        val focusedRow = at == DuoAt.Cards && ri == rowAt
                        val card = (sessionDuoCard[r.key] ?: 0)
                        Column(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
                            Text(
                                "${r.title}  ·  ${r.channels.size}",
                                color = if (focusedRow) Color.White else Color.White.copy(alpha = 0.75f),
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp,
                                modifier = Modifier.padding(start = side, bottom = 4.dp),
                            )
                            LazyRow(
                                state = stateOf(r.key),
                                contentPadding = PaddingValues(horizontal = side, vertical = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(18.dp),
                                userScrollEnabled = isPhone,
                            ) {
                                itemsIndexed(r.channels, key = { _, c -> c.id }) { ci, channel ->
                                    DuoCard(
                                        channel = channel,
                                        width = cardWidth,
                                        height = cardHeight,
                                        focused = focusedRow && ci == card,
                                        playingIn = ids.indexOf(channel.id),
                                        favorite = channel.id in favorites,
                                        onTap = {
                                            pointAtCard(r, ci)
                                            playCard(channel)
                                        },
                                        onLongPress = {
                                            pointAtCard(r, ci)
                                            toggleFavorite(channel)
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        // The silent player taking the cards' pictures draws here, out of sight.
        val density = LocalDensity.current
        AndroidView(
            factory = { ctx -> TextureView(ctx).also { grabView.view = it; grabber.player.setVideoTextureView(it) } },
            onRelease = {
                if (grabView.view === it) grabView.view = null
                grabber.player.clearVideoTextureView(it)
            },
            modifier = Modifier
                .size(with(density) { 320.toDp() }, with(density) { 180.toDp() })
                .graphicsLayer { alpha = 0.01f },
        )
    }
}

/** One of the two big rounded players, with the channel's name over the bottom of the picture. */
@Composable
private fun DuoPlayer(
    channel: Channel?,
    width: Dp,
    height: Dp,
    focused: Boolean,
    /** The next card chosen goes into this player. */
    next: Boolean,
    favorite: Boolean,
    showVideo: Boolean,
    showing: Boolean,
    /** Our YouTube page for the channel, when it plays that way. */
    page: String?,
    onPageFailed: () -> Unit,
    attach: (TextureView) -> Unit,
    detach: (TextureView) -> Unit,
    /** A tap: opens the channel full screen. */
    onTap: () -> Unit,
) {
    val palette = Themes.current
    val scale by animateFloatAsState(if (focused) 1.03f else 1f, label = "scale")
    Box(
        Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .size(width, height)
            .then(if (focused) Modifier.border(BorderStroke(4.dp, Yellow), PlayerShape) else Modifier)
            .padding(if (focused) 4.dp else 0.dp)
            .clip(PlayerShape)
            .background(Brush.linearGradient(listOf(palette.surfaceVariant, palette.surface))),
    ) {
        if (channel == null) {
            Text("Choose a channel below", color = Color.White.copy(alpha = 0.8f), modifier = Modifier.align(Alignment.Center))
            Box(Modifier.matchParentSize().tap(onTap = onTap))
            return@Box
        }
        // A player that is starting shows a loading circle, not the channel's logo (owner, 2026-10-07).
        val starting = page != null || showVideo
        if (starting) {
            // drawn over the still picture below
        } else if (channel.logo != null) {
            SubcomposeAsyncImage(
                model = channel.logo,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize().padding(48.dp),
                error = { Initials(channel.name) },
                loading = { Initials(channel.name) },
            )
        } else {
            Initials(channel.name)
        }
        browsePictures[channel.id]?.let {
            Image(it, contentDescription = null, contentScale = ContentScale.FillBounds, modifier = Modifier.fillMaxSize())
        }
        if (page != null || (showVideo && !showing)) LoadingSpinner()
        if (page != null) {
            key(page) { WebPreview(page, Modifier.fillMaxSize(), still = false, onFallback = onPageFailed) }
        } else if (showVideo) {
            AndroidView(
                factory = { ctx -> TextureView(ctx).also(attach) },
                onRelease = detach,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer { alpha = if (showing) 1f else 0f },
            )
        }
        // Along the bottom: the number, the name and what the channel is.
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.8f))))
                .padding(start = 20.dp, end = 20.dp, top = 30.dp, bottom = 12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (channel.number > 0) {
                    Text("${channel.number}", color = Yellow, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                    Spacer(Modifier.width(10.dp))
                }
                Text(
                    channel.name,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 24.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (favorite) {
                    Spacer(Modifier.width(8.dp))
                    Icon(Icons.Filled.Star, contentDescription = "Favorite", tint = Yellow, modifier = Modifier.size(22.dp))
                }
            }
            val details = listOfNotNull(channel.group, channel.category, channel.language).distinct().joinToString(" · ")
            if (details.isNotEmpty()) {
                Text(details, color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        // Top corners: sound off, and what OK does or where the next card goes.
        Icon(
            Icons.Filled.VolumeOff,
            contentDescription = "Sound off",
            tint = Color.White,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(12.dp)
                .clip(RoundedCornerShape(50))
                .background(Color.Black.copy(alpha = 0.5f))
                .padding(5.dp)
                .size(16.dp),
        )
        val tag = when {
            focused -> "OK: full screen with sound"
            next -> "Next channel plays here"
            else -> null
        }
        if (tag != null) {
            Text(
                tag,
                color = Color.Black,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(12.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Yellow)
                    .padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }
        // Over the picture, so the web pages don't take the tap.
        Box(Modifier.matchParentSize().tap(onTap = onTap))
    }
}

/** One channel card: its picture (or logo), with the number and name along the bottom. */
@Composable
private fun DuoCard(
    channel: Channel,
    width: Dp,
    height: Dp,
    focused: Boolean,
    playingIn: Int,
    favorite: Boolean,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
) {
    val palette = Themes.current
    val scale by animateFloatAsState(if (focused) 1.1f else 1f, label = "scale")
    Box(
        Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .tap(onLongPress = onLongPress, onTap = onTap)
            .size(width, height)
            .then(if (focused) Modifier.border(BorderStroke(3.dp, Yellow), CardShape) else Modifier)
            .padding(if (focused) 3.dp else 0.dp)
            .clip(CardShape)
            .background(Brush.linearGradient(listOf(palette.surfaceVariant, palette.surface))),
        contentAlignment = Alignment.Center,
    ) {
        if (channel.logo != null) {
            SubcomposeAsyncImage(
                model = channel.logo,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp, vertical = 16.dp),
                error = { Initials(channel.name) },
                loading = { Initials(channel.name) },
            )
        } else {
            Initials(channel.name)
        }
        browsePictures[channel.id]?.let {
            Image(it, contentDescription = null, contentScale = ContentScale.FillBounds, modifier = Modifier.fillMaxSize())
        }
        Row(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f))))
                .padding(start = 8.dp, end = 8.dp, top = 12.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (channel.number > 0) {
                Text("${channel.number}", color = Yellow, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1)
                Spacer(Modifier.width(5.dp))
            }
            Text(
                channel.name,
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        if (playingIn >= 0) {
            Text(
                if (playingIn == 0) "Left" else "Right",
                color = Color.Black,
                fontWeight = FontWeight.Bold,
                fontSize = 10.sp,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(5.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Yellow)
                    .padding(horizontal = 6.dp, vertical = 1.dp),
            )
        }
        if (favorite) {
            Icon(
                Icons.Filled.Star,
                contentDescription = "Favorite",
                tint = Yellow,
                modifier = Modifier.align(Alignment.TopEnd).padding(5.dp).size(14.dp),
            )
        }
    }
}
