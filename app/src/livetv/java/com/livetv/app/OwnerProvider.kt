package com.livetv.app

import android.content.ContentProvider
import android.content.ContentValues
import android.content.pm.PackageManager
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import com.livetv.app.data.OwnerTest

/**
 * Tells our other apps (Quran, Live Cam, Multi Chat, Notes, App Bazaar) whether this device belongs to the
 * owner, so they show the owner's "Try test version" button without any setup. One row, column "owner" = 1 or 0.
 * Only apps signed with our own key get an answer.
 */
class OwnerProvider : ContentProvider() {

    override fun onCreate() = true

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? {
        val context = context ?: return null
        val caller = callingPackage ?: return null
        if (context.packageManager.checkSignatures(context.packageName, caller) != PackageManager.SIGNATURE_MATCH) return null
        return MatrixCursor(arrayOf("owner")).apply { addRow(arrayOf(if (OwnerTest.isOwner(context)) 1 else 0)) }
    }

    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0
}
