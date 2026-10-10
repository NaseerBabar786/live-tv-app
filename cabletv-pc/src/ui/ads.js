// Sponsors and our promos on screen, with the TV app's timings (SponsorAds.kt):
// - the "advertise with us" ticker: along the bottom of the layouts first after 30 s, then every 30 s;
//   on a full-screen channel every 2 minutes;
// - on a channel change in the layouts, a sponsor's card in the corner, at most every 3 minutes
//   (not in the first 3 minutes);
// - on a full-screen channel, an ad break every 10 minutes: the channel pauses, our own Cable TV promo
//   plays (a different one each time), with a sponsor's picture when it still fits in the minute,
//   or a sponsor's booked video (at most once every 30 minutes). Esc skips an ad after 5 seconds (owner, 2026-10-10).
import * as sponsors from './sponsors.js';
import * as nav from './nav.js';
import * as store from './store.js';
import * as mine from './mychannel.js';

const CARD_MS = 5000, CARD_SITE_MS = 8000, CARD_EVERY_MS = 3 * 60000, CARD_NOT_BEFORE_MS = 3 * 60000;
const VIDEO_EVERY_MS = 30 * 60000;
const POD_SIZE = 2, PICTURE_MS = 20000, BREAK_MS = 60000, SKIP_AFTER_MS = 5000, BREAK_EVERY_MS = 10 * 60000;
const TICKER_FIRST_MS = 30000, TICKER_EVERY_MS = 30000, TICKER_PX_PER_SECOND = 110;
const PROMO_ID = 'promo';
const PROMOS_URL = 'https://tv.bulkbazaar.ca/media/app-promos.json';
let promos = [1, 2, 3, 4].map((n) => [`https://tv.bulkbazaar.ca/media/cable-tv-video-ad-${n}.mp4`, n === 1 ? 60 : 30]);

fetch(PROMOS_URL, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
  const list = (d.promos || []).filter((p) => p.src).map((p) =>
    [p.src.startsWith('https://') ? p.src : `https://tv.bulkbazaar.ca/media/${p.src}`, Math.max(5, Math.min(60, p.secs || 30))]);
  if (list.length) promos = list;
}).catch(() => {});

const openSite = (s) => {
  const url = sponsors.site(s);
  if (!url) return;
  sponsors.count(s, 'click');
  window.pc?.openExternal(url);
};

// ---------- The ticker ----------

let nextTickerAt = 0;

/**
 * The scrolling line in [band]. [everyMs] above 0: on its own clock (the full-screen channel), skipping
 * a turn while [skip]() says something else is on screen. Returns a stopper.
 */
export function ticker(band, { everyMs = 0, skip = () => false } = {}) {
  let timer = null, stopped = false;
  const run = () => new Promise((done) => {
    const words = sponsors.tickerText();
    if (!words || stopped) return done();
    band.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = words;
    band.appendChild(span);
    band.classList.add('on');
    const w = band.clientWidth, tw = span.offsetWidth;
    const ms = ((w + tw) / TICKER_PX_PER_SECOND) * 1000;
    const anim = span.animate([{ transform: `translateX(${w}px)` }, { transform: `translateX(${-tw}px)` }], { duration: ms, easing: 'linear' });
    anim.onfinish = anim.oncancel = () => { band.classList.remove('on'); band.innerHTML = ''; done(); };
  });
  const loop = async () => {
    if (stopped) return;
    if (everyMs > 0) {
      timer = setTimeout(async () => { if (!skip() && !document.hidden) await run(); loop(); }, everyMs);
      return;
    }
    if (!nextTickerAt) nextTickerAt = Date.now() + TICKER_FIRST_MS;
    timer = setTimeout(async () => {
      if (document.hidden) { nextTickerAt = Date.now() + TICKER_FIRST_MS; loop(); return; }
      nextTickerAt = Date.now() + TICKER_EVERY_MS;
      await run();
      loop();
    }, Math.max(0, nextTickerAt - Date.now()));
  };
  loop();
  return () => { stopped = true; clearTimeout(timer); band.getAnimations?.().forEach((a) => a.cancel()); band.querySelectorAll('span').forEach((s) => s.getAnimations().forEach((a) => a.cancel())); };
}

// ---------- Cards and breaks ----------

const startedAt = Date.now();
let lastCard = startedAt - CARD_EVERY_MS + CARD_NOT_BEFORE_MS;
let lastChannel = null;
let busy = false;
let host = null; // where the ads show: the full-screen player, or the layouts
let full = false;
let player = null; // the full-screen player, paused during a break
let breakTimer = null;
const cancel = new Set();

/** The screen showing now: [opts.full] for a full-screen channel with its [opts.player]. */
export function attach(el, opts = {}) {
  host = el;
  full = !!opts.full;
  player = opts.player || null;
  clearTimeout(breakTimer);
  if (full) scheduleBreak();
  else endBreak();
}
export function detach(el) {
  if (host !== el) return;
  cancel.forEach((fn) => fn());
  host = null;
  full = false;
  player = null;
  clearTimeout(breakTimer);
}
export const breakOn = () => busy && full;

function scheduleBreak() {
  clearTimeout(breakTimer);
  breakTimer = setTimeout(() => {
    if (!full) return;
    // Not on our YouTube pages (they run their own promo breaks, as on the TV), nor while hidden.
    if (Date.now() - lastCard < BREAK_EVERY_MS) return scheduleBreak();
    if (document.hidden || busy || (player && player.isWeb())) { breakTimer = setTimeout(scheduleBreak, 10000); return; }
    popUp(0);
    if (Date.now() - lastCard >= BREAK_EVERY_MS) breakTimer = setTimeout(scheduleBreak, 60000);
    else scheduleBreak();
  }, Math.max(1000, lastCard + BREAK_EVERY_MS - Date.now()));
}

/** The channel changed to [ch]: a card (layouts) or a break (full screen) when one is due. */
export function channelChanged(ch) {
  const id = ch && ch.url;
  if (!id || id === lastChannel) return;
  lastChannel = id;
  if (busy) return;
  if (Date.now() - lastCard < (full ? BREAK_EVERY_MS : CARD_EVERY_MS)) return;
  if (full && player && player.isWeb()) return;
  popUp(1500);
}

function pod() {
  const first = sponsors.next('card');
  if (!full) return first ? [first] : [];
  const more = first ? Array.from({ length: POD_SIZE - 1 }, () => sponsors.next('card')).filter(Boolean) : [];
  const seen = new Set();
  let total = 0;
  let videoDue = Date.now() - store.get('ads.videoAt', 0) >= VIDEO_EVERY_MS;
  let tookVideo = false;
  const list = [first, ...more].filter((s) => s && !seen.has(s.id) && seen.add(s.id)).filter((s, i) => {
    const asVideo = videoDue && s.popupVideo && s.video && s.videoSecs * 1000 <= BREAK_MS - total;
    const ms = asVideo ? (s.videoSecs || 30) * 1000 : PICTURE_MS;
    const ok = i === 0 || total + ms <= BREAK_MS;
    if (ok) { total += ms; if (asVideo) { videoDue = false; tookVideo = true; } }
    return ok;
  });
  if (tookVideo || !promos.length) return list;
  const n = store.get('ads.promoNext', 0);
  store.set('ads.promoNext', n + 1);
  const [url, secs] = promos[((n % promos.length) + promos.length) % promos.length];
  const promo = { id: `${PROMO_ID}:${n}`, name: 'Cable TV', video: url, popupVideo: true, videoSecs: secs, contact: '', website: '' };
  let used = secs * 1000;
  return [promo, ...list.filter((s) => !(s.popupVideo && s.video)).filter((s) => {
    const ok = used + PICTURE_MS <= BREAK_MS;
    if (ok) used += PICTURE_MS;
    return ok;
  })].slice(0, POD_SIZE);
}

async function popUp(wait) {
  if (busy) return;
  // Bazaar Ads (channel 15) is all ads already: no pop-up ads over it (owner, 2026-10-07).
  if (lastChannel === mine.ADS_URL) return;
  const ads = pod();
  if (!ads.length) return;
  lastCard = Date.now();
  busy = true;
  const isFull = full;
  const where = host;
  try {
    await sleep(wait);
    if (!where || where !== host) return;
    if (isFull) { player?.pause(); }
    let left = BREAK_MS;
    let index = 0;
    for (const s of ads) {
      if (where !== host || (isFull && !full)) break;
      if (isFull && left < 5000) break;
      const isPromo = s.id.startsWith(PROMO_ID);
      const asVideo = s.popupVideo && s.video && isFull && s.videoSecs * 1000 <= left &&
        (isPromo || Date.now() - store.get('ads.videoAt', 0) >= VIDEO_EVERY_MS);
      if (isPromo && !asVideo) continue;
      if (!asVideo && isFull && index > 0 && PICTURE_MS > left) continue;
      const label = isPromo ? '' : ads.length > 1 ? `Ad ${index + 1} of ${ads.length}` : 'Ad';
      index++;
      if (!isPromo) sponsors.count(s, 'card');
      const t0 = Date.now();
      if (asVideo) {
        if (!isPromo) store.set('ads.videoAt', Date.now());
        await showVideo(where, s, label, left);
      } else {
        await showPicture(where, s, label, isFull ? Math.min(PICTURE_MS, left) : sponsors.site(s) ? CARD_SITE_MS : CARD_MS, isFull);
      }
      left -= Math.max(1000, Date.now() - t0);
    }
  } finally {
    busy = false;
    if (isFull && full) player?.resume();
  }
}

function endBreak() { cancel.forEach((fn) => fn()); }

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The line under a full-screen ad: "Ad 1 of 2 · 0:12", and "Skip in 7" then "Skip ad ▸ Esc". */
function adBar(label, total) {
  const bar = document.createElement('div');
  bar.className = 'adbar';
  const l = document.createElement('span');
  const r = document.createElement('span');
  bar.append(l, r);
  const shownAt = Date.now();
  const tick = () => {
    const shown = Date.now() - shownAt;
    const secs = Math.max(0, Math.ceil((total - shown) / 1000));
    l.textContent = [label, clock(secs)].filter(Boolean).join(' · ');
    const skipIn = total > SKIP_AFTER_MS ? Math.ceil((SKIP_AFTER_MS - shown) / 1000) : -1;
    r.className = skipIn <= 0 && total > SKIP_AFTER_MS ? 'skip ready' : 'skip';
    r.textContent = total <= SKIP_AFTER_MS ? '' : skipIn > 0 ? `Skip in ${skipIn}` : 'Skip ad ▸ Esc';
  };
  tick();
  const t = setInterval(tick, 250);
  return { bar, canSkip: () => total > SKIP_AFTER_MS && Date.now() - shownAt >= SKIP_AFTER_MS, stop: () => clearInterval(t) };
}

function showPicture(where, s, label, ms, isFull) {
  return new Promise((done) => {
    const box = document.createElement('div');
    box.className = isFull ? 'ad-full' : 'ad-card';
    const img = document.createElement('img');
    img.src = s.image;
    img.alt = s.name;
    box.appendChild(img);
    const info = document.createElement('div');
    info.className = 'ad-info';
    info.textContent = [s.name, s.contact].filter((x) => x && x.trim()).join(' · ');
    box.appendChild(info);
    if (sponsors.site(s) && isFull) {
      const v = document.createElement('div');
      v.className = 'visit';
      v.textContent = 'Press OK (or click) to visit their website';
      box.appendChild(v);
    }
    let bar = null;
    if (isFull) { bar = adBar(label, ms); box.appendChild(bar.bar); }
    box.addEventListener('click', () => openSite(s));
    where.appendChild(box);
    let timer = setTimeout(finish, ms);
    const pop = isFull ? nav.push(box, (key) => {
      if (key === 'back') { if (bar.canSkip()) finish(); return true; }
      if (key === 'ok') { openSite(s); return true; }
      return ['up', 'down', 'left', 'right', 'chup', 'chdown'].includes(key) ? true : false;
    }) : null;
    cancel.add(finish);
    function finish() {
      clearTimeout(timer);
      cancel.delete(finish);
      pop && pop();
      bar && bar.stop();
      box.remove();
      done();
    }
  });
}

function showVideo(where, s, label, maxMs) {
  return new Promise((done) => {
    const box = document.createElement('div');
    box.className = 'ad-full';
    const v = document.createElement('video');
    v.src = s.video;
    v.autoplay = true;
    v.playsInline = true;
    box.appendChild(v);
    const total = Math.min(maxMs, (s.videoSecs || 30) * 1000);
    const bar = adBar(label, total);
    const isPromo = s.id.startsWith(PROMO_ID);
    if (!isPromo) {
      const info = document.createElement('div');
      info.className = 'ad-info';
      info.textContent = s.name;
      box.appendChild(info);
      if (sponsors.site(s)) {
        const visit = document.createElement('div');
        visit.className = 'visit';
        visit.textContent = 'Press OK (or click) to visit their website';
        box.appendChild(visit);
      }
    }
    box.appendChild(bar.bar);
    box.addEventListener('click', () => openSite(s));
    where.appendChild(box);
    // Nothing within 20 seconds, or the minute is up: on with the channel.
    const startTimer = setTimeout(() => { if (v.readyState < 2) finish(); }, 20000);
    const maxTimer = setTimeout(finish, maxMs + 1000);
    v.addEventListener('ended', finish);
    v.addEventListener('error', finish);
    v.play().catch(() => {});
    const pop = nav.push(box, (key) => {
      if (key === 'back') { if (bar.canSkip()) finish(); return true; }
      if (key === 'ok') { if (!isPromo) openSite(s); return true; }
      return ['up', 'down', 'left', 'right', 'chup', 'chdown'].includes(key);
    });
    cancel.add(finish);
    function finish() {
      clearTimeout(startTimer);
      clearTimeout(maxTimer);
      cancel.delete(finish);
      pop();
      bar.stop();
      v.pause();
      v.removeAttribute('src');
      box.remove();
      done();
    }
  });
}
