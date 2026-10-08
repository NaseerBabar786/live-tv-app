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
 * The owner's review (Channel Studio, 2026-10-07). Every video found stays in the channel's 📚 Library; the
 * owner approves the ones for ✅ Next transmission ("approved"), and the 24-hour schedules are made from those.
 * Others are "new" (found by the daily search, not looked at yet), "library" (kept, not in next transmission)
 * or "removed" (an old "remove", or a source switched off). Picks for one channel:
 * { on: [approved ids], out: [ids kept in the library only], off: [removed ids], offLabels: [removed sources] }.
 * Videos found up to [REVIEW_FROM] were on air before the review started, so they count as approved.
 */
export const REVIEW_FROM = "2026-10-07";
export function status(v, pick) {
  const on = pick?.on || [], out = pick?.out || [], off = pick?.off || [], offLabels = pick?.offLabels || [];
  if (on.includes(v.id)) return "approved";
  if (off.includes(v.id) || offLabels.includes(v.label)) return "removed";
  if (out.includes(v.id)) return "library";
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
  if (station.dayparts) return byDayparts(station, list, seed);
  if (station.newest) {
    // Latest Movies: each day opens with the films that went up on YouTube in the last week, newest first,
    // then goes on through the older ones from where the day before left off (the list comes newest first).
    const week = Date.parse(date + "T00:00:00Z") - 7 * 86400e3;
    const fresh = list.filter(v => v.up && Date.parse(v.up) >= week);
    const rest = list.filter(v => !fresh.includes(v));
    const from = rest.length ? (seed * 10) % rest.length : 0;
    return fresh.concat(rest.slice(from), rest.slice(0, from));
  }
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
 * A day with a shape (Spark Shayari, 2026-10-08): each part of the day ([dayparts]: { from: hour, labels })
 * is filled with its own sources' videos, shuffled afresh each day, then the next part begins. A part whose
 * sources have nothing takes from the whole list, so the day never has a gap.
 */
function byDayparts(station, list, seed) {
  const parts = station.dayparts;
  const out = [], used = new Set();
  parts.forEach((part, k) => {
    const want = ((parts[k + 1]?.from ?? 24) - part.from) * 3600;
    let pool = shuffled(list.filter(v => part.labels.includes(v.label)), seed + k);
    if (!pool.length) pool = shuffled(list, seed + k);
    // Fresh ones first; a part that runs out goes round its own sources again.
    pool = pool.filter(v => !used.has(v.id)).concat(pool.filter(v => used.has(v.id)));
    let t = 0;
    for (let i = 0; pool.length && t < want; i++) {
      const v = pool[i % pool.length];
      // (About a minute between programmes for the ad break or our own clip, so each part starts on time.)
      out.push(v); used.add(v.id); t += lengthOf(v, station) + 60;
    }
  });
  return out;
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
    const d = await (await fetch(base + "trailers.json", { cache: "no-cache" })).json();
    return (d.videos || []).filter(v => v.id && v.secs > 0 && v.secs <= 600 && station.trailerLangs.includes(v.lang));
  } catch { return []; }
}

/** A channel's own short videos ([ownClips], e.g. Spark Shayari's "Aaj ka Sher"): [{ src, secs, title }]. */
export async function loadOwnClips(station, base = "") {
  if (!station.ownClips) return [];
  try {
    const d = await (await fetch(base + station.ownClips, { cache: "no-cache" })).json();
    return (d.clips || []).filter(c => c.src && c.secs > 0 && c.secs <= 120).map(c => ({ ...c, own: true }));
  } catch { return []; }
}

/** Our approved promos for the breaks, 5 to 60 seconds each (owner, 2026-10-07). */
export async function loadPromos(base = "../media/") {
  try {
    const d = await (await fetch(base + "promos.json", { cache: "no-cache" })).json();
    return (d.promos || []).filter(p => p.src && p.secs >= 5 && p.secs <= 60);
  } catch { return []; }
}

/**
 * The running order with its ad breaks: [{ kind: "break", promos, secs } | { kind: "video", v, secs }].
 * Breaks take the promos in turn, as many as fit in 60 seconds, so each break shows different ones.
 */
export function withBreaks(order, station, promos, trailers = [], own = []) {
  const items = [];
  let since = Infinity, p = 0, t = 0, hour = 0, o = 0;
  // Movie channels (owner, 2026-10-07): after every film, 12 trailers. First "coming up" clips of the next
  // films on this channel (45 seconds from inside each film), then trailers of upcoming Hindi films
  // (channel/trailers.json, refreshed every day), then the ad break and the next film.
  const news = station.trailerLangs ? Math.min(TRAILERS_NEW, trailers.length) : 0;
  const ours = station.trailerLangs ? TRAILERS_PER_BLOCK - news : 0;
  order.forEach((v, i) => {
    const secs = lengthOf(v, station);
    // Our own short video once an hour, between programmes (Spark Shayari's "Aaj ka Sher"), in place of
    // that hour's ad break, so viewers never sit through two breaks in a row.
    const clock = own.length ? items.reduce((n, x) => n + x.secs, 0) : 0;
    if (own.length && clock >= hour * 3600) {
      const c = own[o++ % own.length];
      items.push({ kind: "break", own: true, promos: [c], secs: c.secs });
      hour = Math.floor(clock / 3600) + 1;
      since = 0;
    }
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
export function dayPlan(station, { list, picks, promos = [], trailers = [], own = [] }, date) {
  // Own clips start each day further along, so the hours don't show the same ones every day.
  const day = Math.floor(Date.parse(date + "T00:00:00Z") / 86400000);
  const from = own.length ? (day * 24) % own.length : 0;
  own = own.slice(from).concat(own.slice(0, from));
  const items = withBreaks(runningOrder(station, list.filter(v => playable(v, picks)), date), station, promos, trailers, own);
  // One day is enough (25 hours covers the day the clocks go back); a shorter list repeats round the clock.
  let t = 0;
  const end = items.findIndex(x => (t += x.secs) >= 25 * 3600);
  return end < 0 ? items : items.slice(0, end + 1);
}

// Only what a player needs, so locked days stay small.
export const slimItem = x => x.kind === "break" ? x : { ...x, v: { id: x.v.id, title: x.v.title, label: x.v.label, mins: x.v.mins } };

/**
 * A day the owner edits in Studio (📅 Schedule): the programmes before it stay exactly as they were
 * ([keep], what has played already and the one on now), then [progs] in the owner's order with the ad
 * breaks, clips and trailers in between, as in any day.
 */
export function rebuildDay(station, keep, progs, promos = [], trailers = []) {
  return keep.concat(withBreaks(progs, station, promos, trailers).map(slimItem));
}

/**
 * A film still running at midnight finishes first, like TV: the next day starts with the rest of it.
 * [items] is the day that started at [startMs]; returns the item that carries over, or null.
 */
export function carryOver(items, startMs) {
  const next = torontoDay(startMs + 25 * 3600e3).start;
  const w = itemAt(items, next - 1000);
  const it = items[w.i], rest = Math.round(it.secs - w.offset - 1);
  return it.kind === "video" && !it.trailer && rest > 120 ? { ...it, secs: rest, start: Math.round((it.start || 0) + w.offset + 1), cont: true } : null;
}

/** The days the owner locked (or fixed) in Studio: Firestore channel/sched-<id>, { days: { date: { items, at } } }. */
export const schedDoc = id => "sched-" + id;
export async function loadOwnerDays(id) {
  try {
    const r = await fetch(PICKS_URL.replace(/picks$/, schedDoc(id)), { cache: "no-store" });
    if (!r.ok) return {};
    const d = await r.json();
    return JSON.parse(d.fields?.data?.stringValue || "{}").days || {};
  } catch { return {}; }
}

/**
 * The locked schedules (owner, 2026-10-07: "lock the schedule for 24 hours"). A day the owner locked in
 * Channel Studio comes first (channel/sched-<id> in Firestore, so a fix shows at once); otherwise the one the
 * nightly job (tools/lock_schedules.mjs) wrote to channel/locked/<id>.json. A locked day plays exactly as
 * written; it changes only when the owner unlocks it in Studio to fix a mistake.
 */
export async function loadLocked(station, base = "", date = torontoDay().date) {
  // Both asked for at once, so the channel starts sooner (1.10.24); the owner's day still wins.
  const nightly = fetch(`${base}locked/${station.id}.json`, { cache: "no-cache" }).then(r => r.json()).catch(() => null);
  const mine = (await loadOwnerDays(station.id))[date]?.items;
  if (Array.isArray(mine) && mine.length) return mine;
  const items = (await nightly)?.days?.[date];
  return Array.isArray(items) && items.length ? items : null;
}
