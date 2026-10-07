package com.livetv.app

import androidx.compose.runtime.Composable

/** Iqra Quran is built into Cable TV only; the other apps have no Quran section. */
object QuranSection {
    const val AVAILABLE = false

    @Composable
    fun Screen(onClose: () -> Unit) = Unit
}
