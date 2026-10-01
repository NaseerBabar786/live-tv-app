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
 * A WebView for TV remotes. Web pages like Wyze Web View don't move between their buttons with
 * the D-pad, so by default the arrow keys jump between the page's buttons, links and checkboxes
 * (the one in that direction that's nearest), highlighting it, and OK presses it. In [pointerMode]
 * the arrow keys move a mouse-style pointer instead and OK taps whatever is under it; pushing past
 * the top or bottom edge scrolls the page. Touch input works as usual.
 */
@SuppressLint("ViewConstructor")
class CursorWebView(context: Context) : WebView(context) {

    /**
     * Called when Up is pressed with the pointer at the top and the page can't scroll further,
     * so the screen can move focus to the controls above the page.
     */
    var onExitTop: (() -> Unit)? = null

    /** False: arrow keys jump between buttons. True: arrow keys move a free pointer. */
    var pointerMode = false
        set(value) {
            field = value
            cursorShown = false
            evaluateJavascript(CLEAR_HIGHLIGHT_JS, null)
            invalidate()
        }

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
                if (!pointerMode) {
                    if (event.action == KeyEvent.ACTION_UP) pressHighlighted()
                    return true
                }
                if (!cursorShown) return super.dispatchKeyEvent(event)
                if (event.action == KeyEvent.ACTION_UP) tap()
                return true
            }
            else -> return super.dispatchKeyEvent(event)
        }
        if (event.action == KeyEvent.ACTION_DOWN) {
            if (pointerMode) move(dx, dy, event.repeatCount) else jump(dx, dy)
        }
        return true
    }

    /** Highlights the nearest button in the direction pressed; Up with nothing above leaves the page. */
    private fun jump(dx: Int, dy: Int) {
        evaluateJavascript("$NAV_JS(${dx}, ${dy})") { result ->
            when (result?.trim('"')) {
                "exitTop" -> {
                    evaluateJavascript(CLEAR_HIGHLIGHT_JS, null)
                    onExitTop?.invoke()
                }
                "none" -> if (dy != 0) {
                    cursorX = width / 2f
                    cursorY = height / 2f
                    scrollPage(dy * height / 3f)
                }
            }
        }
    }

    /** Taps the middle of the highlighted button, the way a finger would. */
    private fun pressHighlighted() {
        evaluateJavascript(CENTER_JS) { result ->
            val parts = result?.trim('"')?.split(',')?.mapNotNull { it.toFloatOrNull() }
            if (parts == null || parts.size != 2) return@evaluateJavascript
            @Suppress("DEPRECATION") val pageScale = scale.takeIf { it > 0f } ?: density
            cursorX = parts[0] * pageScale
            cursorY = parts[1] * pageScale
            tap()
        }
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

private const val HIGHLIGHT = "__liveCamFocus"

private const val CLEAR_HIGHLIGHT_JS = """
(function(){ var el = window.$HIGHLIGHT; if (el) { el.style.outline = el.__lcOutline || ''; el.style.outlineOffset = el.__lcOffset || ''; } window.$HIGHLIGHT = null; })();
"""

/** Center of the highlighted element in CSS pixels, as "x,y", or "" when nothing is highlighted. */
private const val CENTER_JS = """
(function(){
  var el = window.$HIGHLIGHT;
  if (!el || !el.isConnected) return '';
  var r = el.getBoundingClientRect();
  return (r.left + r.width / 2) + ',' + (r.top + r.height / 2);
})();
"""

/**
 * Moves the highlight to the nearest clickable thing in direction (dx, dy). Only looks inside an
 * open pop-up or menu when there is one. Returns "moved", "none" (nothing that way) or "exitTop".
 */
private const val NAV_JS = """
(function(dx, dy){
  var SEL = 'a[href],button,input:not([type=hidden]),select,textarea,label,summary,video,[role=button],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=link],[role=menuitem],[role=menuitemcheckbox],[role=option],[tabindex]:not([tabindex="-1"])';
  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return false;
    var s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.pointerEvents !== 'none' && parseFloat(s.opacity) > 0.05;
  }
  var root = document;
  var layers = document.querySelectorAll('.MuiModal-root:not(.MuiModal-hidden),[role=dialog],[aria-modal=true],[role=menu],[role=listbox]');
  for (var i = layers.length - 1; i >= 0; i--) if (visible(layers[i])) { root = layers[i]; break; }
  var found = Array.prototype.slice.call(root.querySelectorAll(SEL));
  var all = document.getElementsByTagName('*');
  for (var j = 0; j < all.length; j++) {
    var e = all[j];
    if ((root === document || root.contains(e)) && getComputedStyle(e).cursor === 'pointer' && found.indexOf(e) < 0) found.push(e);
  }
  found = found.filter(visible);
  // Keep the outermost of nested clickables (a row, not the checkbox inside it).
  var items = found.filter(function(e){
    for (var p = e.parentElement; p; p = p.parentElement) if (found.indexOf(p) >= 0) return false;
    return true;
  });
  if (!items.length) return 'none';
  function center(e){ var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  var cur = window.$HIGHLIGHT;
  var next = null;
  if (!cur || !cur.isConnected || items.indexOf(cur) < 0) {
    var best = 1e12;
    items.forEach(function(e){
      var c = center(e);
      if (c.y < 0 || c.y > innerHeight) return;
      var d = c.y * 4 + c.x;
      if (d < best) { best = d; next = e; }
    });
    next = next || items[0];
  } else {
    var a = center(cur), bestScore = 1e12;
    items.forEach(function(e){
      if (e === cur) return;
      var c = center(e), along = (c.x - a.x) * dx + (c.y - a.y) * dy;
      var across = Math.abs((c.x - a.x) * dy) + Math.abs((c.y - a.y) * dx);
      if (along < 4) return;
      var score = along + across * 2;
      if (score < bestScore) { bestScore = score; next = e; }
    });
    if (!next) return (dy < 0 && root === document) ? 'exitTop' : 'none';
  }
  if (cur && cur.isConnected) { cur.style.outline = cur.__lcOutline || ''; cur.style.outlineOffset = cur.__lcOffset || ''; }
  next.__lcOutline = next.style.outline;
  next.__lcOffset = next.style.outlineOffset;
  next.style.outline = '4px solid #1DE9B6';
  next.style.outlineOffset = '2px';
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  window.$HIGHLIGHT = next;
  return 'moved';
})
"""

