package com.livetv.app.account

/**
 * The owner's Firebase project. These values are public by design: they ship inside the app
 * and the website; what users can read and write is decided by the Firestore rules.
 */
object FirebaseConfig {
    const val API_KEY = ""
    const val PROJECT_ID = ""
    /** The "Web client (auto created by Google Service)" OAuth client: the phone account picker. */
    const val WEB_CLIENT_ID = ""
    /** The "TVs and Limited Input devices" OAuth client: the code shown on TVs. */
    const val TV_CLIENT_ID = ""
    const val TV_CLIENT_SECRET = ""
    /** Sees every user and can delete any Suggestions post (also set in the Firestore rules). */
    const val ADMIN_EMAIL = ""

    /** Sign-in is required only once the project is set up. */
    val configured: Boolean get() = API_KEY.isNotEmpty() && PROJECT_ID.isNotEmpty()
}
