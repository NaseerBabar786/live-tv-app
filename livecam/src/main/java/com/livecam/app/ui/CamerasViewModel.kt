package com.livecam.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import com.livecam.app.data.Camera
import com.livecam.app.data.CameraStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class UiState(
    val cameras: List<Camera> = emptyList(),
    /** Camera shown full screen, or null for the grid. */
    val watchingId: String? = null,
    /** Camera being added (id not in the list yet) or edited; null when the editor is closed. */
    val editing: Camera? = null,
) {
    val watching: Camera? get() = cameras.firstOrNull { it.id == watchingId }
}

class CamerasViewModel(app: Application) : AndroidViewModel(app) {

    private val store = CameraStore(app)
    private val _state = MutableStateFlow(UiState(cameras = store.load()))
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun watch(camera: Camera) = _state.update { it.copy(watchingId = camera.id) }

    fun closeLive() = _state.update { it.copy(watchingId = null) }

    /** Next or previous camera in full screen (D-pad left/right, swipe). */
    fun step(delta: Int) = _state.update { s ->
        val i = s.cameras.indexOfFirst { it.id == s.watchingId }
        if (i < 0 || s.cameras.size < 2) s
        else s.copy(watchingId = s.cameras[(i + delta).mod(s.cameras.size)].id)
    }

    fun startAdd() = _state.update { it.copy(editing = Camera(id = CameraStore.newId(), name = "", url = "")) }

    fun startEdit(camera: Camera) = _state.update { it.copy(editing = camera) }

    fun cancelEdit() = _state.update { it.copy(editing = null) }

    fun save(camera: Camera) = _state.update { s ->
        val list = if (s.cameras.any { it.id == camera.id }) {
            s.cameras.map { if (it.id == camera.id) camera else it }
        } else {
            s.cameras + camera
        }
        store.save(list)
        s.copy(cameras = list, editing = null)
    }

    fun delete(camera: Camera) = _state.update { s ->
        val list = s.cameras.filterNot { it.id == camera.id }
        store.save(list)
        s.copy(
            cameras = list,
            editing = null,
            watchingId = s.watchingId.takeIf { it != camera.id },
        )
    }
}
