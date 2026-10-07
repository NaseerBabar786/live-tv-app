// 1+List: one channel plays in the left three quarters, the channel list is on the right. OK on a
// channel plays it on the left; OK on the picture opens it full screen; holding OK on a channel adds
// it to Favorites (PlayerWithList in ChannelListScreen.kt).
import { h } from '../dom.js';
import * as nav from '../nav.js';
import * as channels from '../channels.js';
import * as plans from '../plans.js';
import * as watching from '../watching.js';
import * as ads from '../ads.js';
import { createPlayer } from '../player.js';
import { listName, favoriteMenu } from './common.js';

export function listMode(ctx) {
  const el = h('div.listmode');
  const box = h('div.bigbox', { focus: true, on: { click: () => selected && ctx.openChannel(selected) } });
  const caption = h('div.caption');
  const left = h('div.left', box, caption);
  const list = h('div.chlist');
  el.append(left, list);
  ctx.content.appendChild(el);
  const player = createPlayer(box, { muted: !ctx.sound() });
  let selected = null;
  let shownIds = '';

  function select(ch, { play = true } = {}) {
    if (!ch) return;
    if (!plans.allowsChannel(ch)) { plans.ask(ch.name, 'channels'); return; }
    const changed = !selected || selected.url !== ch.url;
    selected = ch;
    caption.textContent = ch.number > 0 ? `${ch.number}  ${ch.name}` : ch.name;
    if (play && (changed || !player.channel())) {
      player.play(ch);
      watching.watch(player, ch);
      channels.watched(ch);
      ads.channelChanged(ch);
    }
    for (const row of list.children) row.classList.toggle('current', row.dataset.url === ch.url);
  }

  function render() {
    const vis = channels.visibleChannels();
    const ids = vis.map((c) => c.url).join('\n');
    const favs = channels.state.favorites;
    const focusedUrl = list.contains(document.activeElement) ? document.activeElement.dataset.url : null;
    if (ids !== shownIds) {
      // A new filter shows the list from the top.
      const newList = shownIds !== '';
      shownIds = ids;
      list.innerHTML = '';
      const frag = document.createDocumentFragment();
      for (const c of vis) {
        frag.appendChild(h('button.chrow', {
          focus: true, 'data-url': c.url,
          on: { click: () => select(c) },
        }, c.number > 0 ? h('span.num', String(c.number)) : null, h('span.name', listName(c)), h('span.star', favs.has(c.url) ? '★' : '')));
      }
      list.appendChild(frag);
      if (newList) list.scrollTop = 0;
    } else {
      for (const row of list.children) row.querySelector('.star').textContent = favs.has(row.dataset.url) ? '★' : '';
    }
    if (!selected) {
      const all = channels.state.channels;
      const start = all.find((c) => c.url === channels.state.lastWatchedId && plans.allowsChannel(c)) || vis[0];
      if (start) select(start);
    } else {
      for (const row of list.children) row.classList.toggle('current', row.dataset.url === selected.url);
    }
    if (focusedUrl) {
      const row = [...list.children].find((r) => r.dataset.url === focusedUrl);
      if (row) nav.focus(row);
    }
  }
  render();

  function focusFirst() {
    const row = [...list.children].find((r) => selected && r.dataset.url === selected.url) || list.firstChild;
    if (row) { nav.focus(row); row.scrollIntoView({ block: 'center' }); } else nav.focus(box);
  }

  return {
    refresh: render,
    focusFirst,
    setSound: (on) => player.setMuted(!on),
    key(key) {
      const a = document.activeElement;
      const inList = list.contains(a);
      if (key === 'okhold' && inList) {
        const ch = channels.find(a.dataset.url) || channels.visibleChannels().find((c) => c.url === a.dataset.url);
        if (ch) favoriteMenu(ch, render);
        return true;
      }
      if (key === 'chup' || key === 'chdown') { select(channels.next(selected, key === 'chup' ? -1 : 1)); return true; }
      if (key === 'left' && inList) { nav.focus(box); return true; }
      if (key === 'right' && a === box) { focusFirst(); return true; }
      if (key === 'up' && inList && a === list.firstChild) { ctx.toChips(); return true; }
      if (key === 'up' && a === box) { ctx.toChips(); return true; }
      if ((key === 'up' || key === 'down') && inList) {
        const next = key === 'up' ? a.previousElementSibling : a.nextElementSibling;
        if (next) nav.focus(next);
        return true;
      }
      return false;
    },
    pause() { watching.stop(player); player.stop(); },
    resume(last) {
      select(last || selected);
      focusFirst();
    },
    destroy() { watching.stop(player); player.destroy(); el.remove(); },
  };
}
