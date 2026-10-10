package com.livetv.app.extras

import androidx.compose.runtime.Composable
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/**
 * Shows [content] in its own full-screen window, above everything in NextGen Cable. Ad breaks in 1+List draw their
 * video above the app's own screen, so "Who's watching?" was hidden behind a playing ad (emulator, 2026-10-09).
 */
@Composable
internal fun OnTop(onBack: () -> Unit, content: @Composable () -> Unit) {
    Dialog(
        onDismissRequest = onBack,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false, decorFitsSystemWindows = false),
        content = content,
    )
}
