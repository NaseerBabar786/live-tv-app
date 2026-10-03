package com.livetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

private const val SPONSOR_SECONDS = 5

/** How much longer the screen may wait for the channels after the countdown. */
private const val MAX_EXTRA_WAIT_MS = 10_000L

/**
 * Shown for [SPONSOR_SECONDS] seconds when the app starts: thanks and a word from our sponsor.
 * The channels load meanwhile; if they aren't ready when the countdown ends, it waits for them
 * a little longer (at most [MAX_EXTRA_WAIT_MS]) so the main screen opens with them in place.
 */
@Composable
fun SponsorScreen(loading: Boolean, onDone: () -> Unit) {
    var secondsLeft by rememberSaveable { mutableIntStateOf(SPONSOR_SECONDS) }
    val stillLoading by rememberUpdatedState(loading)
    LaunchedEffect(Unit) {
        while (secondsLeft > 0) {
            delay(1_000)
            secondsLeft--
        }
        withTimeoutOrNull(MAX_EXTRA_WAIT_MS) { snapshotFlow { stillLoading }.first { !it } }
        onDone()
    }

    // Just the words, centred on the screen.
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.verticalScroll(rememberScrollState()),
        ) {
            SponsorWords(if (secondsLeft == 0 && loading) null else secondsLeft, TextAlign.Center)
        }
    }
}

@Composable
private fun SponsorWords(secondsLeft: Int?, align: TextAlign) {
    Text(
        "Live TV is free thanks to our sponsor, Bulk Bazaar Inc. Please show them love: " +
            "visit bulkbazaar.ca and leave them a 5-star review ★★★★★",
        style = MaterialTheme.typography.bodyLarge,
        textAlign = align,
        color = MaterialTheme.colorScheme.onBackground,
        modifier = Modifier.widthIn(max = 560.dp),
    )
    Text(
        "Visit our app store, App Bazaar, for more free and useful apps: apps.bulkbazaar.ca",
        style = MaterialTheme.typography.bodyLarge,
        textAlign = align,
        color = MaterialTheme.colorScheme.onBackground,
        modifier = Modifier.widthIn(max = 560.dp),
    )
    Text(
        "Enjoying Live TV? Please share it with your family and friends!",
        style = MaterialTheme.typography.bodyLarge,
        fontWeight = FontWeight.Bold,
        textAlign = align,
        color = FocusColor,
        modifier = Modifier.widthIn(max = 560.dp),
    )
    Text(
        if (secondsLeft == null) "Loading channels…" else "Starting in $secondsLeft…",
        fontSize = 14.sp,
        textAlign = align,
        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
    )
}
