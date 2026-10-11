package com.livetv.app

/**
 * Spark Weather's answers to what Cable TV's weather files ask about the app they are in (Cable TV has
 * one Edition per flavor). Only what those files use.
 */
object Edition {
    /** Phones ask once for the approximate location, for the weather where the viewer is. */
    const val HAS_DEVICE_LOCATION = true
    const val USER_AGENT = "SparkWeather-Android/1.0"
}
