package com.livetv.app.data

import org.json.JSONArray
import org.json.JSONObject

/** A playlist the viewer added: an http(s) M3U link or a content:// file on the device. */
data class Playlist(val name: String, val source: String) {
    companion object {
        fun toJson(list: List<Playlist>): String = JSONArray().apply {
            list.forEach { put(JSONObject().put("name", it.name).put("source", it.source)) }
        }.toString()

        fun fromJson(json: String?): List<Playlist> = runCatching {
            val array = JSONArray(json ?: return emptyList())
            (0 until array.length()).map { array.getJSONObject(it) }
                .map { Playlist(it.getString("name"), it.getString("source")) }
        }.getOrDefault(emptyList())
    }
}
