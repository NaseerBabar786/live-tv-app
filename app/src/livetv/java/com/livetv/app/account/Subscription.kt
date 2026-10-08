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
import org.json.JSONArray
import org.json.JSONObject
import java.util.Date

/**
 * Cable TV's packages for the signed-in viewer.
 *
 * The owner sets each viewer's package and end date on tv.bulkbazaar.ca/packages (plans/{uid});
 * the prices, how to pay, the free trial and whether packages are on at all live in
 * config/plans. While packages are off, everyone has everything (Gold). New viewers get
 * Gold free for the trial days after they join; after that, without a package, Free.
 */
object Subscription {
    /** One package's prices, as text such as "$1.99". */
    data class Prices(val year: String, val sixMonths: String, val threeMonths: String, val month: String)

    data class Offer(
        val enforced: Boolean = false,
        val trialDays: Int = 7,
        val prices: Map<Plans.Tier, Prices> = DEFAULT_PRICES,
        val howToPay: String = DEFAULT_HOW_TO_PAY,
        /** What each package has, as ticked by the owner at tv.bulkbazaar.ca/packages. */
        val features: Map<Plans.Tier, Set<Plans.Feature>> = Plans.DEFAULT_FEATURES,
        /** The owner's promotions (Christmas, Labour Day...), from config/promos. */
        val promos: List<Promo> = emptyList(),
        /** Channels the owner adds to packages without All channels, as typed: "Aaj Tak, ARY News". */
        val extraChannels: String = "",
    )

    /**
     * One promotion: on sale from [start] to [end] (whole days, the device's time zone) at [price] for
     * [months], with its own [features]. A viewer who has it has the Promo package with these features.
     */
    data class Promo(
        val id: String,
        val name: String,
        val start: String,
        val end: String,
        val price: String,
        val months: Int,
        val features: Set<Plans.Feature>,
    ) {
        val length: String get() = if (months == 12) "1 year" else if (months == 1) "1 month" else "$months months"

        /** Whether today is between its start and end dates. */
        fun onSale(today: String = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(Date())): Boolean =
            (start.isBlank() || today >= start) && (end.isBlank() || today <= end)
    }

    /** Where the viewer's package comes from, for the packages screen and the end-date warning. */
    data class Status(
        val tier: Plans.Tier,
        /** When the paid package (or the free trial) ends; null for Free, or while packages are off. */
        val until: Date? = null,
        val trial: Boolean = false,
        /** The paid package that ended, when it ended in the last week. */
        val endedTier: Plans.Tier? = null,
        val endedAt: Date? = null,
        /** The promotion's name when the package is [Plans.Tier.Promo]. */
        val promoName: String? = null,
    ) {
        /** "Gold", or the promotion's name ("Christmas Sale"). */
        val label: String get() = promoName ?: tier.label
    }

    // Declared before _offer: Offer() reads it while this object starts, and a later one is still null then.
    val DEFAULT_PRICES: Map<Plans.Tier, Prices> = mapOf(
        Plans.Tier.Gold to Prices("$89.79", "$49.39", "$27.19", "$9.99"),
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

    /** Packages are on, and this viewer's package has 2 devices: their account works on two devices. */
    val twoDevices: Boolean get() = _offer.value.enforced && Plans.has(Plans.Feature.TwoDevices)

    private const val PREFS = "subscription"

    /** The last known package, so a start without internet keeps it. */
    fun init(context: Context) {
        if (Edition.MAX) return
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        // The owner's packages as last read; packages off (nothing saved) leaves everything open.
        if (p.contains("features_free")) {
            Plans.setFeatures(Plans.Tier.entries.associateWith { Plans.Feature.parse(p.getString("features_${it.name.lowercase()}", "") ?: "") })
        }
        Plans.setExtraChannels(p.getString("extra_channels", "") ?: "")
        p.getString("tier", null)?.let { name ->
            Plans.Tier.of(name)?.let { tier ->
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
            val promoDoc = getOrNull(Firestore.doc("config/promos"), t)?.optJSONObject("fields")
            val offer = parseOffer(config).copy(promos = parsePromos(promoDoc?.str("items").orEmpty()))
            _offer.value = offer
            var features = offer.features
            val now = Date()
            // The owner's admin account always has everything, whatever its package says (owner, 2026-10-08).
            val status = if (!offer.enforced || account.isAdmin) {
                Status(Plans.Tier.Gold)
            } else {
                val plan = getOrNull(Firestore.doc("plans/${u.uid}"), t)?.optJSONObject("fields")
                val paid = Plans.Tier.of(plan?.str("tier"))
                val paidUntil = plan?.time("until")
                val joined = getOrNull(Firestore.doc("users/${u.uid}"), t)?.optJSONObject("fields")?.time("joined") ?: now
                val trialEnd = Date(joined.time + offer.trialDays * 86_400_000L)
                // A promotion has its own features; one the owner has since deleted keeps the Promo defaults.
                val promo = if (paid == Plans.Tier.Promo) offer.promos.firstOrNull { it.id == plan?.str("promo") } else null
                if (promo != null) features = features + (Plans.Tier.Promo to promo.features)
                val promoName = if (paid == Plans.Tier.Promo) promo?.name ?: plan?.str("promoName")?.ifBlank { null } else null
                when {
                    paid != null && paid != Plans.Tier.Free && paidUntil != null && paidUntil.after(now) ->
                        Status(paid, paidUntil, promoName = promoName)
                    offer.trialDays > 0 && trialEnd.after(now) ->
                        Status(Plans.Tier.Gold, trialEnd, trial = true)
                    paid != null && paid != Plans.Tier.Free && paidUntil != null && now.time - paidUntil.time < 7 * 86_400_000L ->
                        Status(Plans.Tier.Free, endedTier = paid, endedAt = paidUntil)
                    else -> Status(Plans.Tier.Free)
                }
            }
            _status.value = status
            Plans.setFeatures(if (offer.enforced) features else null)
            Plans.setExtraChannels(offer.extraChannels)
            Plans.set(status.tier)
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
                putString("tier", status.tier.name)
                putString("extra_channels", offer.extraChannels)
                putLong("until", status.until?.time ?: 0L)
                Plans.Tier.entries.forEach { t ->
                    val key = "features_${t.name.lowercase()}"
                    if (offer.enforced) putString(key, features[t].orEmpty().joinToString(",") { it.key }) else remove(key)
                }
            }.apply()
        }
        Unit
    }

    /**
     * Uses a promo code the owner made on tv.bulkbazaar.ca/packages (promoCodes/{CODE}): the code's package for its
     * length, once per viewer. The Firestore rules only allow it in one save that also counts the code as used by them.
     * Returns what to tell the viewer.
     */
    suspend fun redeem(context: Context, account: Account, typed: String): String = withContext(Dispatchers.IO) {
        val u = account.user.value ?: return@withContext "Please sign in first."
        val code = typed.uppercase().filter { it.isLetterOrDigit() || it == '-' }
        if (code.length < 4) return@withContext "Type the promo code first."
        val t = account.token()
        val doc = getOrNull(Firestore.doc("promoCodes/$code"), t)
            ?: return@withContext "There's no promo code $code. Check the letters and numbers and try again."
        val f = doc.optJSONObject("fields") ?: JSONObject()
        fun int(k: String) = f.optJSONObject(k)?.optString("integerValue")?.toIntOrNull() ?: 0
        val tier = Plans.Tier.of(f.str("tier"))?.takeIf { it != Plans.Tier.Free }
            ?: return@withContext "This code isn't set up right. Please message us."
        val days = int("days")
        val usedBy = f.optJSONObject("usedBy")?.optJSONObject("mapValue")?.optJSONObject("fields") ?: JSONObject()
        when {
            f.optJSONObject("active")?.optBoolean("booleanValue", true) == false -> return@withContext "This promo code has been turned off."
            usedBy.has(u.uid) -> return@withContext "You've already used this promo code."
            int("used") >= int("uses") -> return@withContext "This promo code has been used up."
            days <= 0 -> return@withContext "This code isn't set up right. Please message us."
        }
        // The same package still running: the code's time comes after it ends, like a renewal.
        val plan = getOrNull(Firestore.doc("plans/${u.uid}"), t)?.optJSONObject("fields")
        val now = Date()
        val running = plan?.time("until")?.takeIf { Plans.Tier.of(plan.str("tier")) == tier && it.after(now) }
        val until = Date((running ?: now).time + days * 86_400_000L)
        usedBy.put(u.uid, JSONObject().put("mapValue", JSONObject().put("fields", Firestore.encode(mapOf("name" to u.name, "email" to u.email, "at" to now)))))
        val writes = JSONArray()
            .put(
                JSONObject()
                    .put(
                        "update",
                        JSONObject()
                            .put("name", Firestore.name("promoCodes/$code"))
                            .put(
                                "fields",
                                JSONObject()
                                    .put("used", JSONObject().put("integerValue", (int("used") + 1).toString()))
                                    .put("usedBy", JSONObject().put("mapValue", JSONObject().put("fields", usedBy))),
                            ),
                    )
                    .put("updateMask", JSONObject().put("fieldPaths", JSONArray().put("used").put("usedBy")))
                    // Someone else using it at the same moment: try again rather than count over the limit.
                    .put("currentDocument", JSONObject().put("updateTime", doc.optString("updateTime"))),
            )
            .put(
                JSONObject()
                    .put(
                        "update",
                        JSONObject()
                            .put("name", Firestore.name("plans/${u.uid}"))
                            .put("fields", Firestore.encode(mapOf("tier" to tier.name, "until" to until, "code" to code, "name" to u.name, "email" to u.email))),
                    )
                    .put("updateTransforms", JSONArray().put(JSONObject().put("fieldPath", "updated").put("setToServerValue", "REQUEST_TIME"))),
            )
        try {
            Firestore.commit(writes, t)
        } catch (e: Http.Status) {
            return@withContext if (e.code == 400 || e.code == 409 || e.code == 412) "Someone else used it at the same moment. Please try again."
            else "This promo code can't be used. Please message us."
        }
        refresh(context, account)
        "Done! You have ${tier.label} until ${java.text.DateFormat.getDateInstance(java.text.DateFormat.MEDIUM).format(until)}. Enjoy!"
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
            extraChannels = f.str("extra_channels").trim(),
            // "free_features" and so on: what the owner ticked; a package never saved keeps its default.
            features = Plans.Tier.entries.associateWith { t ->
                val key = "${t.name.lowercase()}_features"
                if (f.has(key)) Plans.Feature.parse(f.str(key)) else Plans.DEFAULT_FEATURES[t].orEmpty()
            },
        )
    }

    /** The promotions in config/promos "items": a JSON list the packages page writes. */
    private fun parsePromos(items: String): List<Promo> = runCatching {
        val list = org.json.JSONArray(items)
        (0 until list.length()).mapNotNull { i ->
            val o = list.optJSONObject(i) ?: return@mapNotNull null
            Promo(
                id = o.optString("id").ifBlank { return@mapNotNull null },
                name = o.optString("name").ifBlank { "Promotion" },
                start = o.optString("start"),
                end = o.optString("end"),
                price = o.optString("price"),
                months = o.optInt("months", 1).coerceIn(1, 24),
                features = Plans.Feature.parse(o.optString("features")),
            )
        }
    }.getOrDefault(emptyList())

    /** What [tier] has, in a line for the packages screen. */
    fun describe(tier: Plans.Tier): String = describe(_offer.value.features[tier].orEmpty())

    /** A line listing [ticked] (plus Free's features) for the packages screen. */
    fun describe(ticked: Set<Plans.Feature>): String {
        // Every package has at least what Free has (Plans.FREE_FEATURES).
        val has = ticked + Plans.FREE_FEATURES
        val extra = _offer.value.extraChannels
        val channels = when {
            Plans.Feature.AllChannels in has -> "All channels"
            extra.isNotBlank() -> "Our own Bazaar channels plus $extra"
            else -> "Only our own Bazaar channels"
        }
        val extras = Plans.Feature.entries.filter { it != Plans.Feature.AllChannels && it in has }.map { it.label }
        return "$channels. 1+List" + extras.joinToString("") { ", $it" } + ", full screen and favourites"
    }

    const val DEFAULT_HOW_TO_PAY =
        "Pick a package below and press Ask. We'll message you back here with how to pay " +
            "(Interac e-Transfer or card), and turn your package on as soon as it's paid. " +
            "Questions? WhatsApp 437 602 6500."
}
