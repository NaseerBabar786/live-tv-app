package com.livetv.app.player

import kotlinx.coroutines.delay
import android.app.Activity
import android.view.View
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.material3.TextButton
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.livetv.app.data.Channel
import com.livetv.app.ui.focusGlow

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    channel: Channel,
    favorite: Boolean,
    inPictureInPicture: Boolean,
    onBack: () -> Unit,
    onToggleFavorite: () -> Unit,
    /** False for movies and episodes, which can't be favourites. */
    showFavorite: Boolean = true,
    /** Digits typed so far for a channel number (shown big in the corner). */
    typedNumber: String = "",
    numberPadOpen: Boolean = false,
    /** Opens or closes the on-screen number pad; null hides the 123 button (movies). */
    onNumberPad: ((Boolean) -> Unit)? = null,
    onDigit: (Int) -> Unit = {},
    onDeleteDigit: () -> Unit = {},
    onGo: () -> Unit = {},
    /** A message over the picture for 10 seconds (the Favourites reminder). */
    tip: String? = null,
    onTipDone: () -> Unit = {},
    /** Bumped from outside (OK on the remote) to bring the channel bar back. */
    barWake: Int = 0,
    /** Told whether the channel bar is currently hidden. */
    onBarHidden: (Boolean) -> Unit = {},
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var error by remember { mutableStateOf<String?>(null) }
    var controlsVisible by remember { mutableStateOf(true) }
    // The channel bar (back arrow, number and name, star) goes away after 10 seconds and comes
    // back for another 10 when the channel changes, a number is typed or OK is pressed.
    var barShown by remember { mutableStateOf(true) }
    var controlsWake by remember { mutableIntStateOf(0) }
    LaunchedEffect(channel.id, barWake, controlsWake, typedNumber, numberPadOpen) {
        barShown = true
        onBarHidden(false)
        if (numberPadOpen) return@LaunchedEffect
        delay(10_000)
        barShown = false
        onBarHidden(true)
    }
    DisposableEffect(Unit) { onDispose { onBarHidden(false) } }

    val streamPlayer = remember {
        StreamPlayer(context).also { p -> p.onError = { error = it } }
    }

    LaunchedEffect(channel.url) { streamPlayer.play(channel) }

    DisposableEffect(Unit) {
        onDispose { streamPlayer.release() }
    }

    // Pause when the app goes to the background; resume when it returns.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> streamPlayer.player.pause()
                Lifecycle.Event.ON_START -> streamPlayer.player.play()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Full-screen playback: hide the status and navigation bars while watching.
    DisposableEffect(Unit) {
        val window = (context as Activity).window
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
        onDispose { controller.show(WindowInsetsCompat.Type.systemBars()) }
    }

    BackHandler(onBack = onBack)

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = streamPlayer.player
                    keepScreenOn = true
                    setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
                    // Live channels fill the whole screen, stretched if their picture is a
                    // different shape (no black bars); movies keep their own shape.
                    if (onNumberPad != null) resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FILL
                    setShowNextButton(false)
                    setShowPreviousButton(false)
                    setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { visibility ->
                        controlsVisible = visibility == View.VISIBLE
                        if (controlsVisible) controlsWake++
                    })
                }
            },
            update = { view -> view.useController = !inPictureInPicture },
            modifier = Modifier.fillMaxSize(),
        )

        AnimatedVisibility(
            visible = barShown && !inPictureInPicture,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.TopCenter),
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.7f), Color.Transparent)))
                    .safeDrawingPadding()
                    .padding(horizontal = 4.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack, modifier = Modifier.focusGlow()) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        if (channel.number > 0) "${channel.number}  ${channel.name}" else channel.name,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    channel.group?.let {
                        Text(it, color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall)
                    }
                }
                if (onNumberPad != null) {
                    TextButton(onClick = { onNumberPad(true) }, modifier = Modifier.focusGlow()) {
                        Text("123", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }
                if (showFavorite) {
                    IconButton(onClick = onToggleFavorite, modifier = Modifier.focusGlow()) {
                        Icon(
                            if (favorite) Icons.Filled.Star else Icons.Outlined.StarBorder,
                            contentDescription = if (favorite) "Remove from favorites" else "Add to favorites",
                            tint = if (favorite) MaterialTheme.colorScheme.secondary else Color.White,
                        )
                    }
                }
            }
        }

        // With the bar hidden, live channels keep just their number, small in the top-left corner.
        AnimatedVisibility(
            visible = !barShown && onNumberPad != null && channel.number > 0 && !inPictureInPicture,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.TopStart)
                .safeDrawingPadding()
                .padding(16.dp),
        ) {
            Text(
                "${channel.number}",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier
                    .background(Color.Black.copy(alpha = 0.5f), MaterialTheme.shapes.small)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }

        // The number being typed, big in the top-right corner like a TV.
        if (typedNumber.isNotEmpty() && !inPictureInPicture) {
            Text(
                typedNumber,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.displayMedium,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 64.dp, end = 32.dp)
                    .background(Color.Black.copy(alpha = 0.6f), MaterialTheme.shapes.medium)
                    .padding(horizontal = 20.dp, vertical = 8.dp),
            )
        }

        if (tip != null && !inPictureInPicture) {
            LaunchedEffect(tip) {
                delay(10_000)
                onTipDone()
            }
            Text(
                tip,
                color = Color.White,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 48.dp, start = 32.dp, end = 32.dp)
                    .background(Color.Black.copy(alpha = 0.75f), MaterialTheme.shapes.medium)
                    .padding(horizontal = 20.dp, vertical = 12.dp),
            )
        }

        if (numberPadOpen && onNumberPad != null && !inPictureInPicture) {
            BackHandler { onNumberPad(false) }
            NumberPad(
                onDigit = onDigit,
                onDelete = onDeleteDigit,
                onGo = onGo,
                modifier = Modifier.align(Alignment.CenterEnd).padding(end = 32.dp),
            )
        }

        error?.let { message ->
            Column(
                Modifier
                    .align(Alignment.Center)
                    .background(Color.Black.copy(alpha = 0.8f), MaterialTheme.shapes.medium)
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(message, color = Color.White)
                Spacer(Modifier.height(16.dp))
                Button(onClick = { streamPlayer.retry() }, modifier = Modifier.focusGlow()) { Text("Try again") }
            }
        }
    }
}

/** An on-screen number pad for remotes without number buttons: 1-9, then delete, 0 and Go. */
@Composable
private fun NumberPad(
    onDigit: (Int) -> Unit,
    onDelete: () -> Unit,
    onGo: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val first = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
    Column(
        modifier
            .background(Color.Black.copy(alpha = 0.8f), MaterialTheme.shapes.large)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        val rows = listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("⌫", "0", "Go"))
        rows.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { key ->
                    Box(
                        Modifier
                            .size(64.dp)
                            .then(if (key == "1") Modifier.focusRequester(first) else Modifier)
                            .focusGlow()
                            .background(Color.White.copy(alpha = 0.12f), MaterialTheme.shapes.medium)
                            .clickable {
                                when (key) {
                                    "⌫" -> onDelete()
                                    "Go" -> onGo()
                                    else -> onDigit(key.toInt())
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(key, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                    }
                }
            }
        }
    }
}
