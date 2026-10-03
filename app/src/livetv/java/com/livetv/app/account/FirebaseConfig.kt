package com.livetv.app.account

import com.livetv.app.BuildConfig

/**
 * The owner's Firebase project. These values are public by design: they ship inside the app
 * and the website; what users can read and write is decided by the Firestore rules.
 */
object FirebaseConfig {
    const val API_KEY = "AIzaSyAukJcRHwIV_W3TKtr3_5XiVJZe-7491KE"
    const val PROJECT_ID = "live-tv-b2164"
    /** The "Web client (auto created by Google Service)" OAuth client: the phone account picker. */
    const val WEB_CLIENT_ID = "18909235292-gh3ggkmcpffsfc8cfnuj9re74cq8uovp.apps.googleusercontent.com"
    /** The "TVs and Limited Input devices" OAuth client: the code shown on TVs. */
    const val TV_CLIENT_ID = "18909235292-g5q34838eh2aqu56jra9600dh1r3c2st.apps.googleusercontent.com"
    /** Added at build time from the TV_CLIENT_SECRET repository secret (empty in local builds). */
    val TV_CLIENT_SECRET: String get() = BuildConfig.TV_CLIENT_SECRET
    /** Sees every user and can delete any Suggestions post (also set in the Firestore rules). */
    const val ADMIN_EMAIL = "naseerahmadbabar@gmail.com"

    /** Sign-in is required only once the project is set up (TVs can't sign in without the secret). */
    val configured: Boolean get() = API_KEY.isNotEmpty() && PROJECT_ID.isNotEmpty() && TV_CLIENT_SECRET.isNotEmpty()
}
