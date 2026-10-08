package com.livetv.app.account

import com.livetv.app.account.Firestore.num
import com.livetv.app.account.Firestore.str
import com.livetv.app.account.Firestore.time
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Date

/** What a viewer told us about paying for Cable TV, in Settings › My billing details. */
data class BillingInfo(
    val phone: String = "",
    val whatsapp: String = "",
    val wantPackage: String = "",
    val wantLength: String = "",
    val payMethod: String = "",
    val note: String = "",
    /** When the owner asked for these details from tv.bulkbazaar.ca/users (null if never). */
    val askedAt: Date? = null,
    val answeredAt: Date? = null,
    /** Free credit in dollars the owner gave on tv.bulkbazaar.ca/users; it comes off the next payment. */
    val credit: Double = 0.0,
    val creditNote: String = "",
) {
    /** The owner asked and the viewer hasn't answered since. */
    val waiting: Boolean get() = askedAt != null && (answeredAt == null || answeredAt.before(askedAt))
}

/**
 * The viewer's billing details, billingInfo/{uid}: only that viewer and the owner can read it.
 * The owner's own record of payments (billing/{uid}) is never read by the app.
 */
object Billing {
    val PACKAGES = listOf("Free", "Gold")
    val LENGTHS = listOf("1 month", "3 months", "6 months", "1 year")
    val METHODS = listOf("Interac e-Transfer", "Credit or debit card", "Cash", "Other")

    suspend fun load(account: Account): BillingInfo? = withContext(Dispatchers.IO) {
        val me = account.user.value ?: return@withContext null
        val f = runCatching { Firestore.get(Firestore.doc("billingInfo/${me.uid}"), account.token()) }
            .getOrElse { if (it is Http.Status && it.code == 404) return@withContext BillingInfo() else throw it }
            .optJSONObject("fields") ?: return@withContext BillingInfo()
        BillingInfo(
            phone = f.str("phone"),
            whatsapp = f.str("whatsapp"),
            wantPackage = f.str("wantPackage"),
            wantLength = f.str("wantLength"),
            payMethod = f.str("payMethod"),
            note = f.str("note"),
            askedAt = f.time("askedAt"),
            answeredAt = f.time("answeredAt"),
            credit = f.num("credit").coerceAtLeast(0.0),
            creditNote = f.str("creditNote"),
        )
    }

    /** Saves the viewer's answers (only these fields; the owner's request stays as it is). */
    suspend fun save(account: Account, info: BillingInfo) = withContext(Dispatchers.IO) {
        val me = account.user.value ?: error("Not signed in")
        Firestore.patch(
            Firestore.doc("billingInfo/${me.uid}"),
            mapOf(
                "uid" to me.uid,
                "name" to me.name.take(100),
                "email" to me.email.take(200),
                "phone" to info.phone.trim().take(30),
                "whatsapp" to info.whatsapp.trim().take(30),
                "wantPackage" to info.wantPackage,
                "wantLength" to info.wantLength,
                "payMethod" to info.payMethod,
                "note" to info.note.trim().take(500),
                "answeredAt" to Date(),
            ),
            account.token(),
        )
    }
}
