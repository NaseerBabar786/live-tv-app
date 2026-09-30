package com.livecam.app.data

import org.json.JSONArray
import org.json.JSONObject

/** One CCTV / IP camera the user added. */
data class Camera(
    val id: String,
    val name: String,
    /** rtsp://, http(s):// HLS (.m3u8) or any stream ExoPlayer can play. */
    val url: String,
    val username: String = "",
    val password: String = "",
    /** RTSP over TCP is more reliable over Wi-Fi and through NVRs than UDP. */
    val rtspOverTcp: Boolean = true,
    /** Optional lighter substream used for the multi-camera grid. */
    val previewUrl: String = "",
) {
    fun liveUri(): String = StreamUrls.withCredentials(url.trim(), username, password)

    fun previewUri(): String =
        StreamUrls.withCredentials(previewUrl.trim().ifEmpty { url.trim() }, username, password)

    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("name", name)
        .put("url", url)
        .put("username", username)
        .put("password", password)
        .put("rtspOverTcp", rtspOverTcp)
        .put("previewUrl", previewUrl)

    companion object {
        fun fromJson(o: JSONObject) = Camera(
            id = o.getString("id"),
            name = o.optString("name"),
            url = o.optString("url"),
            username = o.optString("username"),
            password = o.optString("password"),
            rtspOverTcp = o.optBoolean("rtspOverTcp", true),
            previewUrl = o.optString("previewUrl"),
        )

        fun listToJson(cameras: List<Camera>): String =
            JSONArray().apply { cameras.forEach { put(it.toJson()) } }.toString()

        fun listFromJson(json: String?): List<Camera> {
            if (json.isNullOrBlank()) return emptyList()
            return runCatching {
                val arr = JSONArray(json)
                (0 until arr.length()).map { fromJson(arr.getJSONObject(it)) }
            }.getOrDefault(emptyList())
        }
    }
}
