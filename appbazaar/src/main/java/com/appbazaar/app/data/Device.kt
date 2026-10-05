package com.appbazaar.app.data

import android.app.UiModeManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration

object Device {
    /** True on Google TV, Android TV and Fire TV. */
    fun isTv(ctx: Context): Boolean {
        val ui = ctx.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        return ui?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
            ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK) ||
            ctx.packageManager.hasSystemFeature("amazon.hardware.fire_tv")
    }
}
