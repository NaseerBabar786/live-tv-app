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
 * Live TV Plus Premium: a monthly Google Play subscription ([PRODUCT_ID], set up in Play
 * Console). Google ties it to the viewer's Google account, so it unlocks on every phone and
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
            details = list.productDetailsList.firstOrNull()
            _price.value = details?.subscriptionOfferDetails?.firstOrNull()
                ?.pricingPhases?.pricingPhaseList?.lastOrNull()?.formattedPrice
        }
    }

    override fun subscribe(activity: Activity) {
        val c = client ?: return
        if (!c.isReady) {
            connect()
            return
        }
        val product = details ?: run { loadDetails(); return }
        val offer = product.subscriptionOfferDetails?.firstOrNull() ?: return
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
