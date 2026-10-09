package androidx.compose.ui.platform
import androidx.compose.runtime.staticCompositionLocalOf
class Conf(val screenWidthDp: Int)
val LocalConfiguration = staticCompositionLocalOf { Conf(1000) }
