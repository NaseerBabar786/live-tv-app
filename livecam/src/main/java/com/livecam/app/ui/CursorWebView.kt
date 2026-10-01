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

    /** What the last arrow press did, e.g. "moved in pop-up, 9 choices", for the status line. */
    var onNavResult: ((String) -> Unit)? = null

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
        evaluateJavascript("$NAV_JS(${dx}, ${dy})") { raw ->
            val result = raw?.trim('"')
            onNavResult?.invoke(if (result == null || result == "null") "arrow keys: no response from page" else result)
            when {
                result == null -> Unit
                result == "exitTop" -> {
                    evaluateJavascript(CLEAR_HIGHLIGHT_JS, null)
                    onExitTop?.invoke()
                }
                result?.startsWith("none") == true && dy != 0 -> {
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
(function(){ window.$HIGHLIGHT = null; var box = document.getElementById('$HIGHLIGHT'); if (box) box.remove(); })();
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
    // Material checkboxes hide the real <input> (opacity 0) over the drawn box; it still counts.
    return s.visibility !== 'hidden' && s.display !== 'none' && s.pointerEvents !== 'none' &&
      (parseFloat(s.opacity) > 0.05 || el.tagName === 'INPUT');
  }
  var found = Array.prototype.slice.call(document.querySelectorAll(SEL));
  var all = document.getElementsByTagName('*');
  for (var j = 0; j < all.length; j++) {
    var e = all[j];
    if (getComputedStyle(e).cursor === 'pointer' && found.indexOf(e) < 0) found.push(e);
  }
  found = found.filter(visible);
  // Something clickable that holds several other clickables is a container (a menu, a pop-up),
  // not a control: skip it. Of the rest, keep the outermost (a row, not the checkbox inside it).
  found = found.filter(function(e){
    var inside = 0;
    for (var k = 0; k < found.length && inside < 2; k++) if (found[k] !== e && e.contains(found[k])) inside++;
    return inside < 2;
  });
  var outer = found.filter(function(e){
    for (var p = e.parentElement; p; p = p.parentElement) if (found.indexOf(p) >= 0) return false;
    return true;
  });
  function center(e){ var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function onScreen(e){ var c = center(e); return c.x >= 0 && c.y >= 0 && c.x < innerWidth && c.y < innerHeight; }
  // Only things a tap would reach: an open pop-up covers the page with an invisible layer,
  // so whatever is under it can't be pressed and is skipped.
  function reachable(e){
    var c = center(e), h = document.elementFromPoint(c.x, c.y);
    return !!h && (h === e || e.contains(h) || h.contains(e));
  }
  function scrollers(e){
    var list = [];
    for (var p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      var o = getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) list.push(p);
    }
    return list;
  }
  var blocked = false, open = [], boxes = [];
  outer.forEach(function(e){
    if (!onScreen(e)) return;
    if (reachable(e)) { open.push(e); scrollers(e).forEach(function(b){ if (boxes.indexOf(b) < 0) boxes.push(b); }); }
    else blocked = true;
  });
  // Off-screen items count when they can be scrolled to: anywhere on a normal page, or inside
  // the same scrolling list as reachable items when a pop-up is open.
  var items = outer.filter(function(e){
    if (onScreen(e)) return open.indexOf(e) >= 0;
    if (!blocked) return true;
    return scrollers(e).some(function(b){ return boxes.indexOf(b) >= 0; });
  });
  var where = blocked ? ' in pop-up' : '';
  if (!items.length) return 'none' + where;
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
    if (!next) return (dy < 0 && !blocked) ? 'exitTop' : 'none' + where;
  }
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  window.$HIGHLIGHT = next;
  // Draw the highlight as a box on top of everything: an outline on the element itself gets
  // clipped by scrolling lists and pop-ups.
  var box = document.getElementById('$HIGHLIGHT');
  if (!box) {
    box = document.createElement('div');
    box.id = '$HIGHLIGHT';
    box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:4px solid #1DE9B6;' +
      'border-radius:8px;box-shadow:0 0 0 2px rgba(0,0,0,.6),0 0 12px #1DE9B6;transition:all .12s ease-out;';
    var place = function(){
      var el = window.$HIGHLIGHT;
      if (!el || !el.isConnected) { box.style.display = 'none'; return; }
      var r = el.getBoundingClientRect();
      box.style.display = 'block';
      box.style.left = (r.left - 6) + 'px';
      box.style.top = (r.top - 6) + 'px';
      box.style.width = (r.width + 4) + 'px';
      box.style.height = (r.height + 4) + 'px';
    };
    box.__place = place;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
  }
  document.documentElement.appendChild(box);
  box.__place();
  return 'moved' + where + ', ' + items.length + ' choices';
})
"""

