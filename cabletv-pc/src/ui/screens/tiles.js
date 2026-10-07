// 1×2, 2×2 and 2×3: separate TVs. Every tile plays its own channel; Left/Right move between them (round
// all the tiles in 2×2 and 2×3) and take the sound along, Up/Down change the highlighted tile's channel,
// OK makes the tiles fill the screen and OK again opens that channel, Back steps out. The small tiles
// play at low quality (2×2 at most 160×90, 2×3 half of that), only the highlighted one has sound.
import { h } from '../dom.js';
import * as nav from '../nav.js';
import * as channels from '../channels.js';
import * as plans from '../plans.js';
import * as watching from '../watching.js';
import * as ads from '../ads.js';
import { createPlayer } from '../player.js';
import { tileLabel, favoriteMenu } from './common.js';

/** The tiles' channels while the app is open, so going in and out of a channel keeps them. */
const session = { 2: [], 4: [], 6: [] };
const focused = { 2: 0, 4: 0, 6: 0 };

export function tilesMode(ctx, count) {
  const cols = count === 2 ? 2 : count === 4 ? 2 : 3;
  const quality = count === 2 ? 'normal' : count === 4 ? 'low' : 'lower';
  const el = h(`div.tiles.t${count}`);
  ctx.content.appendChild(el);
  const tiles = [];

  function pickChannels() {
    const vis = channels.visibleChannels().filter(plans.allowsChannel);
    const saved = session[count].map((u) => channels.find(u)).filter((c) => c && plans.allowsChannel(c));
    const out = [];
    const last = channels.find(channels.state.lastWatchedId);
    for (const c of saved) if (out.length < count && !out.some((o) => o.url === c.url)) out.push(c);
    if (!out.length && last && plans.allowsChannel(last)) out.push(last);
    for (const c of vis) {
      if (out.length >= count) break;
      if (!out.some((o) => o.url === c.url)) out.push(c);
    }
    return out;
  }

  function build() {
    tiles.forEach((t) => { watching.stop(t.player); t.player.destroy(); });
    tiles.length = 0;
    el.innerHTML = '';
    const list = pickChannels();
    session[count] = list.map((c) => c.url);
    list.forEach((ch, i) => {
      const box = h('div.tile', { focus: true });
      const label = tileLabel(ch);
      const speaker = h('div.speaker.hidden', '🔊');
      el.appendChild(box);
      const player = createPlayer(box, { muted: true, quality, small: count > 2 });
      player.element.classList.add('stretch');
      box.append(label, speaker);
      const t = { box, label, speaker, player, ch };
      box.addEventListener('focus', () => { focused[count] = i; updateSound(); });
      box.addEventListener('click', () => nav.focus(box));
      box.addEventListener('dblclick', () => ctx.openChannel(t.ch));
      tiles.push(t);
      player.play(ch);
    });
    updateSound();
  }

  let labelTimer = null;
  function updateSound() {
    const i = Math.min(focused[count], tiles.length - 1);
    tiles.forEach((t, j) => {
      const on = j === i && ctx.sound();
      t.player.setMuted(!on);
      t.box.classList.toggle('sound', j === i);
      t.speaker.classList.toggle('hidden', !on);
      if (j === i) watching.watch(t.player, t.ch); else watching.stop(t.player);
    });
  }

  function change(t, step) {
    const vis = channels.visibleChannels().filter(plans.allowsChannel);
    const others = new Set(tiles.filter((x) => x !== t).map((x) => x.ch.url));
    let j = vis.findIndex((c) => c.url === t.ch.url);
    if (j < 0) j = step > 0 ? -1 : vis.length;
    do j += step; while (vis[j] && others.has(vis[j].url));
    const next = vis[j];
    if (!next) return;
    t.ch = next;
    t.player.play(next);
    t.label.replaceWith((t.label = tileLabel(next)));
    t.box.classList.add('show-label');
    clearTimeout(labelTimer);
    labelTimer = setTimeout(() => t.box.classList.remove('show-label'), 5000);
    session[count] = tiles.map((x) => x.ch.url);
    channels.watched(next);
    updateSound();
    ads.channelChanged(next);
  }

  build();

  const current = () => tiles.find((t) => t.box === document.activeElement);
  return {
    refresh() {
      // A new filter only matters for the next channel change; the tiles keep playing.
      if (!tiles.length) build();
    },
    focusFirst() { const t = tiles[Math.min(focused[count], tiles.length - 1)]; if (t) nav.focus(t.box); },
    setSound: () => updateSound(),
    key(key) {
      const t = current();
      if (!t) return false;
      const i = tiles.indexOf(t);
      if (key === 'left' || key === 'right') {
        const loop = tiles.length > 2;
        let j = i + (key === 'left' ? -1 : 1);
        if (loop) j = (j + tiles.length) % tiles.length;
        if (tiles[j]) nav.focus(tiles[j].box);
        return true;
      }
      if (key === 'up' || key === 'chup') { change(t, -1); return true; }
      if (key === 'down' || key === 'chdown') { change(t, 1); return true; }
      if (key === 'ok') {
        if (!ctx.isBare()) ctx.setBare(true);
        else ctx.openChannel(t.ch);
        return true;
      }
      if (key === 'okhold') { favoriteMenu(t.ch); return true; }
      return false;
    },
    pause() { tiles.forEach((t) => { watching.stop(t.player); t.player.stop(); }); },
    resume(last) {
      // The tile that was opened comes back on the channel watched last.
      const t = tiles[Math.min(focused[count], tiles.length - 1)];
      if (t && last && !tiles.some((x) => x !== t && x.ch.url === last.url)) {
        t.ch = last;
        t.label.replaceWith((t.label = tileLabel(last)));
        session[count] = tiles.map((x) => x.ch.url);
      }
      tiles.forEach((x) => x.player.play(x.ch));
      updateSound();
      this.focusFirst();
    },
    destroy() {
      clearTimeout(labelTimer);
      tiles.forEach((t) => { watching.stop(t.player); t.player.destroy(); });
      el.remove();
    },
  };
}

