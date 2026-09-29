package com.livetv.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.livetv.app.R
import kotlinx.coroutines.delay

private const val SPONSOR_SECONDS = 10

/** Shown for [SPONSOR_SECONDS] seconds when the app starts: thanks and a word from our sponsor. */
@Composable
fun SponsorScreen(onDone: () -> Unit) {
    var secondsLeft by rememberSaveable { mutableIntStateOf(SPONSOR_SECONDS) }
    LaunchedEffect(Unit) {
        while (secondsLeft > 0) {
            delay(1_000)
            secondsLeft--
        }
        onDone()
    }

    BoxWithConstraints(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
    ) {
        // The banner is shown up to 540x420dp (150% of its first size), and never taller
        // than the screen allows. On wide screens the words sit beside it.
        val landscape = maxWidth > maxHeight
        val banner = @Composable {
            Image(
                painter = painterResource(R.drawable.bulkbazaar_square),
                contentDescription = "Bulk Bazaar Inc.: wholesale T-shirt bags. bulkbazaar.ca",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .widthIn(max = 540.dp)
                    .heightIn(max = if (landscape) minOf(420.dp, maxHeight) else 420.dp)
                    .aspectRatio(300f / 250f)
                    .clip(RoundedCornerShape(16.dp)),
            )
        }
        if (landscape) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(36.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Box(Modifier.weight(1.4f, fill = false)) { banner() }
                Column(
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier.weight(1f, fill = false).widthIn(max = 460.dp),
                ) { SponsorWords(secondsLeft, TextAlign.Start) }
            }
        } else {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
            ) {
                banner()
                SponsorWords(secondsLeft, TextAlign.Center)
            }
        }
    }
}

@Composable
private fun SponsorWords(secondsLeft: Int, align: TextAlign) {
    Text(
        "Thank you for using Live TV!",
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
        textAlign = align,
        color = MaterialTheme.colorScheme.onBackground,
    )
    Text(
        "Live TV is free thanks to our sponsor, Bulk Bazaar Inc. Please show them some love: " +
            "visit bulkbazaar.ca and leave them a 5-star review ★★★★★",
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
        "Starting in $secondsLeft…",
        fontSize = 14.sp,
        textAlign = align,
        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
    )
}
