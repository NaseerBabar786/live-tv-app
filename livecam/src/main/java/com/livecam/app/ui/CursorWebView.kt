package com.livecam.app.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.SystemClock
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.webkit.WebView

/**
 * A WebView with a mouse-style pointer for TV remotes. Web pages like Wyze Web View
 * don't move between their buttons with the D-pad, so the arrow keys move the pointer
 * and OK taps whatever is under it. Pushing past the top or bottom edge scrolls the page.
 * Touch input works as usual; the pointer only appears once an arrow key is pressed.
 */
@SuppressLint("ViewConstructor")
class CursorWebView(context: Context) : WebView(context) {

    /**
     * Called when Up is pressed with the pointer at the top and the page can't scroll further,
     * so the screen can move focus to the controls above the page.
     */
    var onExitTop: (() -> Unit)? = null

    private val density = resources.displayMetrics.density
    private var cursorX = -1f
    private var cursorY = -1f
    private var cursorShown = false

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; style = Paint.Style.FILL }
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF1DE9B6.toInt()
        style = Paint.Style.STROKE
        strokeWidth = 3f * density
    }
    private val shadow = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x66000000; style = Paint.Style.FILL }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val dx: Int
        val dy: Int
        when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> { dx = -1; dy = 0 }
            KeyEvent.KEYCODE_DPAD_RIGHT -> { dx = 1; dy = 0 }
            KeyEvent.KEYCODE_DPAD_UP -> { dx = 0; dy = -1 }
            KeyEvent.KEYCODE_DPAD_DOWN -> { dx = 0; dy = 1 }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                if (!cursorShown) return super.dispatchKeyEvent(event)
                if (event.action == KeyEvent.ACTION_UP) tap()
                return true
            }
            else -> return super.dispatchKeyEvent(event)
        }
        if (event.action == KeyEvent.ACTION_DOWN) move(dx, dy, event.repeatCount)
        return true
    }

    private fun move(dx: Int, dy: Int, repeat: Int) {
        if (width == 0 || height == 0) return
        if (!cursorShown || cursorX < 0) {
            cursorX = width / 2f
            cursorY = height / 2f
            cursorShown = true
        }
        // Speeds up while the button is held.
        val step = (14f + 10f * repeat.coerceAtMost(6)) * density
        val margin = 4f * density
        val nx = cursorX + dx * step
        val ny = cursorY + dy * step
        val atTop = cursorY <= margin
        if (ny < margin && dy < 0) {
            scrollPage(-step) { scrolled ->
                // Up again at the very top of a page that no longer scrolls: leave the page.
                if (!scrolled && atTop) {
                    cursorShown = false
                    invalidate()
                    onExitTop?.invoke()
                }
            }
        }
        if (ny > height - margin && dy > 0) scrollPage(step)
        cursorX = nx.coerceIn(margin, width - margin)
        cursorY = ny.coerceIn(margin, height - margin)
        invalidate()
    }

    private fun scrollPage(amount: Float, onResult: ((Boolean) -> Unit)? = null) {
        // Screen pixels to CSS pixels, including the page zoom.
        @Suppress("DEPRECATION") val pageScale = scale.takeIf { it > 0f } ?: density
        val cssX = cursorX / pageScale
        val cssY = cursorY / pageScale
        val cssDy = amount / pageScale
        // Scrolls the page itself and, for pages that scroll an inner panel, the panel under the pointer.
        // Returns whether anything moved, so Up at the top can tell a page that's already at the top.
        evaluateJavascript(
            """
            (function(){
              var el = document.elementFromPoint($cssX, $cssY);
              while (el && el !== document.body) {
                var s = getComputedStyle(el).overflowY;
                if ((s === 'auto' || s === 'scroll') && el.scrollHeight > el.clientHeight) {
                  var before = el.scrollTop; el.scrollBy(0, $cssDy); return el.scrollTop !== before;
                }
                el = el.parentElement;
              }
              var y = window.scrollY; window.scrollBy(0, $cssDy); return window.scrollY !== y;
            })();
            """.trimIndent(),
        ) { result -> onResult?.invoke(result == "true") }
    }

    private fun tap() {
        val now = SystemClock.uptimeMillis()
        for (action in intArrayOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP)) {
            val e = MotionEvent.obtain(now, SystemClock.uptimeMillis(), action, cursorX, cursorY, 0)
            e.source = InputDevice.SOURCE_TOUCHSCREEN
            dispatchTouchEvent(e)
            e.recycle()
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        // A real touch hides the pointer; the synthetic taps above are marked as touchscreen too,
        // so only hide on a finger that isn't at the pointer.
        if (event.action == MotionEvent.ACTION_DOWN && (event.x != cursorX || event.y != cursorY)) {
            cursorShown = false
            invalidate()
        }
        return super.onTouchEvent(event)
    }

    override fun dispatchDraw(canvas: Canvas) {
        super.dispatchDraw(canvas)
        if (!cursorShown) return
        // The canvas is translated by the page scroll; draw in view coordinates.
        val x = scrollX + cursorX
        val y = scrollY + cursorY
        canvas.drawCircle(x + density, y + 2 * density, 11f * density, shadow)
        canvas.drawCircle(x, y, 10f * density, fill)
        canvas.drawCircle(x, y, 10f * density, ring)
    }
}
