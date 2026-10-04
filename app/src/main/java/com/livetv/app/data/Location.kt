package com.livetv.app.data

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.LocationManager
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale
import kotlin.coroutines.resume

/**
 * Where the viewer is, for the weather and prayer times. In order: a city the viewer typed in
 * Settings, the device's own (approximate) location when allowed, and finally a guess from the
 * internet connection. None of the services needs an account or key.
 */
object Location {
    data class Place(
        val latitude: Double,
        val longitude: Double,
        val city: String,
        /** Two-letter country code, e.g. "CA"; empty when unknown. */
        val country: String,
        /** Province or state, shown when picking a city; may be empty. */
        val region: String = "",
    ) {
        val label get() = listOf(city, region).filter { it.isNotBlank() }.distinct().joinToString(", ")
    }

    private var prefs: SharedPreferences? = null
    private val _manual = MutableStateFlow<Place?>(null)
    /** The city typed in Settings; null means automatic. */
    val manual: StateFlow<Place?> = _manual.asStateFlow()

    @Volatile private var device: Place? = null
    @Volatile private var internet: Place? = null

    private val _version = MutableStateFlow(0)
    /** Goes up whenever the place may have changed, so the weather and prayer times reload. */
    val version: StateFlow<Int> = _version.asStateFlow()

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences("location", Context.MODE_PRIVATE)
        prefs = p
        _manual.value = p.getString(K_MANUAL, null)?.let { runCatching { fromJson(JSONObject(it)) }.getOrNull() }
    }

    /** The place to use now; may look it up on the internet, so call it off the main thread. */
    fun current(): Place? = _manual.value ?: device ?: internet ?: fromInternet()?.also { internet = it }

    fun setManual(place: Place?) {
        _manual.value = place
        prefs?.edit()?.apply {
            if (place == null) remove(K_MANUAL) else putString(K_MANUAL, toJson(place).toString())
        }?.apply()
        _version.value++
    }

    fun hasPermission(context: Context) =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** Whether the app has already asked for the location permission (it asks only once). */
    fun asked(): Boolean = prefs?.getBoolean(K_ASKED, false) ?: true

    fun markAsked() {
        prefs?.edit()?.putBoolean(K_ASKED, true)?.apply()
    }

    /**
     * Reads the device's approximate location (when allowed) and names its city. Quietly does
     * nothing when the device can't tell, e.g. a TV with location turned off.
     */
    @SuppressLint("MissingPermission")
    suspend fun refreshDevice(context: Context) {
        if (!hasPermission(context)) return
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
        val providers = runCatching { manager.getProviders(true) }.getOrDefault(emptyList())
        var best = providers.mapNotNull { runCatching { manager.getLastKnownLocation(it) }.getOrNull() }
            .maxByOrNull { it.time }
        // Older than a day, or none at all: ask for a fresh one (network first, it's quick indoors).
        if (best == null || System.currentTimeMillis() - best.time > 24 * 60 * 60_000L) {
            val provider = listOf(LocationManager.NETWORK_PROVIDER, "fused", LocationManager.GPS_PROVIDER)
                .firstOrNull { it in providers }
            if (provider != null) {
                withTimeoutOrNull(15_000) {
                    suspendCancellableCoroutine { cont ->
                        val signal = android.os.CancellationSignal()
                        cont.invokeOnCancellation { signal.cancel() }
                        runCatching {
                            LocationManagerCompat.getCurrentLocation(manager, provider, signal, ContextCompat.getMainExecutor(context)) {
                                if (cont.isActive) cont.resume(it)
                            }
                        }.onFailure { if (cont.isActive) cont.resume(null) }
                    }
                }?.let { best = it }
            }
        }
        val fix = best ?: return
        val named = withContext(Dispatchers.IO) {
            runCatching {
                @Suppress("DEPRECATION")
                Geocoder(context, Locale.getDefault()).getFromLocation(fix.latitude, fix.longitude, 1)?.firstOrNull()
            }.getOrNull()
        }
        val place = Place(
            latitude = fix.latitude,
            longitude = fix.longitude,
            city = named?.locality ?: named?.subAdminArea ?: internet?.city.orEmpty(),
            country = named?.countryCode ?: internet?.country ?: Locale.getDefault().country,
            region = named?.adminArea.orEmpty(),
        )
        if (place != device) {
            device = place
            _version.value++
        }
    }

    /** Cities matching [name], for picking one in Settings (Open-Meteo's place search). */
    fun search(name: String): List<Place> = runCatching {
        val url = "https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=" +
            URLEncoder.encode(name.trim(), "UTF-8")
        parseSearch(get(url))
    }.getOrDefault(emptyList())

    fun parseSearch(json: String): List<Place> {
        val results = JSONObject(json).optJSONArray("results") ?: return emptyList()
        return (0 until results.length()).map { i ->
            val o = results.getJSONObject(i)
            Place(
                latitude = o.getDouble("latitude"),
                longitude = o.getDouble("longitude"),
                city = o.optString("name"),
                country = o.optString("country_code").uppercase(),
                region = listOf(o.optString("admin1"), o.optString("country")).filter { it.isNotBlank() }.joinToString(", "),
            )
        }
    }

    private fun fromInternet(): Place? = runCatching {
        val o = JSONObject(get("https://get.geojs.io/v1/ip/geo.json"))
        Place(
            latitude = o.getString("latitude").toDouble(),
            longitude = o.getString("longitude").toDouble(),
            city = o.optString("city"),
            country = o.optString("country_code").uppercase(),
            region = o.optString("region"),
        )
    }.getOrNull()

    private fun toJson(p: Place) = JSONObject()
        .put("lat", p.latitude).put("lon", p.longitude).put("city", p.city).put("country", p.country).put("region", p.region)

    private fun fromJson(o: JSONObject) = Place(
        latitude = o.getDouble("lat"),
        longitude = o.getDouble("lon"),
        city = o.optString("city"),
        country = o.optString("country"),
        region = o.optString("region"),
    )

    private fun get(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 10_000
        conn.setRequestProperty("User-Agent", ChannelRepository.USER_AGENT)
        return try {
            check(conn.responseCode == 200) { "HTTP ${conn.responseCode}" }
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private const val K_MANUAL = "manual"
    private const val K_ASKED = "asked"
}
