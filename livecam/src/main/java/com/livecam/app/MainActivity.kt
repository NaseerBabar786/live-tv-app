package com.livecam.app

import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livecam.app.ui.CameraEditor
import com.livecam.app.ui.CameraGridScreen
import com.livecam.app.ui.CamerasViewModel
import com.livecam.app.ui.LiveCamTheme
import com.livecam.app.ui.LiveViewScreen
import com.livecam.app.ui.UpdateDialog
import com.livecam.app.ui.UpdateViewModel
import com.livecam.app.ui.pendingRelease
import com.livecam.app.ui.WyzeSignIn
import com.livecam.app.ui.WyzeWebScreen

class MainActivity : ComponentActivity() {

    private val viewModel: CamerasViewModel by viewModels()
    private val updates: UpdateViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (CrashGuard.start(this)) return
        enableEdgeToEdge()
        // A camera wall is often left running on the TV; don't let the screen sleep.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContent {
            LiveCamTheme {
                val state by viewModel.state.collectAsStateWithLifecycle()
                val watching = state.watching
                // Once Wyze has been opened, the app starts straight on the Wyze cameras;
                // Back goes to the home screen as before.
                val prefs = remember { getSharedPreferences("live_cam", android.content.Context.MODE_PRIVATE) }
                var showWyze by rememberSaveable { mutableStateOf(prefs.getBoolean(KEY_USES_WYZE, false)) }
                if (showWyze) {
                    WyzeWebScreen(onBack = { showWyze = false })
                } else if (watching != null) {
                    val index = state.cameras.indexOf(watching)
                    LiveViewScreen(
                        camera = watching,
                        position = "${index + 1} / ${state.cameras.size}",
                        onBack = viewModel::closeLive,
                        onStep = viewModel::step,
                        onEdit = { viewModel.startEdit(watching) },
                    )
                } else {
                    CameraGridScreen(
                        cameras = state.cameras,
                        onWatch = viewModel::watch,
                        onEdit = viewModel::startEdit,
                        onAdd = viewModel::startAdd,
                        onOpenWyze = {
                            prefs.edit().putBoolean(KEY_USES_WYZE, true).apply()
                            showWyze = true
                        },
                        version = updates.installedVersion,
                    )
                }
                val update by updates.update.collectAsStateWithLifecycle()
                UpdateDialog(
                    state = update,
                    onInstall = { update.pendingRelease?.let { updates.install(it) } },
                    onDismiss = updates::dismiss,
                )
                state.editing?.let { editing ->
                    CameraEditor(
                        initial = editing,
                        isNew = state.cameras.none { it.id == editing.id },
                        onSave = viewModel::save,
                        onDelete = { viewModel.delete(editing) },
                        onCancel = viewModel::cancelEdit,
                    )
                }
            }
        }
    }

    /**
     * While a camera is full screen, Up/Down and Channel Up/Down on a TV remote switch to the
     * previous or next camera. Left/Right stay free to move between the on-screen buttons.
     */
    override fun onStop() {
        super.onStop()
        // Keep the Wyze sign-in when the TV closes the app or an update replaces it.
        WyzeSignIn.save(this)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val s = viewModel.state.value
        if (s.watching != null && s.editing == null) {
            val step = when (event.keyCode) {
                KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP, KeyEvent.KEYCODE_DPAD_UP -> -1
                KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN, KeyEvent.KEYCODE_DPAD_DOWN -> 1
                else -> 0
            }
            if (step != 0) {
                if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) viewModel.step(step)
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }
}

private const val KEY_USES_WYZE = "uses_wyze"
