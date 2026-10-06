package com.livetv.app.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.livetv.app.Premium
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Live TV Plus Premium: a Google Play subscription ([PRODUCT_ID], set up in Play Console) with
 * one base plan per length: 1 year, 6 months, 3 months and 1 month ($1.99). The viewer picks one. Google ties it to the viewer's Google account, so it unlocks on every phone and
 * TV signed in to that account. The last answer is remembered so Premium works offline.
 */
object PlayBilling : Premium.Billing {
    const val PRODUCT_ID = "premium_monthly"
    private const val PREFS = "premium"
    private const val KEY_ACTIVE = "active"

    private lateinit var appContext: Context
    private var client: BillingClient? = null
    private var details: ProductDetails? = null
    private val _price = MutableStateFlow<String?>(null)
    override val price: StateFlow<String?> = _price
    private var offers: List<ProductDetails.SubscriptionOfferDetails> = emptyList()
    private val _options = MutableStateFlow<List<Premium.Option>>(emptyList())
    override val options: StateFlow<List<Premium.Option>> = _options

    /** Called once when the app starts. */
    fun start(context: Context) {
        if (client != null) return
        appContext = context.applicationContext
        val saved = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ACTIVE, false)
        Premium.install(this, saved)
        client = BillingClient.newBuilder(appContext)
            .setListener { result, purchases -> if (result.ok) purchases?.let(::handle) }
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build()
        connect()
    }

    private fun connect() {
        client?.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (!result.ok) return
                refresh()
                loadDetails()
            }

            override fun onBillingServiceDisconnected() = Unit // reconnects on the next subscribe()
        })
    }

    /** Asks Google Play which subscriptions this account has (also restores Premium on a new device). */
    private fun refresh() {
        val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
        client?.queryPurchasesAsync(params) { result, purchases ->
            if (result.ok) {
                setActive(purchases.any { it.isPremium && it.purchaseState == Purchase.PurchaseState.PURCHASED })
                purchases.forEach(::acknowledge)
            }
        }
    }

    private fun loadDetails() {
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(PRODUCT_ID)
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
        client?.queryProductDetailsAsync(params) { result, list ->
            if (!result.ok) return@queryProductDetailsAsync
            details = list.firstOrNull()
            // One offer per base plan (the plain base plan, not promotions), longest (best value) first.
            offers = details?.subscriptionOfferDetails.orEmpty()
                .filter { it.offerId == null }
                .ifEmpty { details?.subscriptionOfferDetails.orEmpty() }
                .distinctBy { it.basePlanId }
                .sortedByDescending { months(it.lastPhase?.billingPeriod) }
            _options.value = offers.mapNotNull { o ->
                o.lastPhase?.let { Premium.Option(label(it.billingPeriod), it.formattedPrice) }
            }
            _price.value = (offers.firstOrNull { months(it.lastPhase?.billingPeriod) == 1 } ?: offers.firstOrNull())
                ?.lastPhase?.formattedPrice
        }
    }

    private val ProductDetails.SubscriptionOfferDetails.lastPhase
        get() = pricingPhases.pricingPhaseList.lastOrNull()

    /** An ISO 8601 period such as "P1M", "P6M" or "P1Y", in months. */
    private fun months(period: String?): Int {
        val m = Regex("P(?:(\\d+)Y)?(?:(\\d+)M)?(?:(\\d+)W)?").matchEntire(period ?: return 99) ?: return 99
        val (y, mo, w) = m.destructured
        return (y.toIntOrNull() ?: 0) * 12 + (mo.toIntOrNull() ?: 0) + if (w.isNotEmpty()) 1 else 0
    }

    private fun label(period: String): String = when (val m = months(period)) {
        1 -> "1 month"
        12 -> "1 year"
        else -> if (m % 12 == 0) "${m / 12} years" else "$m months"
    }

    override fun subscribe(activity: Activity, option: Int) {
        val c = client ?: return
        if (!c.isReady) {
            connect()
            return
        }
        val product = details ?: run { loadDetails(); return }
        val offer = offers.getOrNull(option) ?: product.subscriptionOfferDetails?.firstOrNull() ?: return
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(product)
                        .setOfferToken(offer.offerToken)
                        .build()
                )
            )
            .build()
        c.launchBillingFlow(activity, params)
    }

    private fun handle(purchases: List<Purchase>) {
        purchases.filter { it.isPremium }.forEach { purchase ->
            if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                setActive(true)
                acknowledge(purchase)
            }
        }
    }

    /** Google refunds a purchase that isn't acknowledged within 3 days. */
    private fun acknowledge(purchase: Purchase) {
        if (!purchase.isPremium || purchase.purchaseState != Purchase.PurchaseState.PURCHASED || purchase.isAcknowledged) return
        val params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()
        client?.acknowledgePurchase(params) { }
    }

    private fun setActive(active: Boolean) {
        Premium.setActive(active)
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ACTIVE, active).apply()
    }

    private val Purchase.isPremium get() = PRODUCT_ID in products
    private val BillingResult.ok get() = responseCode == BillingClient.BillingResponseCode.OK
}
