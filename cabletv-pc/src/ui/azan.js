// The Azan while Cable TV for PC is open (AzanSettings in Azan.kt, AzanFullScreen and AzanBanner in
// PrayerScreens.kt): the settings and the place, the recordings list from tv.bulkbazaar.ca, and a watcher
// for the whole session. At each prayer: the Azan full screen (the channels paused), or a chime or message
// banner along the top for 12 seconds; every one also shows a Windows notification.
import { h } from './dom.js';
import * as nav from './nav.js';
import * as store from './store.js';
import * as P from './prayer.js';

const K = 'quran.azan.';
const KEYS = Object.keys(P.DEFAULTS);

/** The settings now (a fresh copy). */
export function settings() {
  const s = {};
  for (const k of KEYS) s[k] = store.get(K + k, P.DEFAULTS[k]);
  return s;
}

const listeners = new Set();
/** Runs [fn] after any change (setting, place, recordings); returns an unsubscribe. */
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
// A copy: a screen that redraws on a change subscribes again, and must not be run twice.
const changed = () => [...listeners].forEach((fn) => { if (listeners.has(fn)) { try { fn(); } catch {} } });

export function set(key, value) {
  store.set(K + key, value);
  changed();
}
export function setMode(prayerId, mode) { set('modes', { ...settings().modes, [prayerId]: mode }); }

// ---------- Place (geojs.io, as Cable TV's weather does) ----------

let finding = null;
/** Finds the place from the internet address; [again] looks it up even when it is known. */
export function refreshPlace(again = false) {
  if (!again && store.get(`${K}place`)) return Promise.resolve();
  finding ??= fetch('https://get.geojs.io/v1/ip/geo.json')
    .then((r) => r.json())
    .then((o) => {
      const lat = parseFloat(o.latitude), lng = parseFloat(o.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) set('place', { latitude: lat, longitude: lng, city: o.city || '', country: o.country_code || '' });
    })
    .catch(() => {})
    .finally(() => { finding = null; });
  return finding;
}

// ---------- Recordings ----------

let voiceList = (() => { try { return P.parseVoices(localStorage.getItem('ctv.cache.azanVoices') || ''); } catch { return []; } })();
/** The recordings to choose from (kept, so they're there offline). */
export const voices = () => voiceList;
export function refreshVoices() {
  return store.fetchCached('azanVoices', `${P.AZAN_BASE}azan.json`)
    .then((text) => { const v = P.parseVoices(text); if (v.length) { voiceList = v; changed(); } })
    .catch(() => {});
}

// ---------- Playing a recording ----------

let audio = null, sampleId = null;
/** Plays [voice] at the chosen volume; [onEnd] runs when it ends or fails. Streams it (the browser caches). */
function play(voice, onEnd) {
  stopAudio();
  const a = new Audio(voice.url);
  a.volume = Math.min(1, Math.max(0.1, settings().volume / 100));
  const end = () => { if (audio === a) { audio = null; onEnd && onEnd(); } };
  a.addEventListener('ended', end);
  a.addEventListener('error', end);
  a.play().catch(end);
  audio = a;
}
function stopAudio() {
  if (!audio) return;
  const a = audio;
  audio = null;
  a.pause();
  a.removeAttribute('src');
  a.load();
}

/** The settings' ▶ beside a muezzin: which one is playing, if any. */
export const samplePlaying = () => sampleId;
export function playSample(id, onEnd) {
  const v = voiceList.find((x) => x.id === id);
  if (!v) return;
  sampleId = id;
  play(v, () => { sampleId = null; onEnd && onEnd(); });
}
export function stopSample() { if (sampleId) { sampleId = null; stopAudio(); } }

// ---------- At prayer time ----------

const urdu = () => (store.get('quran.language') || (/^ur/i.test(navigator.language || '') ? 'ur' : 'en')) === 'ur';
const tr = (en, ur) => (urdu() ? ur : en);
const title = (ev) => {
  const p = P.prayerById(ev.prayer);
  const name = tr(p.en, p.ur);
  return ev.reminder ? `${name} ${tr('in', 'میں')} ${settings().reminder} ${tr('min', 'منٹ')}` : `${tr("It's time for", 'وقت ہو گیا ہے')} ${name}`;
};
const timeText = (ev) => {
  const d = new Date(ev.reminder ? ev.at + settings().reminder * 60000 : ev.at);
  return P.format(d.getHours() * 60 + d.getMinutes());
};

function notify(ev, sound) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission === 'denied') return false;
    new Notification(title(ev), { body: `${timeText(ev)} · Cable TV`, silent: !sound });
    return true;
  } catch {
    return false;
  }
}

/** A soft two-note bell, when Windows can't sound the notification. */
function bell() {
  try {
    const ctx = new AudioContext();
    [[880, 0], [660, 0.35]].forEach(([f, at]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 1.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 1.3);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch {}
}

let bannerEl = null, bannerTimer = null;
function banner(ev) {
  bannerEl?.remove();
  clearTimeout(bannerTimer);
  const close = () => { clearTimeout(bannerTimer); bannerEl?.remove(); bannerEl = null; };
  bannerEl = h('div.azan-banner', { dir: urdu() ? 'rtl' : 'ltr', on: { click: close } },
    h('div.azan-banner-icon', '🔔'), h('div', h('div.azan-banner-title', title(ev)), h('div.azan-banner-time', { dir: 'ltr' }, timeText(ev))));
  document.body.appendChild(bannerEl);
  bannerTimer = setTimeout(close, 12000);
}

let fullOpen = false;
/** The full-screen Azan: the prayer, its time and a Stop button; [pause]/[resume] hold the channels meanwhile. */
function azanFull(ev, hooks) {
  if (fullOpen) return;
  const voice = P.voiceFor(settings(), voiceList, ev.prayer);
  fullOpen = true;
  stopSample();
  // The Quran section stops its recitation; the mode on screen and any other sound pause.
  window.dispatchEvent(new Event('azan-start'));
  const resumeMode = hooks.pause ? hooks.pause() : null;
  const paused = [...document.querySelectorAll('video, audio')].filter((m) => !m.paused);
  paused.forEach((m) => m.pause());
  const stop = h('button.azan-stop', { focus: true, on: { click: () => close() } }, '■  ', tr('Stop Azan', 'اذان بند کریں'));
  const el = h('div.azan-full', { dir: urdu() ? 'rtl' : 'ltr' },
    h('div.azan-akbar', { dir: 'rtl' }, 'اَللّٰهُ اَكْبَرُ'), h('div.azan-title', title(ev)), h('div.azan-time', { dir: 'ltr' }, timeText(ev)),
    stop, voice?.credit ? h('div.azan-credit', voice.credit) : null);
  const prev = document.activeElement;
  document.body.appendChild(el);
  const pop = nav.push(el, (key) => {
    if (key === 'back' || key === 'ok') { close(); return true; }
    return true; // nothing else reaches the screen behind while the Azan shows
  });
  nav.focus(stop);
  if (voice) play(voice, () => close()); else setTimeout(() => close(), 60000);
  function close() {
    if (!fullOpen) return;
    fullOpen = false;
    stopAudio();
    pop();
    el.remove();
    paused.forEach((m) => m.play().catch(() => {}));
    if (typeof resumeMode === 'function') resumeMode();
    if (prev && document.contains(prev)) nav.focus(prev);
  }
}

/** Shows what [ev] asks for now. */
export function fire(ev, hooks = {}) {
  if (ev.mode === 'Azan' && !ev.reminder) {
    notify(ev, false);
    azanFull(ev, hooks);
  } else {
    // A chime sounds Windows' notification sound, or our bell when there is none; a message is silent.
    const chime = ev.mode === 'Chime' && !ev.reminder;
    if (!notify(ev, chime) && chime) bell();
    banner(ev);
  }
}

/**
 * Watches the clock for the whole session. [hooks.pause]() pauses what's on screen and returns a function
 * that resumes it. Late events (the PC was asleep) are skipped after 2 minutes.
 */
export function startWatcher(hooks = {}) {
  let pending = null, dirty = true;
  const off = onChange(() => { dirty = true; });
  const tick = () => {
    const now = Date.now();
    if (dirty || !pending) { pending = P.nextEvent(settings(), now - 1000); dirty = false; }
    if (pending && now >= pending.at) {
      const ev = pending;
      pending = P.nextEvent(settings(), ev.at);
      if (now - ev.at < 2 * 60000) fire(ev, hooks);
    }
  };
  refreshPlace().then(tick);
  refreshVoices();
  const timer = setInterval(tick, 10000);
  // The list and the place again now and then (a laptop moves; new recordings appear).
  const daily = setInterval(() => { refreshVoices(); }, 6 * 3600000);
  return () => { clearInterval(timer); clearInterval(daily); off(); };
}
