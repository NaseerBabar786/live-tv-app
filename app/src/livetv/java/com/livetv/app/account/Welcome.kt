package com.livetv.app.account

import com.livetv.app.Edition
import com.livetv.app.Plans
import com.livetv.app.account.Firestore.time
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Date

/**
 * The welcome invitation (owner, 2026-10-08): every viewer who hasn't used the WELCOME promo code
 * gets a message from the Cable TV team inviting them to try Gold free for one month and leave us
 * a good review, with a one-press button that uses the code. The app makes it itself, no server:
 * it sits at the top of the viewer's Messages, and pops up once per account (users/{uid}.welcomeAt
 * records when), so new viewers get it on their first start and existing Free viewers on their next.
 */
object Welcome {
    const val CODE = "WELCOME"
    const val TITLE = "🎁 Try Gold free for one month"
    const val TEXT = "Welcome to Cable TV! As a thank-you for joining us, try Gold free for one month: " +
        "every channel and every feature. Press \"Use code $CODE\", or type promo code $CODE in Settings > Packages. " +
        "One free month per account.\n\n" +
        "Look around, enjoy the app, and if you like it, please leave us a good review ★★★★★ and tell your friends. " +
        "Thank you! The Cable TV team"

    /** [sentAt]: when it first popped up for this account. [canUse]: the WELCOME button still works for them. */
    data class State(val sentAt: Date?, val canUse: Boolean)

    /**
     * Null when there's nothing to show: the owner, not signed in, Live TV Max, the code missing or
     * turned off on tv.bulkbazaar.ca/packages, or already used and never shown.
     */
    suspend fun state(account: Account): State? = withContext(Dispatchers.IO) {
        if (Edition.MAX || account.isAdmin) return@withContext null
        val u = account.user.value ?: return@withContext null
        val t = account.token()
        val code = getOrNull(Firestore.doc("promoCodes/$CODE"), t)?.optJSONObject("fields") ?: return@withContext null
        fun int(k: String) = code.optJSONObject(k)?.optString("integerValue")?.toLongOrNull() ?: 0L
        val active = code.optJSONObject("active")?.optBoolean("booleanValue", true) != false
        val used = code.optJSONObject("usedBy")?.optJSONObject("mapValue")?.optJSONObject("fields")?.has(u.uid) == true
        // Someone already paying for Gold (or on a promotion) isn't invited; the free trial still is.
        val status = Subscription.status.value
        val paying = status != null && !status.trial && status.tier != Plans.Tier.Free && status.until != null
        val canUse = active && !used && int("used") < int("uses") && !paying
        val sentAt = getOrNull(Firestore.doc("users/${u.uid}"), t)?.optJSONObject("fields")?.time("welcomeAt")
        if (!canUse && sentAt == null) null else State(sentAt, canUse)
    }

    /** Remembers that the invitation popped up for this account, so it doesn't pop up again. */
    suspend fun markSent(account: Account) = withContext(Dispatchers.IO) {
        val u = account.user.value ?: return@withContext
        runCatching { Firestore.patch(Firestore.doc("users/${u.uid}"), mapOf("welcomeAt" to Date()), account.token()) }
        Unit
    }

    private fun getOrNull(url: String, token: String): JSONObject? = try {
        Firestore.get(url, token)
    } catch (e: Http.Status) {
        if (e.code == 404) null else throw e
    }
}
