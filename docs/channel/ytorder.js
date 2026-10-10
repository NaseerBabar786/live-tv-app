// Our YouTube channels (ytc.html) and Spark Hits run like real TV: one running order a day, starting at
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
/**
 * "Approve all new" done for the owner (2026-10-10, his ask: Claude does it): on these channels every video
 * found up to the date counts as approved, like pressing Studio > Library > Approve all new > Save then.
 * Videos found later wait for the owner's review as usual; his own picks (on/out/off) still win.
 */
export const APPROVED_UNTIL = { comedyur: "2026-10-10", comedypa: "2026-10-10", auto: "2026-10-10", autohi: "2026-10-10" };
/** [picks] (all channels) with each channel's [APPROVED_UNTIL] date added as its pick's "until". */
export function withApprovals(picks) {
  const all = { ...(picks || {}) };
  for (const [id, until] of Object.entries(APPROVED_UNTIL)) all[id] = { ...(all[id] || {}), until };
  return all;
}
export function status(v, pick) {
  const on = pick?.on || [], out = pick?.out || [], off = pick?.off || [], offLabels = pick?.offLabels || [];
  if (on.includes(v.id)) return "approved";
  if (off.includes(v.id) || offLabels.includes(v.label)) return "removed";
  if (out.includes(v.id)) return "library";
  if ((v.found || "") > (pick?.until > REVIEW_FROM ? pick.until : REVIEW_FROM)) return "new";
  // The old "wait until I tick them" mode: anything not ticked was off.
  return pick?.mode === "manual" ? "removed" : "approved";
}
export const playable = (v, pick) => status(v, pick) === "approved";

/** All channels' picks, from Firestore (public read). Anything wrong: no picks, everything plays. */
export async function loadPicks() {
  try {
    const r = await fetch(PICKS_URL, { cache: "no-store" });
    if (!r.ok) return withApprovals({});
    const d = await r.json();
    return withApprovals(JSON.parse(d.fields?.data?.stringValue || "{}") || {});
  } catch { return withApprovals({}); }
}

/**
 * The day's running order for a channel: the same for everyone, shuffled afresh each day.
 * "Top" videos come round more often: Spark Sports' main events and newest highlights after every
 * third video; on Spark Movies Hindi new films ([topRatio] 3) three for every older one.
 */
export function runningOrder(station, list, date) {
  const order = baseOrder(station, list, date);
  return station.mix ? mixShows(order) : order;
}

/**
 * The shows take turns (Spark Comedy, the owner's wish 2026-10-08: not Taarak Mehta again and again):
 * one video from each source in turn, keeping each source's own order; a source with more videos
 * comes round again once the others have had theirs.
 */
export function mixShows(order) {
  const by = new Map();
  order.forEach(v => { const k = v.label || ""; if (!by.has(k)) by.set(k, []); by.get(k).push(v); });
  const rows = [...by.values()], out = [];
  for (let i = 0; out.length < order.length; i++) rows.forEach(r => { if (i < r.length) out.push(r[i]); });
  return out;
}

function baseOrder(station, list, date) {
  const seed = Math.floor(Date.parse(date + "T00:00:00Z") / 86400000) + station.id.length;
  if (station.blocks) return blockOrder(station, list, seed);
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

// ---------- Half hours (Spark Shayari, owner 2026-10-08: "the same schedule as channel 1") ----------
// The day is one 8-hour set ([halfHours].set: its parts, e.g. classic readings, TV mushairas, big mushairas),
// played three times (12 AM, 8 AM and 4 PM Toronto time), made afresh each day. Every half hour is a
// 25-minute programme with two 1-minute ad breaks inside it, then a 5-minute break: 60 seconds of our ads,
// our own clip (Aaj ka Sher), "today on the channel" (card "today", drawn by ytc.html) and the weather
// (card "weather"). A long programme plays in 25-minute parts ("Part 2", picking up at the same second);
// short ones follow each other, and the breaks inside come between two of them when one ends close by.

export const HALF = 1800, PROG = 1500, PROG_CONTENT = PROG - 120, WEATHER_SECS = 50;
const BREAKS_AT = [500, 940];   // the two 1-minute breaks, in seconds of programme (about 8:20 and 16:40)
const NEAR = 150;               // a break moves to the end of a programme this close to it
const CRUMB = 45;               // never a piece shorter than this: a tail is dropped, a start waits
const MIN_TODAY = 60;
// A programme that runs a little long (owner, 2026-10-09: "take the time from the ads") isn't cut at :25: it
// finishes inside the 5-minute break, which shrinks to 1 minute of ads; if even that isn't enough it carries
// on after the ads and the next programme starts a few minutes later (the next half hour's break makes it up).
// Only long mushairas, over [STRETCH_MAX], still play in 25-minute parts with the whole break between them.
export const STRETCH_MAX = 40 * 60;
const STRETCH = 300 - 60;

/** A series (DD Urdu's Kavi Hazir Hai, PTV's Eid mushaira) plays its episodes in order, one further on each day. */
function seriesKey(v) {
  const m = (v.title || "").match(/(?:episode|epi|ep|part)\s*[-#.:]?\s*(\d+)/i);
  if (!m) return null;
  const name = v.title.split(/[|#]|\b(?:episode|epi|ep|part)\b/i)[0].toLowerCase().replace(/[^a-z؀-ۿ]+/g, " ").trim();
  return name ? { key: v.label + "/" + name, n: +m[1] } : null;
}
export function inSeriesOrder(pool, day) {
  const groups = new Map();
  pool.forEach((v, i) => { const s = seriesKey(v); if (s) { if (!groups.has(s.key)) groups.set(s.key, []); groups.get(s.key).push({ v, i, n: s.n }); } });
  const out = pool.slice();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const eps = g.slice().sort((a, b) => a.n - b.n || (a.v.posted || "").localeCompare(b.v.posted || "")).map(x => x.v);
    const from = day % eps.length;
    const turn = eps.slice(from).concat(eps.slice(0, from));
    g.forEach((x, k) => { out[x.i] = turn[k]; });
  }
  return out;
}

/**
 * Packs programmes into half hours [fromHalf, toHalf) of the day. [pick(half, setLeft, room)] gives the next
 * programme to start (one that fits in the [room] left in this half hour, if it can). Returns the items; each half hour adds up to exactly 30 minutes.
 */
function packHalves(station, pick, promos, own, fromHalf, toHalf, counters, ident = null) {
  const items = [];
  let cur = null;   // { v, start, len, part }
  const adBreak = () => {
    const list = [];
    let total = 0;
    while (promos.length && list.length < promos.length && total + promos[counters.p % promos.length].secs <= 60) {
      const x = promos[counters.p++ % promos.length];
      list.push(x); total += x.secs;
    }
    return list.length ? { kind: "break", promos: list, secs: total } : null;
  };
  for (let h = fromHalf; h < toHalf; h++) {
    const half = [];
    let used = 0, b = 0;
    // This half hour's ads in the 5-minute break, worked out first: a programme running long may use the
    // rest of the break, never these.
    const ads = adBreak();
    const wall = () => half.reduce((t, x) => t + x.secs, 0);
    const takeBreak = () => { const x = adBreak(); if (x) half.push(x); b++; };
    while (used < PROG_CONTENT) {
      const room = PROG_CONTENT - used, bAt = b < BREAKS_AT.length ? BREAKS_AT[b] : Infinity;
      if (!cur) {
        // Not a new programme for the last moments of the half hour: they go to "today on the channel".
        if (room < 120 && b >= BREAKS_AT.length) break;
        const v = pick(h, (toHalf - h) * PROG_CONTENT - used, room);
        if (!v) break;
        cur = { v, start: 0, len: lengthOf(v, station), part: 1 };
        // A break due very soon comes before the new programme instead of in its first minutes.
        if (bAt - used <= NEAR) { takeBreak(); continue; }
      }
      const rest = cur.len - cur.start, limit = Math.min(PROG_CONTENT, bAt);
      let secs = rest, done = true;
      if (used + rest > limit) {
        const hard = HALF - (ads?.secs || 0) - wall();   // time left before this half hour's ads must start
        // It ends a little after the break is due: the break waits for it.
        if (limit === bAt && used + rest - bAt <= NEAR && used + rest <= PROG_CONTENT) secs = rest;
        // Running a little long at :25: it takes the time from the 5-minute break, and if that's not enough
        // it stops for the ads and carries on after them.
        else if (limit !== bAt && cur.len <= STRETCH_MAX) {
          secs = Math.min(rest, hard);
          done = rest - secs < CRUMB;
        } else {
          secs = limit - used;
          done = rest - secs < CRUMB;   // a few seconds of applause or credits left: dropped
        }
      }
      if (secs > 0) {
        const it = { kind: "video", v: cur.v, secs };
        if (cur.start) Object.assign(it, { start: cur.start, part: cur.part });
        if (cur.start + secs < cur.len) it.cut = true;
        half.push(it);
        used += secs;
      }
      if (done) cur = null; else { cur.start += secs; cur.part++; }
      if (b < BREAKS_AT.length && used >= BREAKS_AT[b] - (done ? NEAR : 0)) takeBreak();
    }
    while (b < BREAKS_AT.length) takeBreak();
    // The 5-minute break: our ads, our own clip, today on the channel, the weather; when a programme ran
    // long, only what still fits (the ads always stay), so the half hour is still exactly 30 minutes.
    if (ads) half.push(ads);
    let left = HALF - wall();
    // Spark TV's moving logo on the hour, the last thing before the next programme (never inside the ads).
    const id = ident && h % 2 === 0 && left >= ident.secs + MIN_TODAY ? ident : null;
    if (id) left -= id.secs;
    const c = own.length ? own[counters.o % own.length] : null;
    if (c && left >= c.secs + MIN_TODAY) { counters.o++; half.push({ kind: "break", own: true, promos: [c], secs: c.secs }); left -= c.secs; }
    if (left >= MIN_TODAY + WEATHER_SECS) half.push({ kind: "break", card: "today", secs: left - WEATHER_SECS }, { kind: "break", card: "weather", secs: WEATHER_SECS });
    else if (left > 0) half.push({ kind: "break", card: "today", secs: left });
    if (id) half.push({ kind: "break", ident: true, promos: [id], secs: id.secs });
    items.push(...half);
  }
  return items;
}

/** A half-hour channel's day: its 8-hour set, made afresh each day from the approved programmes, three times. */
export function halfHourDay(station, list, date, promos = [], own = [], ident = null) {
  const cfg = station.halfHours, setHalves = cfg.setHours * 2;
  const day = Math.floor(Date.parse(date + "T00:00:00Z") / 86400000);
  const seed = day + station.id.length;
  const used = new Set();
  const pools = cfg.set.map((part, k) => {
    let pool = list.filter(v => part.labels.includes(v.label) && (!part.maxMins || (v.mins || 0) <= part.maxMins));
    if (!pool.length) pool = list.slice();
    return { part, pool: inSeriesOrder(shuffled(pool, seed + k), day), next: 0 };
  });
  const ends = []; let t = 0;
  cfg.set.forEach(part => ends.push(t += part.hours * 2));
  // From the part of the set the half hour belongs to: a programme not played yet today, best one that ends
  // before this half hour's break (short recitations, so they aren't cut), then one that ends inside the break
  // (it takes the time from it), else one that ends before the set does.
  const pick = (h, left, room) => {
    const p = pools[Math.max(0, ends.findIndex(e => h < e))] || pools[0];
    const n = p.pool.length;
    for (const fit of [room, room + STRETCH, left, Infinity]) for (let k = 0; k < n; k++) {
      const v = p.pool[(p.next + k) % n];
      if (used.has(v.id) && k < n - 1 && used.size < list.length) continue;
      if (lengthOf(v, station) > fit) continue;
      p.next = (p.next + k + 1) % n; used.add(v.id);
      return v;
    }
    return null;
  };
  const set = packHalves(station, pick, promos, own, 0, setHalves, { p: 0, o: 0 }, ident);
  const out = [];
  for (let k = 0; k < 24 / cfg.setHours; k++) out.push(...set);
  return out;
}

/**
 * The owner's own order (Channel Studio 📅 Schedule) for a half-hour channel: the half hours already kept
 * stay, then [progs] in that order from the next half hour to midnight.
 */
export function halfHourRebuild(station, keep, progs, promos = [], own = [], ident = null) {
  const from = Math.round(keep.reduce((t, x) => t + x.secs, 0) / HALF);
  let i = 0;
  const pick = () => progs.length ? progs[i++ % progs.length] : null;
  return keep.concat(packHalves(station, pick, promos, own, from, 48, { p: from * 3, o: from }, ident));
}

/**
 * A day in programme blocks, like TV (Spark Auto, the owner's wish 2026-10-08): [station.blocks] is
 * [{ from: hour, kind, name }] from midnight Toronto time; each block plays videos tagged with its kind
 * (yt-<id>.json "kinds", tools/build_youtube_channels.py), newest finds first in "new", the others shuffled
 * for the day. No video comes twice in a day while others are left; a block whose kind runs out goes on
 * with any video, and kind "any" takes everything. The ad break before each video counts as 45 seconds (breaks run 30 to 60).
 */
export function blockOrder(station, list, seed) {
  const blocks = station.blocks, used = new Set(), out = [];
  const all = shuffled(list, seed);
  const pool = kind => kind === "new"
    ? list.filter(v => (v.kinds || []).includes("new")).sort((a, b) => (b.found || "").localeCompare(a.found || ""))
    : kind === "any" ? all : shuffled(list.filter(v => (v.kinds || []).includes(kind)), seed + kind.length);
  const next = (kind, from) => {
    if (used.size >= list.length) used.clear();
    return from.find(v => !used.has(v.id)) || all.find(v => !used.has(v.id));
  };
  let t = 0;
  blocks.forEach((b, i) => {
    const end = (blocks[i + 1]?.from ?? 24) * 3600, from = pool(b.kind);
    t = Math.max(t, b.from * 3600);
    while (t < end && list.length) {
      const v = next(b.kind, from);
      used.add(v.id); out.push({ ...v, block: b.name });
      t += lengthOf(v, station) + 45;
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

/** Our approved promos for the breaks, 5 to 60 seconds each (owner, 2026-10-07); with [station], its Spark ads too. */
export async function loadPromos(base = "../media/", station = null) {
  let list = [];
  try {
    const d = await (await fetch(base + "promos.json", { cache: "no-cache" })).json();
    list = (d.promos || []).filter(p => p.src && p.secs >= 5 && p.secs <= 60);
  } catch {}
  return station ? list.concat(sparkFor(station, await loadSpark(base)).promos) : list;
}

// ---------- Spark TV's own ads and moving logo (owner, 2026-10-09) ----------
// media/spark-promos.json: the ads for every channel (channel tour, network montage) take turns with the
// Cable TV promos in the breaks, plus the ad in the channel's own language; the moving logo (ident) plays
// between programmes once an hour, never inside a break. Channels with noAds (Gurbani) get neither.

/** A channel's language by its number (owner, 2026-10-08): Urdu 1-19, Hindi 21-39, English 41-59, Punjabi 61-79. */
export function langOf(station) {
  const n = +station.dial;
  return !n ? null : n < 20 ? "ur" : n < 40 ? "hi" : n < 60 ? "en" : n < 80 ? "pa" : null;
}

/** From spark-promos.json: { promos (this channel's Spark ads for the breaks), ident (or null) }. */
export function sparkFor(station, d) {
  if (!d || station.noAds) return { promos: [], ident: null };
  const ok = p => p && p.src && p.secs >= 5 && p.secs <= 60;
  const promos = (d.everyChannel || []).concat((d.byLanguage || {})[langOf(station)] || []).filter(ok);
  return { promos, ident: ok(d.ident) ? { ...d.ident, ident: true } : null };
}

/** spark-promos.json, or null when it can't be read. */
export async function loadSpark(base = "../media/") {
  try { return await (await fetch(base + "spark-promos.json", { cache: "no-cache" })).json(); } catch { return null; }
}

/**
 * The running order with its ad breaks: [{ kind: "break", promos, secs } | { kind: "video", v, secs }].
 * Breaks take the promos in turn, as many as fit in 60 seconds, so each break shows different ones.
 */
export function withBreaks(order, station, promos, trailers = [], own = [], ident = null) {
  const items = [];
  let since = Infinity, p = 0, t = 0, hour = 0, o = 0, identHour = 0;
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
    // Spark TV's moving logo once an hour, right before the programme (after any break, never inside one).
    if (ident) {
      const now = items.reduce((n, x) => n + x.secs, 0);
      if (now >= identHour * 3600) { items.push({ kind: "break", ident: true, promos: [ident], secs: ident.secs }); identHour = Math.floor(now / 3600) + 1; }
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
export function dayPlan(station, { list, picks, promos = [], trailers = [], own = [], ident = null }, date) {
  // Own clips start each day further along, so the hours don't show the same ones every day.
  const day = Math.floor(Date.parse(date + "T00:00:00Z") / 86400000);
  const from = own.length ? (day * 24) % own.length : 0;
  own = own.slice(from).concat(own.slice(0, from));
  if (station.halfHours) return halfHourDay(station, list.filter(v => playable(v, picks)), date, promos, own, ident);
  const items = withBreaks(runningOrder(station, list.filter(v => playable(v, picks)), date), station, promos, trailers, own, ident);
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
export function rebuildDay(station, keep, progs, promos = [], trailers = [], own = [], ident = null) {
  if (station.halfHours) return halfHourRebuild(station, keep, progs, promos, own, ident);
  return keep.concat(withBreaks(progs, station, promos, trailers, [], ident).map(slimItem));
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
