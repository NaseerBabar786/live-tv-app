package com.livetv.app.account

import org.junit.Assert.assertEquals
import org.junit.Test

class SubscriptionTest {
    /** 1.9.34-1.9.39 crashed at start: the first offer was made before its default prices existed. */
    @Test
    fun startsWithDefaultPrices() {
        assertEquals(Subscription.DEFAULT_PRICES, Subscription.offer.value.prices)
        assertEquals(3, Subscription.offer.value.prices.size)
    }
}
