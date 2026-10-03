package com.livetv.app.account

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.IOException

/** The code a TV shows: the viewer opens [url] on a phone and types [userCode]. */
data class TvCode(val userCode: String, val url: String, internal val deviceCode: String, internal val intervalSec: Int, internal val expiresAt: Long)

/**
 * Google sign-in for TVs and other devices without a keyboard ("OAuth for TVs and limited input
 * devices"): the TV shows a short code, the viewer approves it at google.com/device on a phone,
 * and the TV receives a Google ID token.
 */
object TvSignIn {
    private const val CODE_URL = "https://oauth2.googleapis.com/device/code"
    private const val TOKEN_URL = "https://oauth2.googleapis.com/token"

    suspend fun start(): TvCode = withContext(Dispatchers.IO) {
        val r = Http.postForm(CODE_URL, mapOf("client_id" to FirebaseConfig.TV_CLIENT_ID, "scope" to "openid email profile"))
        TvCode(
            userCode = r.getString("user_code"),
            url = r.optString("verification_url").ifBlank { "https://www.google.com/device" },
            deviceCode = r.getString("device_code"),
            intervalSec = r.optInt("interval", 5).coerceAtLeast(1),
            expiresAt = System.currentTimeMillis() + r.optLong("expires_in", 1800) * 1000,
        )
    }

    /** Waits until the viewer approves [code]; returns the Google ID token. Throws when it expires or is denied. */
    suspend fun await(code: TvCode): String {
        var interval = code.intervalSec
        while (System.currentTimeMillis() < code.expiresAt) {
            delay(interval * 1000L)
            val result = withContext(Dispatchers.IO) {
                try {
                    Http.postForm(
                        TOKEN_URL,
                        mapOf(
                            "client_id" to FirebaseConfig.TV_CLIENT_ID,
                            "client_secret" to FirebaseConfig.TV_CLIENT_SECRET,
                            "device_code" to code.deviceCode,
                            "grant_type" to "urn:ietf:params:oauth:grant-type:device_code",
                        ),
                    )
                } catch (e: Http.Status) {
                    when (e.message) {
                        "authorization_pending" -> null
                        "slow_down" -> { interval += 5; null }
                        "access_denied" -> throw IOException("Sign-in was cancelled on the phone.")
                        "expired_token" -> throw IOException("The code ran out. Try again for a new one.")
                        else -> if (e.code == 428) null else throw e
                    }
                }
            } ?: continue
            return result.getString("id_token")
        }
        throw IOException("The code ran out. Try again for a new one.")
    }
}

/** Google sign-in with the account already on the device (phones, and TVs that support it). */
object DeviceAccountSignIn {
    suspend fun idToken(activityContext: Context): String {
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(FirebaseConfig.WEB_CLIENT_ID)
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val credential = CredentialManager.create(activityContext).getCredential(activityContext, request).credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            return GoogleIdTokenCredential.createFrom(credential.data).idToken
        }
        throw IOException("No Google account was picked.")
    }
}
