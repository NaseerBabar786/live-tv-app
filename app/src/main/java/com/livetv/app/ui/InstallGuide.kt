package com.livetv.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.onSizeChanged
import kotlinx.coroutines.launch

const val INSTALL_GUIDE_TITLE = "How to install this app on other devices"

/** Shows the bundled install guide PDF (assets/install-guide.pdf) page by page. */
@Composable
fun InstallGuideDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    var pages by remember { mutableStateOf<List<Bitmap>?>(null) }
    var failed by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val rendered = withContext(Dispatchers.IO) { runCatching { renderGuide(context) }.getOrNull() }
        if (rendered.isNullOrEmpty()) failed = true else pages = rendered
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.surface)
                .padding(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(
                    INSTALL_GUIDE_TITLE,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f).padding(start = 4.dp),
                )
                TextButton(onClick = onDismiss, modifier = Modifier.focusGlow()) { Text("Close") }
            }
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                val list = pages
                when {
                    failed -> Text("The guide could not be opened.", modifier = Modifier.padding(24.dp))
                    list == null -> CircularProgressIndicator(Modifier.padding(24.dp))
                    else -> GuidePages(list)
                }
            }
        }
    }
}

/**
 * The pages in one scrolling column. The remote's Up/Down scroll it a screenful at a time;
 * Up at the very top moves on to the Close button.
 */
@Composable
private fun GuidePages(pages: List<Bitmap>) {
    val scroll = rememberScrollState()
    var viewport by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxSize()
            .onSizeChanged { viewport = it.height }
            .focusRequester(focus)
            .onPreviewKeyEvent { event ->
                val step = (viewport * 0.6f).coerceAtLeast(200f)
                val delta = when (event.key) {
                    Key.DirectionDown -> step
                    Key.DirectionUp -> if (scroll.value == 0) return@onPreviewKeyEvent false else -step
                    else -> return@onPreviewKeyEvent false
                }
                if (event.type == KeyEventType.KeyDown) scope.launch { scroll.animateScrollBy(delta) }
                true
            }
            .focusable()
            .verticalScroll(scroll),
    ) {
        pages.forEach { page ->
            Image(
                bitmap = page.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.FillWidth,
                modifier = Modifier.widthIn(max = 900.dp).fillMaxWidth(),
            )
        }
    }
}

private fun renderGuide(context: Context): List<Bitmap> {
    val file = File(context.cacheDir, "install-guide.pdf")
    context.assets.open("install-guide.pdf").use { input -> file.outputStream().use { input.copyTo(it) } }
    val width = minOf(context.resources.displayMetrics.widthPixels, 1400).coerceAtLeast(600)
    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
        PdfRenderer(fd).use { renderer ->
            return (0 until renderer.pageCount).map { i ->
                renderer.openPage(i).use { page ->
                    val height = width * page.height / page.width
                    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    bitmap
                }
            }
        }
    }
}
