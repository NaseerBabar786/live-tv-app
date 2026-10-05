package com.multichat.app.data

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/** Small rules with no Android code, so they run in plain JVM unit tests. */
object Rules {

    /** WhatsApp Web puts the unread chat count in the page title: "(3) WhatsApp". */
    fun unreadFromTitle(title: String?): Int =
        Regex("""^\((\d+)\)""").find(title.orEmpty().trim())?.groupValues?.get(1)?.toIntOrNull() ?: 0

    /**
     * Whether [now] (minutes after midnight) falls in quiet hours [from]..[to]. The range may
     * cross midnight (22:00 to 07:00). Equal start and end means quiet all day.
     */
    fun inQuietHours(on: Boolean, from: Int, to: Int, now: Int): Boolean {
        if (!on) return false
        if (from == to) return true
        return if (from < to) now in from until to else now >= from || now < to
    }

    /** 1350 -> "22:30". */
    fun clock(minutes: Int): String = "%02d:%02d".format((minutes / 60) % 24, minutes % 60)

    /** "Bulk Bazaar" -> "BB", "personal" -> "P". */
    fun initials(name: String): String {
        val words = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return "?"
        val first = words.first().first()
        val last = if (words.size > 1) words.last().first().toString() else ""
        return "$first$last".uppercase()
    }

    fun isValidPin(pin: String): Boolean = pin.length in 4..8 && pin.all { it in '0'..'9' }

    fun newSalt(): String = ByteArray(16).also { SecureRandom().nextBytes(it) }.toHex()

    /** A slow, salted hash, so the saved PIN cannot be read back from the phone's storage. */
    fun hashPin(pin: String, salt: String): String {
        val spec = PBEKeySpec(pin.toCharArray(), salt.toByteArray(), 20_000, 256)
        return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA1").generateSecret(spec).encoded.toHex()
    }

    fun pinMatches(pin: String, salt: String, hash: String): Boolean =
        MessageDigest.isEqual(hashPin(pin, salt).toByteArray(), hash.toByteArray())

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}
