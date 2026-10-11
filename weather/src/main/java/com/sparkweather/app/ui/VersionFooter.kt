package com.sparkweather.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.sparkweather.app.data.OwnerTest

/** The bottom of Settings in the Spark Weather app: its version (7 taps = owner's test updates) and the test version button. */
@Composable
fun VersionFooter(version: String) {
    val context = LocalContext.current
    Text(
        "Version $version",
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.clickable { OwnerTest.tap(context) },
    )
    TestVersionButton()
}
