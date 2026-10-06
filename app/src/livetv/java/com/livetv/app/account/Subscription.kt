package com.livetv.app.account

import android.content.Context
import com.livetv.app.Edition
import com.livetv.app.Plans
import com.livetv.app.account.Firestore.bool
import com.livetv.app.account.Firestore.str
import com.livetv.app.account.Firestore.time
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Date

/**
 * Cable TV's packages for the signed-in viewer.
 *
 * The owner sets each viewer's package and end date on tv.bulkbazaar.ca/packages (plans/{uid});
 * the prices, how to pay, the free trial and whether packages are on at all live in
 * config/plans. While packages are off, everyone has everything (Platinum). New viewers get
 * Platinum free for the trial days after they join; after that, without a package, Free.
 */
object Subscription {
    /** One package's prices, as text such as "$1.99". */
    data class Prices(val year: String, val sixMonths: String, val threeMonths: String, val month: String)

    data class Offer(
        val enforced: Boolean = false,
        val trialDays: Int = 7,
        val prices: Map<Plans.Tier, Prices> = DEFAULT_PRICES,
        val howToPay: String = DEFAULT_HOW_TO_PAY,
    )

    /** Where the viewer's package comes from, for the packages screen and the end-date warning. */
    data class Status(
        val tier: Plans.Tier,
        /** When the paid package (or the free trial) ends; null for Free, or while packages are off. */
        val until: Date? = null,
        val trial: Boolean = false,
        /** The paid package that ended, when it ended in the last week. */
        val endedTier: Plans.Tier? = null,
        val endedAt: Date? = null,
    )

    // Declared before _offer: Offer() reads it while this object starts, and a later one is still null then.
    val DEFAULT_PRICES: Map<Plans.Tier, Prices> = mapOf(
        Plans.Tier.Silver to Prices("$17.79", "$9.79", "$5.39", "$1.99"),
        Plans.Tier.Gold to Prices("$35.99", "$19.79", "$10.89", "$3.99"),
        Plans.Tier.Platinum to Prices("$53.79", "$29.59", "$16.29", "$5.99"),
    )

    /**
     * The longer plans from the monthly price: each one costs 10% less per month than the one before
     * it (3 months = 3 months' worth - 10%, 6 months = twice that - 10%, 1 year = twice that - 10%),
     * rounded to the nearest 10 cents and ending in 9. The same sums as tv.bulkbazaar.ca/packages.
     */
    fun fromMonth(month: String): Prices? {
        val m = month.filter { it.isDigit() || it == '.' }.toDoubleOrNull() ?: return null
        if (m <= 0) return null
        fun r(v: Double) = (Math.round(v * 10) / 10.0 - 0.01).coerceAtLeast(0.99)
        val three = r(m * 3 / 1.1)
        val six = r(three * 2 / 1.1)
        val year = r(six * 2 / 1.1)
        fun f(v: Double) = "$" + String.format(java.util.Locale.US, "%.2f", v)
        return Prices(f(year), f(six), f(three), month)
    }

    private val _offer = MutableStateFlow(Offer())
    val offer: StateFlow<Offer> = _offer

    private val _status = MutableStateFlow<Status?>(null)
    val status: StateFlow<Status?> = _status

    /** Packages are on, and this viewer has Platinum: their account works on two devices. */
    val twoDevices: Boolean get() = _offer.value.enforced && Plans.current.value == Plans.Tier.Platinum

    private const val PREFS = "subscription"

    /** The last known package, so a start without internet keeps it. */
    fun init(context: Context) {
        if (Edition.MAX) return
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        p.getString("tier", null)?.let { name ->
            Plans.Tier.entries.firstOrNull { it.name == name }?.let { tier ->
                val until = p.getLong("until", 0L)
                // A saved package that has run out since counts as Free until the next check.
                Plans.set(if (until in 1 until System.currentTimeMillis()) Plans.Tier.Free else tier)
            }
        }
    }

    /** Reads the offer and the viewer's package. Quietly keeps the last known one when offline. */
    suspend fun refresh(context: Context, account: Account) = withContext(Dispatchers.IO) {
        if (Edition.MAX) return@withContext
        val u = account.user.value ?: return@withContext
        runCatching {
            val t = account.token()
            val config = getOrNull(Firestore.doc("config/plans"), t)?.optJSONObject("fields")
            val offer = parseOffer(config)
            _offer.value = offer
            val now = Date()
            val status = if (!offer.enforced) {
                Status(Plans.Tier.Platinum)
            } else {
                val plan = getOrNull(Firestore.doc("plans/${u.uid}"), t)?.optJSONObject("fields")
                val paid = plan?.str("tier")?.let { n -> Plans.Tier.entries.firstOrNull { it.name.equals(n, true) } }
                val paidUntil = plan?.time("until")
                val joined = getOrNull(Firestore.doc("users/${u.uid}"), t)?.optJSONObject("fields")?.time("joined") ?: now
                val trialEnd = Date(joined.time + offer.trialDays * 86_400_000L)
                when {
                    paid != null && paid != Plans.Tier.Free && paidUntil != null && paidUntil.after(now) ->
                        Status(paid, paidUntil)
                    offer.trialDays > 0 && trialEnd.after(now) ->
                        Status(Plans.Tier.Platinum, trialEnd, trial = true)
                    paid != null && paid != Plans.Tier.Free && paidUntil != null && now.time - paidUntil.time < 7 * 86_400_000L ->
                        Status(Plans.Tier.Free, endedTier = paid, endedAt = paidUntil)
                    else -> Status(Plans.Tier.Free)
                }
            }
            _status.value = status
            Plans.set(status.tier)
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("tier", status.tier.name)
                .putLong("until", status.until?.time ?: 0L)
                .apply()
        }
        Unit
    }

    private fun getOrNull(url: String, token: String): JSONObject? = try {
        Firestore.get(url, token)
    } catch (e: Http.Status) {
        if (e.code == 404) null else throw e
    }

    private fun parseOffer(f: JSONObject?): Offer {
        if (f == null) return Offer()
        fun price(tier: Plans.Tier, key: String, fallback: String) =
            f.str("${tier.name.lowercase()}_$key").ifBlank { fallback }
        // The owner types the monthly price; the longer plans are worked out from it unless set too.
        val prices = DEFAULT_PRICES.mapValues { (tier, d) ->
            val month = price(tier, "month", d.month)
            val auto = fromMonth(month) ?: d
            Prices(
                price(tier, "year", auto.year),
                price(tier, "six", auto.sixMonths),
                price(tier, "three", auto.threeMonths),
                month,
            )
        }
        val trial = f.optJSONObject("trialDays")?.let { it.optString("integerValue").toIntOrNull() ?: it.optInt("doubleValue", 7) } ?: 7
        return Offer(
            enforced = f.bool("enforce"),
            trialDays = trial.coerceIn(0, 365),
            prices = prices,
            howToPay = f.str("howToPay").ifBlank { DEFAULT_HOW_TO_PAY },
        )
    }

    /** What each package adds, for the packages screen. */
    val FEATURES: Map<Plans.Tier, String> = mapOf(
        Plans.Tier.Free to "Our own channels plus Aaj Tak and ARY News, in 1+List mode, full screen, favourites",
        Plans.Tier.Silver to "All channels, plus Browse and Carousel modes",
        Plans.Tier.Gold to "Everything in the app: every mode (1×2, 1+3, Duo, Strip, 2×2, 2×3, News, CP24, Home, My Screen), Movies & Dramas and Games",
        Plans.Tier.Platinum to "Everything in Gold, and your account on 2 devices at once",
    )

    const val DEFAULT_HOW_TO_PAY =
        "Pick a package below and press Ask. We'll message you back here with how to pay " +
            "(Interac e-Transfer or card), and turn your package on as soon as it's paid. " +
            "Questions? WhatsApp 437 602 6500."
}
