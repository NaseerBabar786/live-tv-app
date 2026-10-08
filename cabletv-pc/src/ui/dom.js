// Building the screens: a small element helper, the toast line and the boxes that ask a question.
import * as nav from './nav.js';

/** An element: h('div.class#id', { attrs, on: { click } }, ...children). */
export function h(spec, attrs = {}, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    children.unshift(attrs);
    attrs = {};
  }
  const [, tag = 'div', rest = ''] = /^([a-z0-9-]*)(.*)$/i.exec(spec);
  const el = document.createElement(tag || 'div');
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'focus') el.setAttribute('data-focus', ''), el.tabIndex = -1;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** A focusable button. */
export const button = (label, onClick, cls = '') => h(`button.btn${cls ? '.' + cls : ''}`, { focus: true, on: { click: onClick } }, label);

let toastTimer = null;
export function toast(text, ms = 3500) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

/**
 * A box over the screen with [title], [body] (text or elements) and [buttons] ([label, fn, keepOpen]).
 * [focusIndex] picks the button highlighted first. Back closes it. Returns a closer.
 */
export function dialog({ title, body, buttons = [], focusIndex = 0, onClose, wide = false }) {
  const prev = document.activeElement;
  const btns = buttons.map(([label, fn, keep]) => button(label, () => { if (!keep) close(); fn && fn(); }));
  const box = h(`div.dialog${wide ? '.wide' : ''}`, h('h2', title || ''),
    typeof body === 'string' ? h('p', body) : body, btns.length ? h('div.dialog-buttons', btns) : null);
  const scrim = h('div.scrim', box);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
  let closed = false;
  const pop = nav.push(box, (key) => {
    if (key === 'back') { close(); return true; }
    return false;
  });
  nav.focus(btns[focusIndex] || nav.focusables(box)[0]);
  function close() {
    if (closed) return;
    closed = true;
    pop();
    scrim.remove();
    if (prev && document.contains(prev)) nav.focus(prev);
    onClose && onClose();
  }
  return close;
}
