// The keyboard as the TV remote: arrows move the highlight, Enter is OK, Esc or Backspace is Back,
// Page Up/Down change channel, and the number keys type a channel number. Holding Enter (or a right
// click) is the remote's long press on OK. Each screen or box puts a layer on top while it shows;
// the top layer gets the keys first.

const layers = [];

/** Puts a layer on top: [handler](key, event) returns true when it used the key. Returns a remover. */
export function push(root, handler) {
  const layer = { root, handler };
  layers.push(layer);
  return () => {
    const i = layers.indexOf(layer);
    if (i >= 0) layers.splice(i, 1);
  };
}

const top = () => layers[layers.length - 1];

export function focus(el) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

const visible = (el) => {
  if (el.disabled || el.closest('.hidden')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/** The focusable things in [root]. */
export const focusables = (root) => [...root.querySelectorAll('[data-focus]')].filter(visible);

/** Moves the highlight to the nearest thing in [dir] inside [root]; false when there is none. */
export function move(root, dir) {
  const items = focusables(root);
  const cur = document.activeElement;
  if (!items.includes(cur)) { if (items[0]) focus(items[0]); return !!items[0]; }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    let main, side;
    if (dir === 'left') { if (b.right > a.left + 1) continue; main = -dx; side = Math.abs(dy); }
    else if (dir === 'right') { if (b.left < a.right - 1) continue; main = dx; side = Math.abs(dy); }
    else if (dir === 'up') { if (b.bottom > a.top + 1) continue; main = -dy; side = Math.abs(dx); }
    else { if (b.top < a.bottom - 1) continue; main = dy; side = Math.abs(dx); }
    const score = main + side * 2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) focus(best);
  return !!best;
}

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', NumpadEnter: 'ok',
  Escape: 'back', Backspace: 'back', BrowserBack: 'back', PageUp: 'chup', PageDown: 'chdown', F11: 'fullscreen',
  MediaTrackNext: 'chup', MediaTrackPrevious: 'chdown',
};

let okDownAt = 0;
let okHeld = false;

/** Runs [key] through the layers, top first; the default moves the highlight and clicks on OK. */
export function dispatch(key, event = {}) {
  const layer = top();
  if (!layer) return false;
  if (layer.handler && layer.handler(key, event)) return true;
  if (['up', 'down', 'left', 'right'].includes(key)) { move(layer.root, key); return true; }
  if (key === 'ok') {
    const el = document.activeElement;
    if (el && layer.root.contains(el) && el.matches('[data-focus]')) { el.click(); return true; }
  }
  return false;
}

function typing(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !['ArrowUp', 'ArrowDown', 'Escape', 'Enter', 'PageUp', 'PageDown'].includes(e.key);
}

export function install() {
  document.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    let key = KEYMAP[e.key];
    if (/^[0-9]$/.test(e.key) && !(e.target && e.target.tagName === 'INPUT')) key = `digit:${e.key}`;
    if (e.key === 'f' || e.key === 'F') { if (!(e.target && e.target.tagName === 'INPUT')) key = 'fullscreen'; }
    if (e.key === 'Backspace' && e.target && e.target.tagName === 'INPUT') return;
    if (!key) return;
    if (key === 'ok') {
      // OK is acted on when let go, so holding it can mean "long press".
      e.preventDefault();
      if (!e.repeat) { okDownAt = Date.now(); okHeld = false; }
      else if (!okHeld && Date.now() - okDownAt > 600) { okHeld = true; dispatch('okhold', e); }
      return;
    }
    if (dispatch(key, e)) e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    if (KEYMAP[e.key] !== 'ok' || typing(e)) return;
    if (okDownAt && !okHeld) dispatch('ok', e);
    okDownAt = 0;
    okHeld = false;
  });
  // Right click is the long press on OK.
  document.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('[data-focus]');
    if (!el) return;
    e.preventDefault();
    focus(el);
    dispatch('okhold', e);
  });
  // Keys pressed on one of our YouTube pages (<webview>) come here too.
  window.pc?.on('web-key', ({ key }) => {
    let k = KEYMAP[key];
    if (/^[0-9]$/.test(key)) k = `digit:${key}`;
    if (key === 'f' || key === 'F') k = 'fullscreen';
    if (k) dispatch(k, {});
  });
}
