package com.livecam.app

import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.livecam.app.ui.CameraEditor
import com.livecam.app.ui.CameraGridScreen
import com.livecam.app.ui.CamerasViewModel
import com.livecam.app.ui.LiveCamTheme
import com.livecam.app.ui.LiveViewScreen

class MainActivity : ComponentActivity() {

    private val viewModel: CamerasViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // A camera wall is often left running on the TV; don't let the screen sleep.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContent {
            LiveCamTheme {
                val state by viewModel.state.collectAsStateWithLifecycle()
                val watching = state.watching
                if (watching != null) {
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
                    )
                }
                state.editing?.let { editing ->
                    CameraEditor(
                        initial = editing,
                        isNew = state.cameras.none { it.id == editing.id },
                        onSave = viewModel::save,
                        onDelete = { viewModel.delete(editing) },
                        onCancel = viewModel::cancelEdit,
                    )
                }
                // First launch: open the add dialog straight away.
                LaunchedEffect(Unit) {
                    if (savedInstanceState == null && state.cameras.isEmpty()) viewModel.startAdd()
                }
            }
        }
    }

    /**
     * While a camera is full screen, Up/Down and Channel Up/Down on a TV remote switch to the
     * previous or next camera. Left/Right stay free to move between the on-screen buttons.
     */
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
