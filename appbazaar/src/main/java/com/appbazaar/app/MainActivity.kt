package com.appbazaar.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import coil3.svg.SvgDecoder
import com.appbazaar.app.ui.Bg
import com.appbazaar.app.ui.DetailScreen
import com.appbazaar.app.ui.FocusButton
import com.appbazaar.app.ui.FocusOutlinedButton
import com.appbazaar.app.ui.HelpScreen
import com.appbazaar.app.ui.StoreScreen
import com.appbazaar.app.ui.StoreTheme
import com.appbazaar.app.ui.StoreViewModel

class MainActivity : ComponentActivity() {

    private val store: StoreViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // White bars with dark icons, like the website, whatever the phone's dark-mode setting.
        val bars = SystemBarStyle.light(android.graphics.Color.WHITE, android.graphics.Color.WHITE)
        enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
        setContent {
            // App icons on the website are SVG pictures.
            setSingletonImageLoaderFactory { ctx -> ImageLoader.Builder(ctx).components { add(SvgDecoder.Factory()) }.build() }
            StoreTheme {
                val state by store.state.collectAsStateWithLifecycle()
                var openId by rememberSaveable { mutableStateOf<String?>(null) }
                var help by rememberSaveable { mutableStateOf(false) }
                val snackbar = remember { SnackbarHostState() }
                val open = openId?.let { id -> state.apps.firstOrNull { it.id == id } }

                LaunchedEffect(state.message) {
                    state.message?.let {
                        snackbar.showSnackbar(it)
                        store.dismissMessage()
                    }
                }
                BackHandler(enabled = open != null || help) {
                    if (help) help = false else openId = null
                }

                Box(Modifier.fillMaxSize().background(Bg).safeDrawingPadding()) {
                    when {
                        help -> HelpScreen(store.isTv, onBack = { help = false }, onPermission = store::openPermissionSettings)
                        open != null -> DetailScreen(
                            open, state, store.isTv,
                            onBack = { openId = null },
                            onAct = { store.act(open) },
                            onUninstall = { store.uninstall(open) },
                            onWeb = { store.installer.openWeb(it) },
                        )
                        else -> StoreScreen(
                            state, store.isTv,
                            onSection = store::select,
                            onOpen = { openId = it.id },
                            onAct = store::act,
                            onRefresh = { store.refresh(manual = true) },
                            onHelp = { help = true },
                            onUpdateAll = store::updateAll,
                        )
                    }
                    SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter))
                }

                if (state.askInstallPermission) {
                    AlertDialog(
                        onDismissRequest = store::dismissPermission,
                        title = { Text("Allow App Bazaar to install apps") },
                        text = {
                            Text(
                                "Android asks this once. On the next screen turn on \"Allow from this source\" " +
                                    "(on a TV: Unknown sources > App Bazaar), then press Back. The install continues by itself.",
                            )
                        },
                        confirmButton = { FocusButton(onClick = store::openPermissionSettings) { Text("Open settings") } },
                        dismissButton = { FocusOutlinedButton(onClick = store::dismissPermission) { Text("Not now") } },
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        store.onResume()
    }
}
