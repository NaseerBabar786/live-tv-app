package com.iqraquran.app.data

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.LocationManager
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

/**
 * Where the device is (its approximate location, when allowed), and a city search for picking one by hand,
 * so the prayer times are for the viewer's own town and not a guess from the internet connection.
 */
object DevicePlace {

    fun allowed(context: Context) =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** The device's place, or null when it isn't allowed or can't tell (e.g. a TV with location off). */
    @SuppressLint("MissingPermission")
    suspend fun find(context: Context): Place? {
        if (!allowed(context)) return null
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        val providers = runCatching { manager.getProviders(true) }.getOrDefault(emptyList())
        var best = providers.mapNotNull { runCatching { manager.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time }
        // Older than a day, or none: ask for a fresh one (network first, it's quick indoors).
        if (best == null || System.currentTimeMillis() - best.time > 24 * 60 * 60_000L) {
            val provider = listOf(LocationManager.NETWORK_PROVIDER, "fused", LocationManager.GPS_PROVIDER).firstOrNull { it in providers }
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
        val fix = best ?: return null
        val named = withContext(Dispatchers.IO) {
            runCatching {
                @Suppress("DEPRECATION")
                Geocoder(context, Locale.getDefault()).getFromLocation(fix.latitude, fix.longitude, 1)?.firstOrNull()
            }.getOrNull()
        }
        return Place(
            fix.latitude, fix.longitude,
            named?.locality ?: named?.subAdminArea ?: "",
            named?.countryCode ?: Locale.getDefault().country,
        )
    }

    /** Cities matching [name] (Open-Meteo's free place search, as NextGen Cable's weather city). */
    suspend fun search(name: String): List<Place> = withContext(Dispatchers.IO) {
        runCatching {
            val url = "https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=" +
                URLEncoder.encode(name.trim(), "UTF-8")
            val text = (URL(url).openConnection() as HttpURLConnection).run {
                connectTimeout = 10_000
                readTimeout = 10_000
                setRequestProperty("User-Agent", "IqraQuran-Android/1.0")
                inputStream.bufferedReader().use { it.readText() }
            }
            parseSearch(text)
        }.getOrDefault(emptyList())
    }

    /** Open-Meteo results; the city keeps its province after a comma for telling places apart. */
    fun parseSearch(json: String): List<Place> {
        val results = JSONObject(json).optJSONArray("results") ?: return emptyList()
        return (0 until results.length()).map { i ->
            val o = results.getJSONObject(i)
            Place(
                o.getDouble("latitude"), o.getDouble("longitude"),
                listOf(o.optString("name"), o.optString("admin1")).filter { it.isNotBlank() }.distinct().joinToString(", "),
                o.optString("country_code").uppercase(),
            )
        }
    }
}
