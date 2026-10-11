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
 * gets a message from the NextGen Cable team inviting them to try Gold free for one month and leave us
 * a good review, with a one-press button that uses the code. The app makes it itself, no server:
 * it sits at the top of the viewer's Messages, and pops up once per account (users/{uid}.welcomeAt
 * records when), so new viewers get it on their first start and existing Free viewers on their next.
 */
object Welcome {
    const val CODE = "WELCOME"
    const val TITLE = "🎁 Try Gold free for one month"
    const val TEXT = "Thank you for joining NextGen Cable! Here is your welcome gift: Gold free for one more month, " +
        "every mode and every feature (the channels are always free). Press \"Use code $CODE\", or type promo code $CODE in Settings > Packages. " +
        "One free month per account.\n\n" +
        "Look around, enjoy the app, and if you like it, please leave us a good review ★★★★★ and tell your friends. " +
        "Thank you! The NextGen Cable team"

    /** Hours after the free trial ends before the gift pops up (owner, 2026-10-08). */
    const val AFTER_TRIAL_HOURS = 8

    /**
     * [sentAt]: when it first popped up for this account. [canUse]: the WELCOME button still works for them.
     * [offerAt]: when it pops up, 8 hours after the free trial ends (they can type the code before that).
     */
    data class State(val sentAt: Date?, val canUse: Boolean, val offerAt: Date)

    /**
     * Null when there's nothing to show: the owner, not signed in, Live TV Max, the code missing or
     * turned off on tv.bulkbazaar.ca/packages, or already used and never shown.
     */
    suspend fun state(account: Account): State? = withContext(Dispatchers.IO) {
        // Everything is free (owner, 2026-10-10): no Gold gift to offer.
        if (Edition.FREE_FOR_ALL || Edition.MAX || account.isAdmin) return@withContext null
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
        val me = getOrNull(Firestore.doc("users/${u.uid}"), t)?.optJSONObject("fields")
        val sentAt = me?.time("welcomeAt")
        val joined = me?.time("joined") ?: Date()
        val trialMs = Subscription.offer.value.trialDays * 86_400_000L
        val offerAt = Date(joined.time + trialMs + AFTER_TRIAL_HOURS * 3_600_000L)
        if (!canUse && sentAt == null) null else State(sentAt, canUse, offerAt)
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
