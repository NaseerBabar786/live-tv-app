// Our YouTube channels (ytc.html) and Bazaar Hits run like real TV: one running order a day, starting at
// midnight Toronto time and repeated round the clock, so everyone who tunes in joins whatever is on now
// (the owner's wish, 2026-10-07). Channel Studio's 📺 Programmes tab uses the same code to show the day's
// running order and to choose which videos may play (picks, saved in Firestore channel/picks).

export const TZ = "America/Toronto";
const PICKS_URL = "https://firestore.googleapis.com/v1/projects/live-tv-b2164/databases/(default)/documents/channel/picks";

/** Today's date "yyyy-mm-dd" in Toronto and the moment (ms) that day started there. */
export function torontoDay(nowMs = Date.now()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(nowMs)).map(x => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  const sinceMidnight = ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000 + nowMs % 1000;
  return { date, start: nowMs - sinceMidnight };
}

function shuffled(list, seed) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { seed = (seed * 9301 + 49297) % 233280; const j = Math.floor(seed / 233280 * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Length of a video in seconds (the list's own length, or the channel's usual one). */
export const lengthOf = (v, station) => Math.round((v.mins || station?.ytMins || 5) * 60);

/**
 * The owner's review (Channel Studio, 2026-10-07): every video is "approved" (on air), "new" (found by the
 * daily search, waiting for the owner) or "removed". Picks for one channel:
 * { on: [approved ids], off: [removed ids], offLabels: [removed sources], mode? }.
 * Videos found up to [REVIEW_FROM] were on air before the review started, so they count as approved.
 */
export const REVIEW_FROM = "2026-10-07";
export function status(v, pick) {
  const on = pick?.on || [], off = pick?.off || [], offLabels = pick?.offLabels || [];
  if (on.includes(v.id)) return "approved";
  if (off.includes(v.id) || offLabels.includes(v.label)) return "removed";
  if ((v.found || "") > REVIEW_FROM) return "new";
  // The old "wait until I tick them" mode: anything not ticked was off.
  return pick?.mode === "manual" ? "removed" : "approved";
}
export const playable = (v, pick) => status(v, pick) === "approved";

/** All channels' picks, from Firestore (public read). Anything wrong: no picks, everything plays. */
export async function loadPicks() {
  try {
    const r = await fetch(PICKS_URL, { cache: "no-store" });
    if (!r.ok) return {};
    const d = await r.json();
    return JSON.parse(d.fields?.data?.stringValue || "{}") || {};
  } catch { return {}; }
}

/**
 * The day's running order for a channel: the same for everyone, shuffled afresh each day.
 * "Top" videos come round more often: Bazaar Sports' main events and newest highlights after every
 * third video; on Bazaar Movies Hindi new films ([topRatio] 3) three for every older one.
 */
export function runningOrder(station, list, date) {
  const seed = Math.floor(Date.parse(date + "T00:00:00Z") / 86400000) + station.id.length;
  const top = shuffled(list.filter(v => v.top), seed + 1);
  const rest = shuffled(list.filter(v => !v.top), seed);
  if (top.length && rest.length && station.topRatio) {
    const out = [];
    top.forEach((v, i) => { out.push(v); if (i % station.topRatio === station.topRatio - 1) out.push(rest[Math.floor(i / station.topRatio) % rest.length]); });
    return out;
  }
  if (top.length && rest.length) {
    const out = [];
    rest.forEach((v, i) => { out.push(v); if (i % 3 === 2) out.push(top[Math.floor(i / 3) % top.length]); });
    return out;
  }
  return top.concat(rest);
}

/**
 * What's on at [nowMs]: the running order starts at midnight Toronto time and repeats until the next
 * midnight. Returns { i, offset (seconds into video i), startMs (when video i started) }.
 */
export function whereNow(order, station, nowMs = Date.now()) {
  const { start } = torontoDay(nowMs);
  const total = order.reduce((t, v) => t + lengthOf(v, station), 0);
  if (!total) return { i: 0, offset: 0, startMs: nowMs };
  const elapsed = (nowMs - start) / 1000;
  let pos = elapsed % total, i = 0;
  while (pos >= lengthOf(order[i], station)) { pos -= lengthOf(order[i], station); i++; }
  return { i, offset: pos, startMs: nowMs - pos * 1000 };
}

/** The day's guide from [fromMs]: [{ v, startMs }] for the next [count] programmes. */
export function upcoming(order, station, count, fromMs = Date.now()) {
  if (!order.length) return [];
  const w = whereNow(order, station, fromMs);
  const out = [];
  let t = w.startMs;
  for (let k = 0; k < count; k++) {
    const v = order[(w.i + k) % order.length];
    out.push({ v, startMs: t });
    t += lengthOf(v, station) * 1000;
  }
  return out;
}

// ---------- Ad breaks in the running order (owner, 2026-10-07) ----------
// Before every programme comes an ad break with our own Cable TV promos (media/promos.json), each
// break a different set, never over 60 seconds (the owner's ad length rule). On channels of short
// videos (music, clips) a break comes before the next video once 10 minutes have run since the last one.

export const BREAK_GAP_SECS = 10 * 60;
export const TRAILERS_PER_BLOCK = 12, TRAILERS_NEW = 8, CLIP_SECS = 45;

/** Trailers of upcoming films for a movie channel (channel/trailers.json, the languages in [trailerLangs]). */
export async function loadTrailers(station, base = "") {
  if (!station.trailerLangs) return [];
  try {
    const d = await (await fetch(base + "trailers.json", { cache: "no-store" })).json();
    return (d.videos || []).filter(v => v.id && v.secs > 0 && v.secs <= 600 && station.trailerLangs.includes(v.lang));
  } catch { return []; }
}

/** Our approved promos for the breaks, 10 to 60 seconds each. */
export async function loadPromos(base = "../media/") {
  try {
    const d = await (await fetch(base + "promos.json", { cache: "no-store" })).json();
    return (d.promos || []).filter(p => p.src && p.secs >= 10 && p.secs <= 60);
  } catch { return []; }
}

/**
 * The running order with its ad breaks: [{ kind: "break", promos, secs } | { kind: "video", v, secs }].
 * Breaks take the promos in turn, as many as fit in 60 seconds, so each break shows different ones.
 */
export function withBreaks(order, station, promos, trailers = []) {
  const items = [];
  let since = Infinity, p = 0, t = 0;
  // Movie channels (owner, 2026-10-07): after every film, 12 trailers. First "coming up" clips of the next
  // films on this channel (45 seconds from inside each film), then trailers of upcoming Hindi films
  // (channel/trailers.json, refreshed every day), then the ad break and the next film.
  const news = station.trailerLangs ? Math.min(TRAILERS_NEW, trailers.length) : 0;
  const ours = station.trailerLangs ? TRAILERS_PER_BLOCK - news : 0;
  order.forEach((v, i) => {
    const secs = lengthOf(v, station);
    if (promos.length && since >= BREAK_GAP_SECS) {
      const list = [];
      let total = 0;
      while (list.length < promos.length && total + promos[p % promos.length].secs <= 60) {
        const x = promos[p % promos.length];
        list.push(x); total += x.secs; p++;
      }
      if (list.length) { items.push({ kind: "break", promos: list, secs: total }); since = 0; }
    }
    items.push({ kind: "video", v, secs });
    since += secs;
    if (secs < 30 * 60 || !station.trailerLangs) return;
    for (let k = 1; k <= Math.min(ours, order.length - 1); k++) {
      const f = order[(i + k) % order.length];
      // From about a third of the way in: past the opening titles, into the story.
      const start = Math.round(lengthOf(f, station) * 0.3);
      items.push({ kind: "video", trailer: true, clip: true, start, v: f, secs: CLIP_SECS });
      since += CLIP_SECS;
    }
    for (let k = 0; k < news; k++, t++) {
      const tr = trailers[t % trailers.length];
      items.push({ kind: "video", trailer: true, v: { ...tr, mins: tr.secs / 60 }, secs: tr.secs });
      since += tr.secs;
    }
  });
  return items;
}

/** What's on at [nowMs] in a list of items: { i, offset (seconds into item i), startMs }. */
export function itemAt(items, nowMs = Date.now()) {
  const { start } = torontoDay(nowMs);
  const total = items.reduce((t, x) => t + x.secs, 0);
  if (!total) return { i: 0, offset: 0, startMs: nowMs };
  let pos = ((nowMs - start) / 1000) % total, i = 0;
  while (pos >= items[i].secs) { pos -= items[i].secs; i++; }
  return { i, offset: pos, startMs: nowMs - pos * 1000 };
}

/** The guide from [fromMs]: [{ item, startMs }] for the next [count] items. */
export function itemsFrom(items, count, fromMs = Date.now()) {
  if (!items.length) return [];
  const w = itemAt(items, fromMs);
  const out = [];
  let t = w.startMs;
  for (let k = 0; k < count; k++) {
    const item = items[(w.i + k) % items.length];
    out.push({ item, startMs: t });
    t += item.secs * 1000;
  }
  return out;
}

/** A channel's whole day: running order, ad breaks, clips and trailers. */
export function dayPlan(station, { list, picks, promos = [], trailers = [] }, date) {
  const items = withBreaks(runningOrder(station, list.filter(v => playable(v, picks)), date), station, promos, trailers);
  // One day is enough (25 hours covers the day the clocks go back); a shorter list repeats round the clock.
  let t = 0;
  const end = items.findIndex(x => (t += x.secs) >= 25 * 3600);
  return end < 0 ? items : items.slice(0, end + 1);
}

/**
 * The locked schedules (owner, 2026-10-07: "lock the schedule for 24 hours"): every night a job
 * (tools/lock_schedules.mjs) writes tomorrow's day for each channel to channel/locked/<id>.json, and
 * that day plays exactly as written, whatever changes during it. Changes in Studio go into the next lock.
 */
export async function loadLocked(station, base = "", date = torontoDay().date) {
  try {
    const d = await (await fetch(`${base}locked/${station.id}.json`, { cache: "no-store" })).json();
    const items = d.days?.[date];
    return Array.isArray(items) && items.length ? items : null;
  } catch { return null; }
}
