// A channel full screen (PlayerScreen.kt): the channel bar for 10 seconds, then only the number in the
// corner for 5 minutes; Up/Down (or Page Up/Down) change channel, number keys type one (it goes after
// 2 seconds), 123 opens a number pad, OK with the bar hidden just brings it back. Live channels fill
// the screen. Our own channels get their logo, clock, line and "Up next" cards; the others get the
// "advertise with us" line every 2 minutes and the ad break every 10 minutes.
import { h, button, toast } from '../dom.js';
import * as nav from '../nav.js';
import * as channels from '../channels.js';
import * as mine from '../mychannel.js';
import * as plans from '../plans.js';
import * as watching from '../watching.js';
import * as ads from '../ads.js';
import { createPlayer } from '../player.js';
import { mountCards } from '../shared/cards.js';

let tipShown = false;

/** Opens [first] full screen; [onClose](channel) when Back leaves. */
export function openFull(first, onClose) {
  let ch = first;
  const stage = h('div.full');
  const bar = h('div.fbar');
  const numberCorner = h('div.fnumber.hidden');
  const typedBox = h('div.ftyped.hidden');
  const tipBox = h('div.ftip.hidden');
  const errBox = h('div.ferror.hidden');
  const pad = h('div.fpad.hidden');
  const band = h('div.tickerband.full-band');
  const bug = h('img.bug.hidden#bug', { alt: '' });
  const ownTicker = h('div.ownticker.hidden', h('span'));
  stage.append(bug, ownTicker, numberCorner, typedBox, tipBox, band, bar, pad, errBox);
  document.getElementById('app').appendChild(stage);
  window.pc?.fullscreen(true);

  const player = createPlayer(stage, { muted: false });
  stage.insertBefore(player.element, stage.firstChild);
  player.element.classList.add('stretch');
  player.onError = (msg) => {
    errBox.innerHTML = '';
    errBox.classList.toggle('hidden', !msg);
    if (msg) {
      const again = button('Try again', () => player.retry());
      errBox.append(h('p', msg), again);
      nav.focus(again);
    }
  };

  // ---------- The channel bar ----------
  let barTimer = null, numberTimer = null;
  let barShown = true;
  function renderBar() {
    const fav = channels.state.favorites.has(ch.url);
    bar.innerHTML = '';
    bar.append(...[
      button('←', close, 'icon'),
      h('div.ftitle', h('div.fname', ch.number > 0 ? `${ch.number}  ${ch.name}` : ch.name), ch.group ? h('div.fgroup', ch.group) : null),
      button('123', () => openPad(), 'text'),
      mine.isMine(ch) ? null : button(fav ? '★' : '☆', () => {
        const msg = channels.toggleFavorite(ch);
        if (msg) toast(msg);
        renderBar();
        showBar();
      }, `icon${fav ? '.fav' : ''}`),
    ].filter(Boolean));
  }
  function showBar() {
    barShown = true;
    bar.classList.remove('hidden');
    numberCorner.classList.add('hidden');
    clearTimeout(barTimer);
    clearTimeout(numberTimer);
    if (!pad.classList.contains('hidden')) return;
    barTimer = setTimeout(() => {
      barShown = false;
      bar.classList.add('hidden');
      if (bar.contains(document.activeElement)) stage.focus();
      if (ch.number > 0) {
        numberCorner.textContent = String(ch.number);
        numberCorner.classList.remove('hidden');
        numberTimer = setTimeout(() => numberCorner.classList.add('hidden'), 5 * 60000);
      }
    }, 10000);
  }

  // ---------- Our channels' logo, line and cards ----------
  function renderOverlay() {
    const c = mine.configOf(ch);
    const web = player.isWeb();
    const corner = (c && c.logoCorner) || 'tr';
    const showBug = c && c.logo && corner !== 'off' && !web;
    if (showBug) bug.src = c.logo;
    bug.className = `bug ${corner}${showBug ? '' : ' hidden'}`;
    const words = c && !web && c.tickerOn !== false && String(c.ticker || '').trim();
    ownTicker.classList.toggle('hidden', !words);
    ownTicker.firstChild.textContent = words || '';
  }
  const cardsTimer = mountCards(stage, () => (player.isWeb() ? null : mine.configOf(ch)));
  const unsubMine = mine.onChange(renderOverlay);

  // ---------- Changing channel ----------
  function play(next) {
    if (!next) return;
    if (!plans.allowsChannel(next)) { plans.ask(next.name, 'channels'); return; }
    ch = next;
    channels.watched(ch);
    player.play(ch);
    watching.watch(player, ch);
    renderBar();
    showBar();
    renderOverlay();
    ads.channelChanged(ch);
  }

  let typed = '', typedTimer = null;
  function digit(d) {
    if (typed.length >= 8) return;
    typed += d;
    typedBox.textContent = typed;
    typedBox.classList.remove('hidden');
    clearTimeout(typedTimer);
    typedTimer = setTimeout(goTyped, 2000);
    showBar();
  }
  function goTyped() {
    clearTimeout(typedTimer);
    const t = typed;
    typed = '';
    typedBox.classList.add('hidden');
    if (!t) return;
    const target = channels.byNumber(t);
    if (target) play(target);
    else toast(`There's no channel ${t}.`);
  }

  function openPad() {
    pad.innerHTML = '';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'Go'];
    const btns = keys.map((k) => button(k, () => {
      if (k === '⌫') { typed = typed.slice(0, -1); typedBox.textContent = typed; typedBox.classList.toggle('hidden', !typed); clearTimeout(typedTimer); if (typed) typedTimer = setTimeout(goTyped, 2000); }
      else if (k === 'Go') { goTyped(); closePad(); }
      else digit(k);
    }, 'pad'));
    pad.append(...btns);
    pad.classList.remove('hidden');
    showBar();
    nav.focus(btns[0]);
  }
  function closePad() {
    pad.classList.add('hidden');
    showBar();
    stage.focus();
  }

  // ---------- Keys ----------
  stage.tabIndex = -1;
  const pop = nav.push(stage, (key) => {
    if (!pad.classList.contains('hidden')) {
      if (key === 'back') { closePad(); return true; }
      if (key.startsWith('digit:')) { digit(key.slice(6)); return true; }
      return false;
    }
    if (key === 'back') { if (typed) { typed = ''; typedBox.classList.add('hidden'); return true; } close(); return true; }
    if (key === 'fullscreen') { window.pc?.fullscreen('toggle'); return true; }
    if (key.startsWith('digit:')) { digit(key.slice(6)); return true; }
    if (key === 'chup' || (key === 'up' && !barHasFocus())) { play(channels.next(ch, -1)); return true; }
    if (key === 'chdown' || (key === 'down' && !barHasFocus())) { play(channels.next(ch, 1)); return true; }
    if (key === 'ok') {
      if (!errBox.classList.contains('hidden') && errBox.contains(document.activeElement)) return false;
      if (!barShown || !bar.contains(document.activeElement)) {
        showBar();
        const first = nav.focusables(bar)[0];
        if (first) nav.focus(first);
        return true;
      }
      return false;
    }
    if (key === 'left' || key === 'right') {
      if (!barShown) { showBar(); }
      if (!bar.contains(document.activeElement)) { nav.focus(nav.focusables(bar)[0]); return true; }
      return false;
    }
    if (key === 'okhold') {
      const msg = mine.isMine(ch) ? null : channels.toggleFavorite(ch);
      if (msg) toast(msg); else if (!mine.isMine(ch)) toast(channels.state.favorites.has(ch.url) ? `${ch.name} added to Favorites` : `${ch.name} removed from Favorites`);
      renderBar();
      return true;
    }
    return false;
  });
  const barHasFocus = () => bar.contains(document.activeElement) && barShown;
  // The mouse brings the bar back too.
  let lastMove = 0;
  stage.addEventListener('mousemove', () => {
    if (Date.now() - lastMove < 500) return;
    lastMove = Date.now();
    if (!barShown) showBar();
  });
  stage.addEventListener('dblclick', (e) => { if (e.target === stage || e.target.tagName === 'VIDEO') window.pc?.fullscreen('toggle'); });
  stage.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > 30) play(channels.next(ch, e.deltaY > 0 ? 1 : -1)); }, { passive: true });

  // ---------- The "advertise with us" line and the ad breaks ----------
  const stopTicker = ads.ticker(band, {
    everyMs: 2 * 60000,
    skip: () => barShown || typed || !pad.classList.contains('hidden') || !tipBox.classList.contains('hidden') ||
      !errBox.classList.contains('hidden') || ads.breakOn() || mine.hasTicker(ch) || player.isWeb(),
  });
  ads.attach(stage, { full: true, player });

  // The favourites reminder, once per start, until there are 6.
  if (!tipShown) {
    tipShown = true;
    if (channels.state.favorites.size < 6) {
      tipBox.textContent = 'Save at least 6 channels in Favourites. Press ☆ at the top of this screen, or hold Enter (or right click) on a channel in the list.';
      tipBox.classList.remove('hidden');
      setTimeout(() => tipBox.classList.add('hidden'), 10000);
    }
  }

  play(first);
  stage.focus();

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(barTimer); clearTimeout(numberTimer); clearTimeout(typedTimer);
    stopTicker();
    clearInterval(cardsTimer);
    ads.detach(stage);
    unsubMine();
    watching.stop(player);
    player.destroy();
    pop();
    stage.remove();
    window.pc?.fullscreen(false);
    onClose && onClose(ch);
  }
  return { close, channel: () => ch };
}
