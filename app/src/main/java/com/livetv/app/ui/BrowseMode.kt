package com.livetv.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.ConnectivityManager
import android.view.TextureView
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.Image
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
import com.livetv.app.data.Guide
import com.livetv.app.data.Vod
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.livetv.app.data.YouTube
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.livetv.app.player.StreamPlayer
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.max

/** One row of cards on the Browse screen: live channels, or (Live TV Max) movies and shows. */
private class BrowseRow(
    val key: String,
    val title: String,
    val channels: List<Channel> = emptyList(),
    val videos: List<VideoCard> = emptyList(),
) {
    val size: Int get() = if (videos.isNotEmpty()) videos.size else channels.size
}

/** A movie, or a drama or show with its episodes, on Live TV Max's home screen. */
private class VideoCard(val id: String, val title: String, val subtitle: String, val image: String?, val target: VodTarget)

/** Where the Browse screen was (row, card and scroll), kept while a channel plays full screen. */
private var sessionRowKey: String? = null
private val sessionCardIndex = mutableStateMapOf<String, Int>()
private var sessionListIndex = 0
private var sessionListOffset = 0

/**
 * Still pictures of what each channel was showing, so the cards that aren't highlighted show the
 * channel instead of its logo. Taken for every channel while Browse is open and the cursor rests,
 * and saved on the device so they're already there the next time the app opens.
 */
internal val browsePictures = mutableStateMapOf<String, ImageBitmap>()
internal val browsePictureAt = mutableMapOf<String, Long>()
/** A card's picture is taken again once it's this old and the card is on screen. */
internal const val PICTURE_FRESH_MS = 5 * 60_000L
/** Cards that aren't on screen are refreshed less often. */
private const val PICTURE_FRESH_OFF_SCREEN_MS = 30 * 60_000L
/** Pictures kept in memory (about 115 KB each); the rest load from the device when shown. */
private const val MAX_PICTURES = 300
/** Pictures kept on the device. */
private const val MAX_SAVED_PICTURES = 1500
private const val PICTURE_W = 320
private const val PICTURE_H = 180

/** A silent player that takes the cards' pictures, the view it draws into, and whether a frame is in. */
private class Grabber(val stream: StreamPlayer) {
    val view = ViewHolder()
    var showing by mutableStateOf(false)
}

/** The TextureView a player is drawing into, so its frame can be kept as a picture. */
internal class ViewHolder { var view: TextureView? = null }

/** The frame on [holder]'s view, small enough to keep many (16:9). */
internal fun ViewHolder.picture(): ImageBitmap? = runCatching {
    view?.getBitmap(PICTURE_W, PICTURE_H)?.let { full ->
        full.copy(Bitmap.Config.RGB_565, false).also { full.recycle() }.asImageBitmap()
    }
}.getOrNull()

private var pictureDir: File? = null
private val pictureDisk = Executors.newSingleThreadExecutor()
private fun pictureFile(id: String): File? =
    pictureDir?.let { File(it, UUID.nameUUIDFromBytes(id.toByteArray()).toString() + ".jpg") }

/** Sets up the folder the pictures are saved in, and trims it when it holds too many. */
internal fun initPictures(context: Context) {
    if (pictureDir != null) return
    val dir = File(context.cacheDir, "browse_pictures").apply { mkdirs() }
    pictureDir = dir
    pictureDisk.execute {
        val files = dir.listFiles().orEmpty()
        if (files.size > MAX_SAVED_PICTURES) {
            files.sortedBy { it.lastModified() }.take(files.size - MAX_SAVED_PICTURES).forEach { it.delete() }
        }
    }
}

/** When [id]'s picture was taken, here or on an earlier run (0 if never). */
private fun pictureTakenAt(id: String): Long =
    browsePictureAt[id] ?: (pictureFile(id)?.lastModified() ?: 0L).also { if (it > 0) browsePictureAt[id] = it }

/** The picture saved on the device for [id], if any (read off the main thread). */
internal suspend fun loadSavedPicture(id: String): ImageBitmap? = withContext(Dispatchers.IO) {
    runCatching {
        pictureFile(id)?.takeIf { it.exists() }?.let { f ->
            BitmapFactory.decodeFile(f.path, BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.RGB_565 })
                ?.asImageBitmap()
        }
    }.getOrNull()
}

private fun rememberInMemory(id: String, picture: ImageBitmap) {
    if (id !in browsePictures && browsePictures.size >= MAX_PICTURES) {
        // Forget the oldest ones; they're still saved on the device.
        browsePictures.keys.sortedBy { browsePictureAt[it] ?: 0L }.take(MAX_PICTURES / 5).forEach { browsePictures.remove(it) }
    }
    browsePictures[id] = picture
}

internal fun keepPicture(id: String, picture: ImageBitmap?) {
    if (picture == null) return
    rememberInMemory(id, picture)
    browsePictureAt[id] = System.currentTimeMillis()
    val file = pictureFile(id) ?: return
    val bitmap = picture.asAndroidBitmap()
    pictureDisk.execute {
        runCatching {
            val temp = File(file.path + ".tmp")
            temp.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 75, it) }
            temp.renameTo(file)
        }
    }
}

/** Shows [id]'s saved picture when its card comes on screen without one in memory. */
internal suspend fun showSavedPicture(id: String) {
    if (id in browsePictures) return
    val picture = loadSavedPicture(id) ?: return
    if (id !in browsePictures) rememberInMemory(id, picture)
}

private const val PREFS = "browse"
private const val K_RECENT = "recent"
private const val K_RECENT_VIDEOS = "recent_videos"
private const val MAX_RECENT_VIDEOS = 20
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
    /** Null on phones, which have no other layout. */
    onNextMode: (() -> Unit)?,
    onOpen: (Channel) -> Unit,
    onOpenGames: (() -> Unit)?,
    /** Live TV Max: opens a movie or show in the Library. */
    onOpenVodItem: ((VodTarget) -> Unit)?,
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

    // Live TV Max: movies and shows opened from here, newest first ("language|section|show|name|url|logo").
    var recentVideos by remember {
        mutableStateOf(prefs.getString(K_RECENT_VIDEOS, null)?.split('\n')?.filter { it.isNotBlank() }.orEmpty())
    }
    fun openVideo(card: VideoCard) {
        val t = card.target
        val line = listOf(t.language.name, t.section.name, t.show.orEmpty(), t.play?.name.orEmpty(), t.play?.url.orEmpty(), card.image.orEmpty())
            .joinToString("|") { it.replace('|', ' ').replace('\n', ' ') }
        // One card per show or movie: the show's name, or the movie's address.
        fun key(l: String) = l.split('|').let { p -> p.getOrNull(2).orEmpty().ifBlank { p.getOrNull(4).orEmpty() } }
        recentVideos = (listOf(line) + recentVideos.filter { key(it) != key(line) }).take(MAX_RECENT_VIDEOS)
        prefs.edit().putString(K_RECENT_VIDEOS, recentVideos.joinToString("\n")).apply()
        onOpenVodItem?.invoke(t)
    }
    // Live TV Max: the movies and shows, and what's on now and next.
    val vodModel = viewModel<VodViewModel>()
    val vod by vodModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { if (Edition.MAX && onOpenVodItem != null) vodModel.refreshIfChanged() }
    val guide by produceState(emptyMap<String, List<Guide.Programme>>()) {
        if (!Edition.MAX) return@produceState
        while (true) {
            value = Guide.load()
            delay(60 * 60_000L)
        }
    }
    val nowSec by produceState(System.currentTimeMillis() / 1000) {
        while (true) {
            delay(30_000)
            value = System.currentTimeMillis() / 1000
        }
    }

    var searchOpen by remember { mutableStateOf(query.isNotBlank()) }
    val searchFocus = remember { FocusRequester() }
    val byId = remember(channels) { channels.associateBy { it.id } }
    val rows = remember(channels, favorites, recent, lastWatchedId, query, recentVideos, vod.shelves, guide, nowSec / 300) {
        buildList {
            val q = query.trim()
            if (q.isNotEmpty()) {
                add(BrowseRow("search", "Results for \"$q\"", channels.filter { it.name.contains(q, ignoreCase = true) }))
            }
            val watched = (recent + listOfNotNull(lastWatchedId)).distinct().mapNotNull { byId[it] }
            add(BrowseRow("recent", "Continue watching", watched))
            if (Edition.MAX && onOpenVodItem != null) add(BrowseRow("videos:recent", "Continue watching: movies and dramas", videos = recentVideoCards(recentVideos)))
            add(BrowseRow("favorites", "Favorites", channels.filter { it.id in favorites }))
            if (Edition.MAX) {
                val onNow = channels.filter { Guide.nowNext(guide, it, nowSec).first != null }
                add(BrowseRow("onnow", "On now", onNow.sortedByDescending { it.id in favorites }))
            }
            channels.mapNotNull { it.group }.distinct().forEach { group ->
                add(BrowseRow("group:$group", group, channels.filter { it.group == group }))
            }
            if (Edition.MAX) {
                // One row per language, biggest first (only when there's more than one).
                val languages = channels.mapNotNull { it.language }.filter { it != "Other" }
                    .groupingBy { it }.eachCount().entries.sortedByDescending { it.value }.take(8)
                if (languages.size > 1) languages.forEach { (language, _) ->
                    add(BrowseRow("language:$language", "$language channels", channels.filter { it.language == language }))
                }
                if (onOpenVodItem != null) videoRows(vod.shelves).forEach(::add)
            }
            channels.mapNotNull { it.category }
                .filter { it !in setOf("General", "Undefined", "Other") }
                .groupingBy { it }.eachCount().entries
                .sortedByDescending { it.value }
                .take(8)
                .forEach { (category, _) ->
                    add(BrowseRow("genre:$category", category, channels.filter { it.category == category }))
                }
        }.filter { it.size > 0 }.map { BrowseRow(it.key, it.title, it.channels.take(MAX_PER_ROW), it.videos.take(MAX_PER_ROW)) }
    }

    // One live preview at a time, on the highlighted card (Wi-Fi or Ethernet only).
    val stream = remember { StreamPlayer(context, preview = true) }
    var showing by remember { mutableStateOf(false) }
    var focusedKey by remember { mutableStateOf<Pair<String, String>?>(null) } // row key, channel id
    var previewId by remember { mutableStateOf<String?>(null) }
    // When the cursor last moved: nothing loads while it is moving (user's choice, 1.9.16).
    var movedAt by remember { mutableStateOf(0L) }
    val previewView = remember { ViewHolder() }
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
        movedAt = System.currentTimeMillis()
        // The card the cursor leaves keeps its last frame as its picture.
        previewId?.let { if (showing) keepPicture(it, previewView.picture()) }
        stream.stop()
        showing = false
        previewId = null
        val id = focusedKey?.second
        if (!playing || id == null) return@LaunchedEffect
        delay(1_000) // only once the cursor rests on a card
        if (metered(context)) return@LaunchedEffect
        val channel = byId[id] ?: return@LaunchedEffect
        previewId = id
        stream.play(channel)
    }
    LaunchedEffect(sound) { stream.player.volume = if (sound) 1f else 0f }

    // Only the highlighted card plays. Every other card shows a still picture of what's on: two
    // silent players open the channels in turn, keep a frame and close again. They start with the
    // cards around the cursor and on screen, then go through every row, so the pictures are already
    // there when the cursor gets to them (refreshed every few minutes; Wi-Fi or Ethernet only).
    val grabbers = remember {
        List(2) {
            Grabber(
                StreamPlayer(context, preview = true).apply {
                    player.volume = 0f
                    player.trackSelectionParameters = player.trackSelectionParameters.buildUpon().setMaxVideoSizeSd().build()
                },
            )
        }
    }
    val onScreen = remember { mutableStateMapOf<String, Int>() } // card id -> cards showing it
    DisposableEffect(grabbers) {
        initPictures(context)
        val listeners = grabbers.map { g ->
            object : Player.Listener {
                override fun onRenderedFirstFrame() {
                    g.showing = true
                }
            }.also { g.stream.player.addListener(it) }
        }
        onDispose {
            grabbers.forEachIndexed { i, g ->
                g.stream.player.removeListener(listeners[i])
                g.stream.release()
            }
        }
    }
    val currentById by rememberUpdatedState(byId)
    val currentFocused by rememberUpdatedState(focusedKey?.second)
    // The cards around the highlighted one (left, right, above, below) get their pictures first,
    // so the card the cursor moves to next already shows what's on.
    val currentNeighbours by rememberUpdatedState(
        focusedKey?.let { (rowKey, id) ->
            val r = rows.indexOfFirst { it.key == rowKey }
            val i = rows.getOrNull(r)?.channels?.indexOfFirst { it.id == id } ?: -1
            if (r < 0 || i < 0) emptyList()
            else buildList {
                rows[r].channels.getOrNull(i - 1)?.let { add(it.id) }
                rows[r].channels.getOrNull(i + 1)?.let { add(it.id) }
                for (other in listOf(rows.getOrNull(r - 1), rows.getOrNull(r + 1))) {
                    val list = other?.channels ?: continue
                    if (list.isEmpty()) continue
                    add(list[i.coerceAtMost(list.size - 1)].id)
                    add(list[(sessionCardIndex[other.key] ?: 0).coerceIn(0, list.size - 1)].id)
                }
            }.distinct()
        }.orEmpty(),
    )
    // Then every row, a card from each row in turn (first cards first).
    val currentAll by rememberUpdatedState(
        remember(rows) {
            val lists = rows.map { it.channels }
            buildList {
                for (i in 0 until (lists.maxOfOrNull { it.size } ?: 0)) lists.forEach { l -> l.getOrNull(i)?.let { add(it.id) } }
            }.distinct()
        },
    )
    val taking = remember { mutableSetOf<String>() }
    fun nextToTake(): String? {
        val now = System.currentTimeMillis()
        val near = (currentNeighbours + onScreen.keys.toList()).distinct()
        fun wanted(id: String, freshFor: Long) =
            id != currentFocused && id !in taking && now - pictureTakenAt(id) > freshFor
        return near.firstOrNull { wanted(it, PICTURE_FRESH_MS) }
            ?: currentAll.firstOrNull { wanted(it, PICTURE_FRESH_OFF_SCREEN_MS) }
    }
    grabbers.forEachIndexed { n, g ->
        LaunchedEffect(playing, g) {
            if (!playing) return@LaunchedEffect
            delay(1_500L + n * 300L) // let the highlighted card start first
            while (true) {
                if (metered(context)) {
                    delay(10_000)
                    continue
                }
                // Wait until the cursor has rested for a second before taking another picture.
                val still = System.currentTimeMillis() - movedAt
                if (still < 1_000) {
                    delay(1_000 - still)
                    continue
                }
                val id = nextToTake()
                val channel = id?.let { currentById[it] }
                if (id == null || channel == null || YouTube.isYouTube(channel.url)) {
                    if (id != null) browsePictureAt[id] = System.currentTimeMillis() // nothing to take; skip it for a while
                    delay(if (id == null) 2_000 else 50)
                    continue
                }
                taking += id
                g.showing = false
                val startedAt = movedAt
                var interrupted = false
                try {
                    g.stream.play(channel)
                    // The cursor moving again stops the picture straight away.
                    withTimeoutOrNull(8_000) { snapshotFlow { g.showing || movedAt != startedAt }.first { it } }
                    if (g.showing && movedAt == startedAt) {
                        delay(250)
                    }
                    if (g.showing && movedAt == startedAt) keepPicture(id, g.view.picture())
                    interrupted = movedAt != startedAt
                } finally {
                    g.stream.stop()
                    g.showing = false
                    taking -= id
                }
                // A channel that didn't open isn't tried again straight away (one cut short by the
                // cursor moving is tried again once it rests).
                if (!interrupted) browsePictureAt[id] = System.currentTimeMillis()
                delay(150)
            }
        }
    }
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
            listState.animateScrollToItem(index)
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
        // The picture takers draw here, out of sight under the rail and the cards.
        val density = androidx.compose.ui.platform.LocalDensity.current
        grabbers.forEach { g ->
            AndroidView(
                factory = { ctx -> TextureView(ctx).also { g.view.view = it; g.stream.player.setVideoTextureView(it) } },
                onRelease = {
                    if (g.view.view === it) g.view.view = null
                    g.stream.player.clearVideoTextureView(it)
                },
                modifier = Modifier
                    .size(with(density) { PICTURE_W.toDp() }, with(density) { PICTURE_H.toDp() })
                    .graphicsLayer { alpha = 0.01f },
            )
        }
        val railCollapsed = 76.dp
        val contentWidth = maxWidth - railCollapsed - 24.dp
        // Phones (Live TV Max): one and a half cards across instead of three and a bit.
        val phone = maxWidth < 600.dp
        // TV: cards 25% bigger than before (about 2.7 across instead of 3.35).
        val cardWidth = contentWidth / if (phone) 1.45f else 2.68f
        // The header (search, name, clock, weather) stays put; only the rows scroll under it.
        Column(Modifier.fillMaxSize().padding(start = railCollapsed + 8.dp)) {
            Row(
                Modifier.fillMaxWidth().padding(start = 14.dp, end = 28.dp, top = 18.dp, bottom = 4.dp),
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
                        if (Edition.HAS_WEATHER && !phone) WeatherNow()
                    }
                }
            }
            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(top = 6.dp, bottom = 40.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().weight(1f),
            ) {
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
                    val focusIndex = (sessionCardIndex[row.key] ?: 0).coerceIn(0, row.size - 1)
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
                            itemsIndexed(row.videos, key = { _, v -> v.id }) { i, video ->
                                VideoBrowseCard(
                                    video = video,
                                    width = cardWidth,
                                    modifier = if (i == focusIndex) Modifier.focusRequester(rowRequester(row.key)) else Modifier,
                                    onFocused = {
                                        focusedKey = null
                                        sessionRowKey = row.key
                                        sessionCardIndex[row.key] = i
                                    },
                                    onClick = { openVideo(video) },
                                )
                            }
                            itemsIndexed(row.channels, key = { _, c -> c.id }) { i, channel ->
                                val here = focusedKey == row.key to channel.id
                                LaunchedEffect(channel.id) { showSavedPicture(channel.id) }
                                DisposableEffect(channel.id) {
                                    onScreen[channel.id] = (onScreen[channel.id] ?: 0) + 1
                                    onDispose {
                                        val left = (onScreen[channel.id] ?: 1) - 1
                                        if (left > 0) onScreen[channel.id] = left else onScreen.remove(channel.id)
                                    }
                                }
                                val (now, next) = if (Edition.MAX) Guide.nowNext(guide, channel, nowSec) else null to null
                                BrowseCard(
                                    channel = channel,
                                    width = cardWidth,
                                    now = now,
                                    next = next,
                                    favorite = channel.id in favorites,
                                    stream = stream.takeIf { here && previewId == channel.id },
                                    streamView = previewView,
                                    showing = here && showing,
                                    picture = browsePictures[channel.id],
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
            if (Edition.MAX) {
                RailItem(Icons.Filled.Schedule, "On now", railFocused, right = back) {
                    if (rows.any { it.key == "onnow" }) focusRow("onnow")
                    else android.widget.Toast.makeText(context, "The TV guide isn't available right now.", android.widget.Toast.LENGTH_LONG).show()
                }
                RailItem(Icons.Filled.Movie, "Movies and dramas", railFocused, right = back) {
                    rows.firstOrNull { it.key.startsWith("videos:") && it.key != "videos:recent" }?.let { focusRow(it.key) }
                        ?: android.widget.Toast.makeText(context, "Movies and dramas are still loading.", android.widget.Toast.LENGTH_LONG).show()
                }
            }
            if (onOpenGames != null) RailItem(Icons.Filled.SportsEsports, "Games", railFocused, right = back, onClick = onOpenGames)
            if (onNextMode != null) RailItem(Icons.Filled.Tv, modeLabel, railFocused, Modifier.focusRequester(modeFocus), right = back, onClick = onNextMode)
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
    /** Live TV Max's guide: what's on now and next, when the channel has listings. */
    now: Guide.Programme? = null,
    next: Guide.Programme? = null,
    favorite: Boolean,
    stream: StreamPlayer?,
    streamView: ViewHolder,
    showing: Boolean,
    /** A still of what the channel was showing, drawn over the logo. */
    picture: ImageBitmap?,
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
            if (picture != null) {
                Image(picture, contentDescription = null, contentScale = ContentScale.FillBounds, modifier = Modifier.fillMaxSize())
            }
            if (stream != null) {
                AndroidView(
                    factory = { ctx -> TextureView(ctx).also { streamView.view = it; stream.player.setVideoTextureView(it) } },
                    onRelease = {
                        if (streamView.view === it) streamView.view = null
                        stream.player.clearVideoTextureView(it)
                    },
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
        if (now != null || next != null) {
            now?.let {
                Text(
                    "Now: ${it.title}",
                    color = palette.secondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(start = 2.dp),
                )
            }
            next?.let {
                Text(
                    "Next ${clockTime(it.start)}: ${it.title}",
                    color = palette.onSurfaceVariant,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(start = 2.dp),
                )
            }
        } else if (details.isNotEmpty()) {
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

/** A movie or show card: its picture filling the 16:9 frame, the title and a short line under it. */
@Composable
private fun VideoBrowseCard(
    video: VideoCard,
    width: androidx.compose.ui.unit.Dp,
    modifier: Modifier,
    onFocused: () -> Unit,
    onClick: () -> Unit,
) {
    val palette = Themes.current
    Column(Modifier.width(width)) {
        Box(
            modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .onFocusChanged { if (it.hasFocus) onFocused() }
                .focusGlow(CardShape)
                .clip(CardShape)
                .background(Brush.linearGradient(listOf(palette.surfaceVariant, palette.surface)))
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            val placeholder = @Composable {
                Icon(Icons.Filled.Movie, contentDescription = null, tint = palette.onSurfaceVariant, modifier = Modifier.size(44.dp))
            }
            if (video.image != null) {
                SubcomposeAsyncImage(
                    model = video.image,
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
            video.title,
            color = palette.onSurface,
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 10.dp, start = 2.dp),
        )
        Text(
            video.subtitle,
            color = palette.onSurfaceVariant,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 2.dp),
        )
    }
}

/** Live TV Max's movie and show rows: per language, its dramas, movies, shows and kids' programmes. */
private fun videoRows(shelves: Map<Vod.Language, VodShelf>): List<BrowseRow> = buildList {
    for (language in Vod.Language.entries) {
        val shelf = shelves[language] ?: continue
        val dramaWord = if (language == Vod.Language.URDU || language == Vod.Language.HINDI) "dramas" else "series"
        fun folders(section: Vod.Section, title: String) = BrowseRow(
            "videos:${language.name}:${section.name}",
            title,
            videos = shelf.folders(section).map { show ->
                VideoCard(
                    id = "show:${show.name}",
                    title = show.name,
                    subtitle = if (show.episodes.size == 1) "1 episode" else "${show.episodes.size} episodes",
                    image = show.logo,
                    target = VodTarget(language, section, show = show.name),
                )
            },
        )
        add(folders(Vod.Section.SERIES, "${language.label} $dramaWord"))
        add(
            BrowseRow(
                "videos:${language.name}:MOVIES",
                "${language.label} movies",
                videos = shelf.movies.map { movie ->
                    VideoCard(
                        id = "movie:${movie.id}",
                        title = movie.name,
                        subtitle = listOfNotNull("Movie", movie.group).distinct().joinToString(" · "),
                        image = movie.logo,
                        target = VodTarget(language, Vod.Section.MOVIES, play = movie),
                    )
                }.distinctBy { it.id },
            ),
        )
        add(folders(Vod.Section.SHOWS, "${language.label} shows"))
        add(folders(Vod.Section.KIDS, "${language.label} kids"))
    }
}

/** The "Continue watching: movies and dramas" cards, from the lines saved by openVideo. */
private fun recentVideoCards(lines: List<String>): List<VideoCard> = lines.mapNotNull { line ->
    val p = line.split('|')
    if (p.size < 6) return@mapNotNull null
    val language = runCatching { Vod.Language.valueOf(p[0]) }.getOrNull() ?: return@mapNotNull null
    val section = runCatching { Vod.Section.valueOf(p[1]) }.getOrNull() ?: return@mapNotNull null
    val image = p[5].ifBlank { null }
    if (p[2].isNotBlank()) {
        VideoCard("show:${p[2]}", p[2], "${language.label} ${section.label.lowercase()}", image, VodTarget(language, section, show = p[2]))
    } else if (p[4].isNotBlank()) {
        val movie = Channel(name = p[3], url = p[4], logo = image)
        VideoCard("movie:${p[4]}", p[3], "${language.label} movie", image, VodTarget(language, section, play = movie))
    } else {
        null
    }
}.distinctBy { it.id }

/** "9:30 PM" (or "21:30", as the device is set) for a time in unix seconds. */
@Composable
private fun clockTime(seconds: Long): String {
    val context = LocalContext.current
    return remember(seconds) { android.text.format.DateFormat.getTimeFormat(context).format(java.util.Date(seconds * 1000)) }
}

internal fun metered(context: Context): Boolean =
    (context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager)?.isActiveNetworkMetered ?: true
