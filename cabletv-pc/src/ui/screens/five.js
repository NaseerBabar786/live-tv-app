// 1+3: the big picture top left (85% wide, the only one with sound) and three small tiles on the right,
// each a third of its height. Up/Down move through the three; past either end a new channel slides
// in. OK on a small tile swaps it into the big picture; OK on the big picture opens it full screen.
// Down from the big picture reaches "Add to Favorites". The big picture comes first: when it drops
// frames, the small tiles stop on their last picture one by one, and carry on after 10 smooth seconds.
import { h, toast } from '../dom.js';
import * as nav from '../nav.js';
import * as channels from '../channels.js';
import * as plans from '../plans.js';
import * as watching from '../watching.js';
import * as ads from '../ads.js';
import { createPlayer } from '../player.js';
import { tileLabel, favoriteMenu } from './common.js';

const session = { ids: [] };

export function fiveMode(ctx) {
  const el = h('div.five');
  const bigBox = h('div.five-big', { focus: true });
  const star = h('div.five-star.hidden', '★');
  const favBtn = h('button.btn.favbtn', { focus: true }, '☆  Add to Favorites');
  const left = h('div.five-left', bigBox, favBtn);
  const column = h('div.five-col');
  el.append(left, column);
  ctx.content.appendChild(el);
  const big = { box: bigBox, player: createPlayer(bigBox, { muted: !ctx.sound() }), ch: null, label: null };
  big.player.element.classList.add('stretch');
  bigBox.append(star);
  const small = [];

  function allowed() { return channels.visibleChannels().filter(plans.allowsChannel); }

  function setBig(ch) {
    big.ch = ch;
    big.player.play(ch);
    if (big.label) big.label.remove();
    big.label = tileLabel(ch);
    bigBox.appendChild(big.label);
    watching.watch(big.player, ch);
    channels.watched(ch);
    renderFav();
  }
  function setSmall(t, ch) {
    t.ch = ch;
    t.player.play(ch);
    t.label.replaceWith((t.label = tileLabel(ch)));
  }
  function renderFav() {
    const fav = big.ch && channels.state.favorites.has(big.ch.url);
    star.classList.toggle('hidden', !fav);
    favBtn.textContent = fav ? '★  Remove from Favorites' : '☆  Add to Favorites';
  }
  favBtn.addEventListener('click', () => {
    if (!big.ch) return;
    const msg = channels.toggleFavorite(big.ch);
    if (msg) toast(msg);
    renderFav();
  });

  function build() {
    const vis = allowed();
    const saved = session.ids.map((u) => channels.find(u)).filter((c) => c && plans.allowsChannel(c));
    const last = channels.find(channels.state.lastWatchedId);
    const out = saved.length ? saved.slice(0, 4) : (last && plans.allowsChannel(last) ? [last] : []);
    for (const c of vis) { if (out.length >= 4) break; if (!out.some((o) => o.url === c.url)) out.push(c); }
    if (!out.length) return;
    setBig(out[0]);
    out.slice(1).forEach((ch, i) => {
      const box = h('div.five-small', { focus: true });
      column.appendChild(box);
      const player = createPlayer(box, { muted: true, quality: 'lower', small: true });
      player.element.classList.add('stretch');
      const label = tileLabel(ch);
      box.appendChild(label);
      const t = { box, player, ch, label, frozen: false };
      box.addEventListener('click', () => swap(t));
      small.push(t);
      player.play(ch);
      void i;
    });
    save();
  }
  const save = () => { session.ids = [big.ch, ...small.map((t) => t.ch)].filter(Boolean).map((c) => c.url); };

  function swap(t) {
    const b = big.ch;
    setBig(t.ch);
    setSmall(t, b);
    save();
    ads.channelChanged(big.ch);
    nav.focus(t.box);
  }

  /** Slides the column one channel along (+1 next, -1 previous) and highlights the one that came in. */
  function slide(step) {
    if (!small.length) return;
    const vis = allowed();
    const shown = new Set([big.ch, ...small.map((t) => t.ch)].map((c) => c.url));
    const from = vis.findIndex((c) => c.url === (step > 0 ? small[small.length - 1] : small[0]).ch.url);
    let j = from + step;
    while (vis[j] && shown.has(vis[j].url)) j += step;
    const next = vis[j];
    if (!next) return;
    const chans = small.map((t) => t.ch);
    const moved = step > 0 ? [...chans.slice(1), next] : [next, ...chans.slice(0, -1)];
    small.forEach((t, i) => { if (t.ch.url !== moved[i].url) setSmall(t, moved[i]); });
    save();
    nav.focus((step > 0 ? small[small.length - 1] : small[0]).box);
  }

  // ---------- The big picture comes first ----------
  let lastDropped = 0, smoothSince = Date.now();
  const smoothTimer = setInterval(() => {
    const d = big.player.droppedFrames();
    const dropped = d - lastDropped;
    lastDropped = d;
    if (dropped > 4) {
      smoothSince = Date.now();
      const t = small.find((x) => !x.frozen);
      if (t) { t.frozen = true; t.player.freeze(true); }
    } else if (Date.now() - smoothSince > 10000) {
      const t = small.find((x) => x.frozen);
      if (t) { t.frozen = false; t.player.freeze(false); smoothSince = Date.now(); }
    }
  }, 2000);

  build();

  return {
    refresh: renderFav,
    focusFirst: () => nav.focus(bigBox),
    setSound: (on) => big.player.setMuted(!on),
    key(key) {
      const a = document.activeElement;
      const i = small.findIndex((t) => t.box === a);
      if (a === bigBox) {
        if (key === 'right') { if (small[0]) nav.focus(small[0].box); return true; }
        if (key === 'down') { nav.focus(favBtn); return true; }
        if (key === 'up') { ctx.toTopBar(); return true; }
        if (key === 'left') return true;
        if (key === 'ok') { if (big.ch) ctx.openChannel(big.ch); return true; }
        if (key === 'okhold') { if (big.ch) favoriteMenu(big.ch, renderFav); return true; }
      }
      if (a === favBtn) {
        if (key === 'up') { nav.focus(bigBox); return true; }
        if (key === 'right') { if (small[small.length - 1]) nav.focus(small[small.length - 1].box); return true; }
        if (key === 'down' || key === 'left') return true;
      }
      if (i >= 0) {
        if (key === 'down') { if (small[i + 1]) nav.focus(small[i + 1].box); else slide(1); return true; }
        if (key === 'up') { if (small[i - 1]) nav.focus(small[i - 1].box); else slide(-1); return true; }
        if (key === 'left') { nav.focus(bigBox); return true; }
        if (key === 'right') return true;
        if (key === 'ok') { swap(small[i]); return true; }
        if (key === 'okhold') { favoriteMenu(small[i].ch); return true; }
      }
      if (key === 'chup' || key === 'chdown') {
        const next = channels.next(big.ch, key === 'chup' ? -1 : 1);
        if (next && plans.allowsChannel(next)) { setBig(next); save(); ads.channelChanged(next); }
        return true;
      }
      return false;
    },
    pause() { watching.stop(big.player); big.player.stop(); small.forEach((t) => t.player.stop()); },
    resume(last) {
      if (last && last.url !== big.ch?.url) { setBig(last); save(); } else if (big.ch) setBig(big.ch);
      small.forEach((t) => { t.frozen = false; t.player.play(t.ch); });
      nav.focus(bigBox);
    },
    destroy() {
      clearInterval(smoothTimer);
      watching.stop(big.player);
      big.player.destroy();
      small.forEach((t) => t.player.destroy());
      el.remove();
    },
  };
}
