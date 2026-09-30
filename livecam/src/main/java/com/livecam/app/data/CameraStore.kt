package com.livecam.app.data

import android.content.Context
import java.util.UUID

/**
 * Saves the camera list on the device. Nothing leaves the phone or TV: the app talks
 * straight to the cameras on the local network.
 */
class CameraStore(context: Context) {

    private val prefs = context.getSharedPreferences("cameras", Context.MODE_PRIVATE)

    fun load(): List<Camera> = Camera.listFromJson(prefs.getString(KEY, null))

    fun save(cameras: List<Camera>) {
        prefs.edit().putString(KEY, Camera.listToJson(cameras)).apply()
    }

    companion object {
        private const val KEY = "list"
        fun newId(): String = UUID.randomUUID().toString()
    }
}
