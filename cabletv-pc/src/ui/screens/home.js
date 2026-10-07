// The main screen (ChannelListScreen.kt): the top bar (logo, clock and weather, Modes, sound, search,
// Settings), the filter row (All, Favorites, genres), the channel count, the mode, and the
// "advertise with us" line along the bottom.
import { h, button, toast, dialog } from '../dom.js';
import * as nav from '../nav.js';
import * as channels from '../channels.js';
import * as plans from '../plans.js';
import * as store from '../store.js';
import * as ads from '../ads.js';
import * as weather from '../weather.js';
import { openWeather } from './weather.js';
import { listMode } from './list.js';
import { tilesMode } from './tiles.js';
import { fiveMode } from './five.js';
import { openFull } from './full.js';
import { openSettings } from './settings.js';

/** Every mode, in the TV app's order; the ones not on PC yet show as coming soon. */
export const MODES = [
  { id: 'list', label: '1+List', about: 'One channel with the channel list beside it' },
  { id: 'browse', label: 'Browse', about: 'Rows of big channel cards, like a streaming app', feature: 'browse', soon: true },
  { id: 'carousel', label: 'Carousel', about: 'One big channel in the middle, slide left and right', feature: 'carousel', soon: true },
  { id: 'strip', label: 'Strip', about: 'A big channel on top, channel tiles along the bottom', feature: 'strip', soon: true },
  { id: 'duo', label: 'Duo', about: 'Two channels playing on top, channel cards below', feature: 'duo', soon: true },
  { id: 'five', label: '1+3', about: 'One big channel and three small ones', feature: 'five' },
  { id: 'two', label: '1×2', about: 'Two channels side by side', feature: 'two' },
  { id: 'four', label: '2×2', about: 'Four channels at once', feature: 'four' },
  { id: 'six', label: '2×3', about: 'Six channels at once', feature: 'six' },
  { id: 'news', label: 'News', about: 'Your channel with weather, markets and stories', feature: 'news', soon: true },
  { id: 'cp24', label: 'CP24', about: 'A big channel with the clock and weather, CP24 style', feature: 'cp24', soon: true },
  { id: 'home', label: 'Home', about: 'Your channel with cards around it', feature: 'home', soon: true },
  { id: 'mine', label: 'My Screen', about: 'A screen you build yourself', feature: 'mine', soon: true },
];

export function openHome({ onExit }) {
  // The mode picked since the app opened (the TV app keeps it until the app closes too).
  let mode = 'list';
  let tilesFull = false;
  let sound = store.get('previewSound', true);
  let searching = false;
  let current = null; // the mode on screen: { el, destroy, focusFirst, refresh, setSound, pause, resume }

  const root = h('div.home');
  const title = h('span.title', channels.title());
  const clock = h('span.clock');
  const weatherEl = h('span.weather');
  const search = h('input.search.hidden', { type: 'search', placeholder: 'Search channels' });
  const modesBtn = button('▦  Modes', () => openModes(), 'top');
  const weatherBtn = button('☀️  Weather', () => showWeather(), 'top');
  const soundBtn = button('', () => { sound = !sound; store.set('previewSound', sound); renderSound(); current?.setSound?.(sound); }, 'icon');
  const searchBtn = button('🔍', () => toggleSearch(), 'icon');
  const settingsBtn = button('⚙', () => openSettings({ onChanged: refreshAll, onExit: askExit }), 'icon');
  const topbar = h('header.topbar',
    h('div.brand', h('div.brandline', h('img.logo', { src: 'logo.svg', alt: '' }), title), h('div.brandline.sub', clock, weatherEl)),
    search, h('div.spacer'), modesBtn, weatherBtn, soundBtn, searchBtn, settingsBtn);
  const chips = h('div.chips');
  const count = h('div.count');
  const content = h('div.content');
  const band = h('div.tickerband');
  root.append(topbar, chips, count, content, band);
  document.getElementById('app').appendChild(root);

  function renderSound() {
    soundBtn.textContent = sound ? '🔊' : '🔇';
    soundBtn.title = sound ? 'Mute previews' : 'Unmute previews';
  }
  renderSound();

  // ---------- Clock and weather ----------
  const tickClock = () => {
    const d = new Date();
    clock.textContent = `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}  ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  };
  tickClock();
  const clockTimer = setInterval(tickClock, 10000);
  let weatherTimer = null;
  const loadWeather = async () => {
    const w = await weather.now();
    weatherEl.textContent = w || '';
    weatherTimer = setTimeout(loadWeather, w ? 30 * 60000 : 5 * 60000);
  };
  loadWeather();

  // ---------- Search ----------
  function toggleSearch(force) {
    searching = force ?? !searching;
    search.classList.toggle('hidden', !searching);
    title.parentNode.parentNode.classList.toggle('hidden', searching);
    searchBtn.textContent = searching ? '✕' : '🔍';
    if (searching) search.focus();
    else { search.value = ''; channels.setQuery(''); nav.focus(searchBtn); }
  }
  search.addEventListener('input', () => channels.setQuery(search.value));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); toggleSearch(false); }
    if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); current?.focusFirst?.(); }
  });

  // ---------- Filter row ----------
  function renderChips() {
    const st = channels.state;
    const items = [channels.FILTER_ALL, channels.FILTER_FAVORITES, ...channels.categories()];
    const selected = new Set([
      st.filter === channels.FILTER_ALL && st.category == null ? channels.FILTER_ALL : null,
      st.filter === channels.FILTER_FAVORITES ? channels.FILTER_FAVORITES : null,
      st.category,
    ]);
    chips.innerHTML = '';
    for (const it of items) {
      chips.appendChild(h(`button.chip${selected.has(it) ? '.on' : ''}`, {
        focus: true,
        on: {
          click: () => {
            if (it === channels.FILTER_ALL) channels.setFilter(channels.FILTER_ALL);
            else if (it === channels.FILTER_FAVORITES) channels.setFilter(st.filter === channels.FILTER_FAVORITES ? channels.FILTER_ALL : channels.FILTER_FAVORITES);
            else channels.setCategory(it === st.category ? null : it);
            nav.focus([...chips.children].find((c) => c.textContent === it));
          },
        },
      }, it === channels.FILTER_FAVORITES ? '★ Favorites' : it));
    }
  }

  function renderCount() {
    const st = channels.state;
    if (st.loading && !st.channels.length) count.textContent = 'Loading channels…';
    else if (st.error && !st.channels.length) count.textContent = st.error;
    else count.textContent = `${channels.visibleChannels().length} channels`;
  }

  function refreshAll() {
    title.textContent = channels.title();
    renderChips();
    renderCount();
    current?.refresh?.();
  }
  const unsub = channels.onChange(refreshAll);
  const unsubPlans = plans.onChange(refreshAll);

  // ---------- Modes ----------
  function hideBars(on) {
    tilesFull = on;
    root.classList.toggle('bare', on);
  }

  function showMode(id) {
    current?.destroy();
    hideBars(false);
    mode = id;
    content.innerHTML = '';
    const ctx = {
      content, sound: () => sound, openChannel, toTopBar: () => nav.focus(modesBtn),
      toChips: () => nav.focus(chips.querySelector('.chip.on') || chips.firstChild), setBare: hideBars, isBare: () => tilesFull,
    };
    if (id === 'list') current = listMode(ctx);
    else if (id === 'five') current = fiveMode(ctx);
    else current = tilesMode(ctx, { two: 2, four: 4, six: 6 }[id]);
    root.dataset.mode = id;
    setTimeout(() => current?.focusFirst?.(), 0);
  }

  function openModes() {
    const list = h('div.modes');
    const close = dialog({ title: 'Modes', body: list, wide: false });
    for (const m of MODES) {
      const locked = !m.soon && m.feature && !plans.has(m.feature);
      const row = h(`button.mode${m.id === mode ? '.on' : ''}${m.soon ? '.soon' : ''}`, {
        focus: true,
        on: {
          click: () => {
            if (m.soon) { toast(`${m.label} is coming soon on PC. It's on the Cable TV app for TV now.`); return; }
            close();
            if (m.feature && plans.ask(`${m.label} mode`, m.feature)) return;
            showMode(m.id);
          },
        },
      }, h('div.mode-name', m.label + (m.soon ? '  · coming soon on PC' : locked ? `  · 🔒 ${plans.TIER_LABEL[plans.lowestWith(m.feature)]}` : '')),
      h('div.mode-about', m.about), m.id === mode ? h('span.check', '✓') : null);
      list.appendChild(row);
    }
    nav.focus(list.querySelector('.on') || list.firstChild);
  }

  function askExit() {
    dialog({ title: 'Exit Cable TV?', buttons: [['Yes', onExit], ['No', null]], focusIndex: 1 });
  }

  // ---------- Weather (1.10.4) ----------
  function showWeather() {
    current?.pause?.();
    ads.detach(content);
    root.classList.add('hidden');
    openWeather({
      onClose: () => {
        root.classList.remove('hidden');
        ads.attach(content, { full: false });
        current?.resume?.();
        nav.focus(weatherBtn);
      },
    });
  }

  // ---------- Opening a channel full screen ----------
  function openChannel(ch) {
    if (!plans.allowsChannel(ch)) { plans.ask(ch.name, 'channels'); return; }
    current?.pause?.();
    ads.detach(content);
    root.classList.add('hidden');
    openFull(ch, (last) => {
      root.classList.remove('hidden');
      ads.attach(content, { full: false });
      current?.resume?.(last);
    });
  }

  // ---------- Keys on this screen ----------
  const inTopBar = () => topbar.contains(document.activeElement);
  const pop = nav.push(root, (key) => {
    if (root.classList.contains('hidden')) return false;
    if (key === 'back') {
      if (searching) { toggleSearch(false); return true; }
      if (tilesFull) { hideBars(false); current?.focusFirst?.(); return true; }
      if (!inTopBar()) { nav.focus(modesBtn); return true; }
      askExit();
      return true;
    }
    if (key === 'fullscreen') { window.pc?.fullscreen('toggle'); return true; }
    if (inTopBar() || chips.contains(document.activeElement)) {
      if (key === 'down') {
        if (inTopBar() && chips.firstChild) { nav.focus(chips.querySelector('.chip.on') || chips.firstChild); return true; }
        if (chips.contains(document.activeElement)) { current?.focusFirst?.(); return true; }
      }
      if (key === 'up' && chips.contains(document.activeElement)) { nav.focus(modesBtn); return true; }
      if (key === 'left' || key === 'right') {
        const row = inTopBar() ? nav.focusables(topbar) : nav.focusables(chips);
        const i = row.indexOf(document.activeElement);
        const next = row[i + (key === 'left' ? -1 : 1)];
        if (next) nav.focus(next);
        return true;
      }
      return false;
    }
    return current?.key?.(key) || false;
  });

  const stopTicker = ads.ticker(band);
  ads.attach(content, { full: false });

  refreshAll();
  showMode('list');

  return {
    destroy() {
      current?.destroy();
      pop();
      unsub();
      unsubPlans();
      stopTicker();
      ads.detach(content);
      clearInterval(clockTimer);
      clearTimeout(weatherTimer);
      root.remove();
    },
    focus: () => current?.focusFirst?.(),
  };
}

