package com.multichat.app.data

import android.os.SystemClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The PIN / fingerprint lock. Locked when the app starts and again when the person comes
 * back after being away longer than the auto-lock time. Only active when a PIN is set.
 */
object Lock {

    private val _locked = MutableStateFlow(true)
    val locked: StateFlow<Boolean> = _locked.asStateFlow()

    private var leftAt = 0L

    private var ownScreenAt = 0L
    private var leftForOwnScreen = false

    /** Called just before opening a file picker or similar, so coming back from it does not lock. */
    fun openingOwnScreen() {
        ownScreenAt = SystemClock.elapsedRealtime()
    }

    fun onAppVisible() {
        val s = Store.settings.value
        if (!s.hasPin) {
            _locked.value = false
            return
        }
        if (leftForOwnScreen) {
            leftForOwnScreen = false
            return
        }
        val away = SystemClock.elapsedRealtime() - leftAt
        if (leftAt == 0L || away >= s.autoLockMinutes * 60_000L) _locked.value = true
    }

    fun onAppHidden() {
        leftAt = SystemClock.elapsedRealtime()
        leftForOwnScreen = leftAt - ownScreenAt < 3_000L
    }

    fun lockNow() {
        if (Store.settings.value.hasPin) _locked.value = true
    }

    fun unlock() {
        _locked.value = false
    }

    fun tryPin(pin: String): Boolean {
        val s = Store.settings.value
        val salt = s.pinSalt ?: return true
        val hash = s.pinHash ?: return true
        val ok = Rules.pinMatches(pin, salt, hash)
        if (ok) unlock()
        return ok
    }
}
