// The Weather section (WeatherScreen.kt, Cable TV 1.10.4): your place and the places you add, each with
// the weather now, the parts of the day, 24 hours, 10 days, details, warnings and weather stories.
// Arrows move, Enter opens, Esc closes the map and then the section. Stories open in the browser.
import { h, button, dialog, toast } from '../dom.js';
import * as nav from '../nav.js';
import * as store from '../store.js';
import * as W from '../weatherdata.js';

export function openWeather({ onClose }) {
  const root = h('div.wx');
  const rail = h('aside.wx-rail');
  const main = h('main.wx-main');
  root.append(rail, main);
  document.getElementById('app').appendChild(root);

  let mine = null;
  let selected = store.get('weatherSelected', 0);
  let report = null;
  let storyList = [];
  let token = 0;
  let mapEl = null;

  const added = () => store.get('weatherPlaces', []);
  const places = () => [...(mine ? [mine] : []), ...added()];
  const same = (a, b) => Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;

  function renderRail() {
    rail.innerHTML = '';
    rail.append(h('div.wx-head', button('←', close, 'icon'), h('span.wx-title', '☀️ Weather')), h('div.wx-sub', 'Your places'));
    places().forEach((p, i) => {
      rail.appendChild(h(`button.wx-place${i === selected ? '.on' : ''}`, { focus: true, on: { click: () => pick(i) } },
        h('div.wx-pname', (i === 0 && mine ? '📍 ' : '') + (p.city || 'My place')),
        h('div.wx-psub', i === 0 && mine ? 'Where you are' : p.region || '')));
    });
    rail.appendChild(h('button.wx-place.add', { focus: true, on: { click: addPlace } }, '＋ Add a place'));
  }

  function pick(i) {
    selected = i;
    store.set('weatherSelected', i);
    renderRail();
    load(false);
    nav.focus(rail.querySelector('.wx-place.on'));
  }

  async function load(fresh) {
    const p = places()[Math.min(selected, places().length - 1)];
    if (!p) { main.innerHTML = ''; main.appendChild(h('div.wx-msg', 'Finding where you are…')); return; }
    const t = ++token;
    if (!report || !same(report.place, p)) { main.innerHTML = ''; main.appendChild(h('div.spinner')); }
    const r = await W.load(p, { fahrenheit: store.get('weatherFahrenheit', null), fresh });
    if (t !== token) return;
    if (!r) {
      main.innerHTML = '';
      main.append(h('div.wx-msg', "The weather can't be reached right now."), button('Try again', () => load(true)));
      return;
    }
    report = r;
    render();
    const s = await W.stories(p);
    if (t !== token) return;
    storyList = s;
    render();
  }

  const section = (title) => h('h3.wx-h', title);

  function render() {
    const r = report;
    const had = document.activeElement && main.contains(document.activeElement) ? [...main.querySelectorAll('[data-focus]')].indexOf(document.activeElement) : -1;
    const top = main.scrollTop;
    main.innerHTML = '';
    const c = r.current;
    const today = r.days[0];
    const canRemove = selected >= (mine ? 1 : 0);
    main.appendChild(h('div.wx-now',
      h('div.wx-place-name', [r.place.city, r.place.region].filter(Boolean).join(', ') || 'Your place'),
      h('div.wx-small', `Now · ${W.clock(r.now)} local time`),
      h('div.wx-big', h('span.wx-icon', W.icon(c.code, c.day)), h('span.wx-temp', `${c.temperature}°${r.unit}`),
        h('div', h('div.wx-sky', W.describe(c.code)), h('div.wx-small', `Feels like ${c.feelsLike}°`),
          today ? h('div.wx-small', `High ${today.high}° · Low ${today.low}°`) : null)),
      h('div.wx-tip', `👕 ${W.tip(r)}`),
      h('div.wx-buttons',
        button('🗺 Weather map', () => openMap(r), 'wx-btn'),
        button(r.fahrenheit ? 'Show °C' : 'Show °F', () => { store.set('weatherFahrenheit', !r.fahrenheit); load(true); }, 'wx-btn'),
        button('⟳ Refresh', () => load(true), 'wx-btn'),
        canRemove ? button('✕ Remove place', () => removePlace(r.place), 'wx-btn') : null)));

    const alerts = [...r.alerts, ...W.headsUp(r)];
    if (alerts.length) {
      main.appendChild(section('⚠️ Warnings and heads-up'));
      for (const a of alerts) {
        main.appendChild(h(`div.wx-alert${a.severe ? '.severe' : ''}`, { focus: true },
          h('b', `${a.severe ? '🔴' : '🟡'} ${a.title}`), a.text ? h('div', a.text) : null, h('div.wx-small', a.source)));
      }
    }

    main.appendChild(section('Through the day'));
    main.appendChild(h('div.wx-row', W.partsFromNow(r).map((p) => partCard(p, r))));
    main.appendChild(section('Hourly'));
    main.appendChild(h('div.wx-row', W.hoursFromNow(r, 24).map((x) => hourCard(x, r))));

    main.appendChild(section('10-day forecast · Enter on a day for its hours'));
    const lo = Math.min(...r.days.map((d) => d.low));
    const hi = Math.max(...r.days.map((d) => d.high));
    const span = Math.max(1, hi - lo);
    for (const d of r.days) {
      main.appendChild(h('button.wx-day', { focus: true, on: { click: () => openDay(r, d) } },
        h('div.wx-dname', h('b', W.dayName(d.date, r.now.slice(0, 10))), h('div.wx-small', W.shortDate(d.date))),
        h('span.wx-dicon', W.icon(d.code)), h('span.wx-dsky', W.describe(d.code)), h('span.wx-rain', `💧${d.rain}%`),
        h('span.wx-lo', `${d.low}°`),
        h('span.wx-bar', h('span', { style: { left: `${((d.low - lo) / span) * 100}%`, width: `${Math.max(4, ((d.high - d.low) / span) * 100)}%` } })),
        h('b.wx-hi', `${d.high}°`)));
    }

    main.appendChild(section('Details'));
    const tiles = [
      ['💧', 'Humidity', `${c.humidity}%`],
      ['🌬️', 'Wind', `${c.wind} ${r.speed} from ${c.windFrom}${c.gusts > c.wind ? ` · gusts ${c.gusts}` : ''}`],
      ['🔆', 'UV index', `${today?.uv ?? c.uv} · ${W.uvLabel(today?.uv ?? c.uv)}`],
      r.airQuality != null ? ['🫁', 'Air quality', `${r.airQuality} · ${W.airLabel(r.airQuality)}`] : null,
      today ? ['🌅', 'Sunrise', W.clock(today.sunrise)] : null,
      today ? ['🌇', 'Sunset', W.clock(today.sunset)] : null,
      ['⏲️', 'Pressure', `${c.pressure} hPa`],
      c.visibility != null ? ['👁️', 'Visibility', `${c.visibility} ${r.distance}`] : null,
      ['🌡️', 'Dew point', `${c.dewPoint}°`],
      ['☁️', 'Cloud cover', `${c.clouds}%`],
    ].filter(Boolean);
    main.appendChild(h('div.wx-grid', tiles.map(([i, n, v]) => h('div.wx-tile', { focus: true }, h('div.wx-small', `${i}  ${n}`), h('b', v)))));

    if (storyList.length) {
      main.appendChild(section('📰 Weather news'));
      for (const s of storyList) {
        main.appendChild(h('button.wx-story', { focus: true, on: { click: () => window.pc ? window.pc.openExternal(s.link) : window.open(s.link) } },
          h('b', s.title), h('div.wx-small', [s.source, W.ago(s.published)].filter(Boolean).join(' · '))));
      }
    }
    main.appendChild(h('div.wx-credit', 'Weather by Open-Meteo.com · Air quality by Open-Meteo / CAMS' +
      (r.place.country === 'US' ? ' · Warnings by the US National Weather Service' : '') + ' · Stories by Google News'));
    main.scrollTop = top;
    if (had >= 0) nav.focus(main.querySelectorAll('[data-focus]')[had]);
  }

  function partCard(p, r) {
    const today = r.now.slice(0, 10);
    return h('div.wx-card.part', { focus: true },
      h('b', p.name), h('div.wx-small', p.date === today ? 'Today' : W.dayName(p.date, today)),
      h('div.wx-cicon', W.icon(p.code, p.day)), h('div.wx-ctemp', `${p.temperature}°`),
      h('div.wx-small', W.describe(p.code)), h('div.wx-rainp', `💧 ${p.rain}%`));
  }

  function hourCard(x, r) {
    const now = x.time.slice(0, 13) === r.now.slice(0, 13);
    return h(`div.wx-card.hour${now ? '.now' : ''}`, { focus: true },
      h('b', now ? 'Now' : W.hourLabel(x.hour)), h('div.wx-cicon', W.icon(x.code, x.day)),
      h('div.wx-ctemp', `${x.temperature}°`), h('div.wx-rainp', `💧${x.rain}%`),
      h('div.wx-rbar', h('span', { style: { width: `${x.rain}%` } })));
  }

  function openDay(r, d) {
    const today = r.now.slice(0, 10);
    const body = h('div.wx-dialog',
      h('p', `${W.describe(d.code)} · High ${d.high}° · Low ${d.low}° · 💧 ${d.rain}% · Wind up to ${d.wind} ${r.speed} · UV ${d.uv} · ` +
        `Sunrise ${W.clock(d.sunrise)} · Sunset ${W.clock(d.sunset)}`),
      h('div.wx-row', W.partsOf(r, d.date).map((p) => partCard(p, r))),
      h('div.wx-row', r.hours.filter((x) => x.date === d.date).map((x) => hourCard(x, r))));
    dialog({ title: `${W.icon(d.code)}  ${W.dayName(d.date, today)}, ${W.shortDate(d.date)}`, body, wide: true, buttons: [['Close', null]] });
  }

  function openMap(r) {
    mapEl = h('div.wx-map',
      h('div.wx-maphead', h('b', `Weather map · ${r.place.city}`), button('Close (Esc)', closeMap, 'wx-btn')),
      h('iframe', { src: W.radarUrl(r.place, r.fahrenheit), allow: 'fullscreen' }));
    root.appendChild(mapEl);
    nav.focus(mapEl.querySelector('[data-focus]'));
  }
  function closeMap() {
    mapEl?.remove();
    mapEl = null;
    nav.focus(main.querySelector('[data-focus]'));
  }

  function addPlace() {
    const input = h('input.search', { type: 'search', placeholder: 'e.g. Lahore' });
    const results = h('div.wx-results');
    const body = h('div', h('p', 'Type a city or town, then pick it from the list.'), input, results);
    const closeBox = dialog({ title: 'Add a place', body, buttons: [['Back', null]] });
    const go = async () => {
      if (!input.value.trim()) return;
      results.innerHTML = '';
      results.appendChild(h('div.wx-small', 'Searching…'));
      const list = await W.search(input.value);
      results.innerHTML = '';
      if (!list.length) results.appendChild(h('div.wx-small', 'No place found. Check the spelling and try again.'));
      for (const p of list) {
        results.appendChild(h('button.setrow', { focus: true, on: { click: () => {
          store.set('weatherPlaces', [...added().filter((x) => !same(x, p)), p]);
          closeBox();
          const i = places().findIndex((x) => same(x, p));
          pick(i < 0 ? 0 : i);
          toast(`${p.city} added`);
        } } }, h('div.set-label', p.city), p.region ? h('div.set-sub', p.region) : null));
      }
      nav.focus(results.querySelector('[data-focus]'));
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(); } });
    input.focus();
  }

  function removePlace(p) {
    dialog({
      title: `Remove ${p.city}?`, body: 'It comes off your list of places. You can add it again any time.',
      buttons: [['Remove', () => { store.set('weatherPlaces', added().filter((x) => !same(x, p))); pick(0); }], ['Keep it', null]], focusIndex: 1,
    });
  }

  const pop = nav.push(root, (key) => {
    if (key === 'back') { if (mapEl) closeMap(); else close(); return true; }
    return false;
  });
  const timer = setInterval(() => load(true), 15 * 60000);

  function close() {
    clearInterval(timer);
    token++;
    pop();
    root.remove();
    onClose && onClose();
  }

  renderRail();
  main.appendChild(h('div.spinner'));
  nav.focus(rail.querySelector('.wx-place'));
  W.myPlace().then((p) => {
    mine = p;
    if (!document.contains(root)) return;
    renderRail();
    nav.focus(rail.querySelector('.wx-place.on') || rail.querySelector('.wx-place'));
    load(false);
  });
  return { close };
}
