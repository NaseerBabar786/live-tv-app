package com.livetv.app

/**
 * While a sponsor's card shows after a channel change, OK on the remote opens their website
 * instead of its usual job. Set by Free Live TV's card, null the rest of the time.
 */
object SponsorKey {
    @Volatile
    var onOk: (() -> Unit)? = null
}
