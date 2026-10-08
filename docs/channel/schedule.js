// The owner's channel: works out what is on at any moment from the saved settings.
// The same rules as the app (MyChannel.kt), so the website and every TV show the same thing.
//
// Settings: { name, logo, logoCorner, active, tz, ticker, tickerOn,
//             videos: [{ id, title, url, secs, kind }], slots: [{ day, time, video, show?, episodes?, since? }], loop: [ids] }
// A slot with episodes is a weekly show (drama, serial): one episode per airing from [since], then from episode 1 again.

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const TEST_SCHEDULE_URL = "https://tv.bulkbazaar.ca/channel/test-schedule.json";

/**
 * Our channels. [doc] is the owner's copy in Firestore sponsors/ (the app reads it) and channel/[id]
 * the public copy; [ready] plays until the owner saves anything. Keep in step with MyChannel.STATIONS.
 * [yt] channels run like Bazaar Hits (1.9.47): official YouTube videos on [web] (channel/ytc.html),
 * locked; their schedule ([ready] or the owner's saved one) is the backup when YouTube won't play.
 */
export const STATIONS = [
  { id: "main", name: "Bazaar TV One", dial: "1", doc: "_channel", page: "channel/",
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-tv.png", ready: TEST_SCHEDULE_URL,
    credits: "Shows are public domain or Creative Commons works. Blender films: Blender Foundation, blender.org (CC BY). Space videos: NASA." },
  { id: "filmein", yt: true, trailerLangs: ["Hindi"], web: "channel/ytc.html?c=filmein", ytMins: 120, tagline: "Full films from the studios' own channels, day and night",
    name: "Bazaar Cinema", dial: "2", doc: "_channel_filmein", page: "channel/?c=filmein", auto: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-cinema.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    credits: "Films: public-domain classics from the Internet Archive (archive.org). A film every night at 8 PM Toronto time." },
  { id: "sur", yt: true, web: "channel/ytc.html?c=sur", ytMins: 5, tagline: "Punjabi, Sufi and qawwali, day and night",
    name: "Bazaar Music", dial: "3", doc: "_channel_sur", page: "channel/?c=sur", auto: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-music.png", ready: "https://tv.bulkbazaar.ca/channel/sur-schedule.json",
    credits: "Music: recordings that are free to use (public domain, CC0 and CC BY) from Wikimedia Commons; each song's credit and licence show on screen. No film songs." },
  { id: "kids", yt: true, web: "channel/ytc.html?c=kids", ytMins: 10, tagline: "Cartoons and songs for children, day and night",
    name: "Bazaar Kids", dial: "5", doc: "_channel_kids", page: "channel/?c=kids", auto: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-kids.png", ready: "https://tv.bulkbazaar.ca/channel/kids-schedule.json",
    credits: "Cartoons: public-domain classics (Popeye, Superman, Felix the Cat) from the Internet Archive, Blender Foundation shorts (CC BY) and NASA videos." },
  { id: "sports", yt: true, web: "channel/ytc.html?c=sports", ytMins: 8, tagline: "Cricket, wrestling, hockey and more, day and night",
    name: "Bazaar Sports", dial: "6", doc: "_channel_sports", page: "channel/?c=sports", auto: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-sports.png", ready: "https://tv.bulkbazaar.ca/channel/sports-schedule.json",
    credits: "Sport: public-domain and CC BY sports films (classic boxing, cricket, football, athletics) from the Internet Archive. No modern leagues or tournaments." },
  { id: "travel", yt: true, web: "channel/ytc.html?c=travel", ytMins: 10, tagline: "See the world, day and night",
    name: "Bazaar Travel", dial: "7", doc: "_channel_travel", page: "channel/?c=travel", auto: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-travel.png", ready: "https://tv.bulkbazaar.ca/channel/travel-schedule.json",
    credits: "Travel: public-domain and CC BY travel films of countries, cities and parks from the Internet Archive." },
  { id: "comedy", yt: true, web: "channel/ytc.html?c=comedy", ytMins: 15, tagline: "Laughs day and night",
    name: "Bazaar Comedy", dial: "8", doc: "_channel_comedy", page: "channel/?c=comedy", auto: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-comedy.png", ready: "https://tv.bulkbazaar.ca/channel/comedy-schedule.json",
    credits: "Comedy: public-domain silent and classic comedies (Chaplin, Laurel and Hardy, Keaton) and early TV comedies from the Internet Archive." },
  // 1.9.50: no schedule of their own; when YouTube won't play, Bazaar Cinema's free films ([backup]) play under their name.
  { id: "english", yt: true, trailerLangs: ["English"], web: "channel/ytc.html?c=english", ytMins: 100, tagline: "Full English films, day and night",
    name: "Bazaar Movies English", dial: "9", doc: "_channel_english", page: "channel/?c=english", auto: true, backup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-english.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    credits: "Films: full films from the studios' and distributors' own YouTube channels. Backup: public-domain classics from the Internet Archive." },
  { id: "hindi", yt: true, trailerLangs: ["Hindi"], web: "channel/ytc.html?c=hindi", ytMins: 140, tagline: "New Hindi films, day and night", topRatio: 3,
    name: "Bazaar Movies Hindi", dial: "10", doc: "_channel_hindi", page: "channel/?c=hindi", auto: true, backup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-hindi.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    credits: "Films: full Hindi films from the studios' own YouTube channels. Backup: public-domain classics from the Internet Archive." },
  // 11 is Urdu dramas and 16 Hindi dramas (the owner, 2026-10-08).
  { id: "dramas", yt: true, web: "channel/ytc.html?c=dramas", ytMins: 40, tagline: "Pakistani dramas in Urdu, day and night",
    name: "Bazaar Dramas Urdu", dial: "11", doc: "_channel_dramas", page: "channel/?c=dramas", auto: true, backup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-dramas.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    credits: "Dramas: full episodes from the TV channels' own YouTube channels (HUM TV, ARY Digital, Geo, Green, Express, ARY Zindagi, Geo Kahani, LTN Family, PTV Home, Aaj). Backup: public-domain classic films." },
  { id: "cooking", yt: true, web: "channel/ytc.html?c=cooking", ytMins: 15, tagline: "Recipes and cooking shows, day and night",
    name: "Bazaar Cooking", dial: "12", doc: "_channel_cooking", page: "channel/?c=cooking", auto: true, backup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-cooking.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    credits: "Cooking: recipes and shows from the cooks' own YouTube channels (Food Fusion, Kitchen with Amna, Sanjeev Kapoor, Masala TV and others). Backup: public-domain classic films." },
  // 14 (13 is kept for Latest Movies): for 12 to 16 year olds; Bazaar Kids (5) stays for small children.
  // The owner's wish: just "Latest Movies", newest uploads first, with its own Latest Movies logo (no Bazaar).
  { id: "latest", yt: true, web: "channel/ytc.html?c=latest", ytMins: 120, newest: true, tagline: "The newest full movies in Hindi, English, Punjabi and Urdu",
    name: "Latest Movies", dial: "13", doc: "_channel_latest", page: "channel/?c=latest", auto: true, backup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/latest-movies.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    credits: "Latest Movies: the newest full films from the studios' and TV channels' own YouTube channels (Goldmines, Pen Movies, Shemaroo, FilmRise, Popcornflix, White Hill, ARY, HUM and others). Backup: public-domain classic films." },
  { id: "teens", yt: true, web: "channel/ytc.html?c=teens", ytMins: 12, tagline: "Science, cartoons and challenges for teens, day and night",
    name: "Bazaar Teens", dial: "14", doc: "_channel_teens", page: "channel/?c=teens", auto: true, backup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-teens.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    credits: "Teens: science, cartoons and challenge shows from their makers' own YouTube channels (Kurzgesagt, TED-Ed, Mark Rober, Cartoon Network, Dude Perfect and others). Backup: public-domain classic films." },
  // 15 (owner, 2026-10-07): ads and promos round the clock, played by our own player (no YouTube):
  // our Cable TV promos, then the sponsors' ads from /sponsors, then "Advertise with us" (ads-schedule.json).
  { id: "ads", name: "Bazaar Ads", dial: "15", doc: "_channel_ads", page: "channel/?c=ads", auto: true, noPopup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-ads.png", ready: "https://tv.bulkbazaar.ca/channel/ads-schedule.json",
    credits: "Ads: our own Cable TV promos and our sponsors' ads. Advertise your business here: WhatsApp 437 602 6500 or tv.bulkbazaar.ca/advertise." },
  // 16 (owner, 2026-10-08): Hindi serials, full episodes from the Indian TV channels' own YouTube channels.
  { id: "hindidramas", yt: true, web: "channel/ytc.html?c=hindidramas", ytMins: 25, tagline: "Hindi dramas, day and night",
    name: "Bazaar Dramas Hindi", dial: "16", doc: "_channel_hindidramas", page: "channel/?c=hindidramas", auto: true, backup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-dramas-hindi.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    credits: "Hindi dramas: full episodes from the TV channels' own YouTube channels (StarPlus, Sony SAB, Sony Pal, Sony TV, Colors, &TV, Dangal, Shemaroo, Sun Neo, Doordarshan). Backup: public-domain classic films." },
  // 17 (owner, 2026-10-08): Urdu and Hindi poetry. The day has a shape ([dayparts], Toronto time: classic readings
  // in the morning, TV mushairas in the afternoon, the big mushairas in the evening, young poets at night), and
  // every hour our own "Aaj ka Sher" ([ownClips], tools/shayari) plays between programmes.
  { id: "shayari", yt: true, web: "channel/ytc.html?c=shayari", ytMins: 20, tagline: "Urdu and Hindi poetry, mushaira and kavi sammelan, day and night",
    name: "Bazaar Shayari", nameUrdu: "سپارک شاعری", urduBug: "https://tv.bulkbazaar.ca/channel/logos/spark-shayari-urdu.png",
    dial: "17", doc: "_channel_shayari", page: "channel/?c=shayari", auto: true, backup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-shayari.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    ownClips: "shayari-clips.json",
    dayparts: [
      { from: 0, labels: ["The Social House", "Kommune", "Rekhta"] },
      { from: 6, labels: ["Hindi Kavita", "Urdu Studio", "Sahitya Tak", "Rekhta"] },
      { from: 12, labels: ["PTV Home", "PTV National", "DD Urdu", "Doordarshan", "Sahitya Akademi"] },
      { from: 18, labels: ["Rekhta", "Lahore Literary Festival", "Faiz Festival", "Mushaira Media", "Kumar Vishwas", "Kommune"] },
    ],
    credits: "Poetry: mushairas, kavi sammelan and recitations from the organisers', TV channels' and poets' own YouTube channels (Rekhta, Sahitya Akademi, DD Urdu, Doordarshan, PTV, Lahore Literary Festival, Faiz Festival, Mushaira Media, Sahitya Tak, Kumar Vishwas, Kommune, The Social House, Hindi Kavita). Aaj ka Sher: classic poets whose work is free to use, read by an AI voice. Backup: public-domain classic films." },
];

/** The date, weekday (0 = Sunday), hour and minute of [ms] in time zone [tz]. */
function parts(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: WEEKDAYS.indexOf(p.weekday.toLowerCase().slice(0, 3)), hour: +p.hour, minute: +p.minute };
}

/** Milliseconds for [date] "yyyy-mm-dd" at [hh]:[mm] in time zone [tz]. */
export function zonedTime(date, hh, mm, tz) {
  const [y, m, d] = date.split("-").map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle the time zone offset (also across a daylight-saving change).
  for (let i = 0; i < 2; i++) {
    const p = parts(guess, tz);
    const [py, pm, pd] = p.date.split("-").map(Number);
    const shown = Date.UTC(py, pm - 1, pd, p.hour, p.minute);
    guess += Date.UTC(y, m - 1, d, hh, mm) - shown;
  }
  return guess;
}

export function onDay(day, date, weekday) {
  if (!day || day === "all") return true;
  if (day === "weekdays") return weekday >= 1 && weekday <= 5;
  if (day === "weekend") return weekday === 0 || weekday === 6;
  const i = WEEKDAYS.indexOf(day);
  if (i >= 0) return i === weekday;
  return day === date;
}

/** Days since 1970-01-01 for "yyyy-mm-dd"; null when it isn't a date. */
function dayNumber(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
}

/** How many times a slot on [day] came round from [since] up to (not counting) [date]; 0 before [since]. Same as the app. */
export function airingsBefore(day, since, date) {
  const from = dayNumber(since), to = dayNumber(date);
  if (from == null || to == null || to <= from) return 0;
  const n = to - from;
  const startWeekday = (((from + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday; 0 = Sunday
  let perWeek = 0;
  for (let w = 0; w < 7; w++) if (onDay(day, "", w)) perWeek++;
  let count = Math.floor(n / 7) * perWeek;
  for (let i = 0; i < n % 7; i++) if (onDay(day, "", (startWeekday + i) % 7)) count++;
  return count;
}

/** The video slot [s] plays on [date]: for a weekly show, that airing's episode. */
export function episodeOn(s, date, byId) {
  const eps = (s.episodes || []).filter(id => byId[id]);
  if (!eps.length) return byId[s.video];
  return byId[eps[airingsBefore(s.day, s.since, date) % eps.length]];
}

/** The slot start times around [now]: yesterday, today and tomorrow. */
function starts(c, now) {
  const tz = c.tz || "America/Toronto";
  const byId = Object.fromEntries((c.videos || []).map(v => [v.id, v]));
  const out = [];
  for (const offset of [-1, 0, 1]) {
    const { date, weekday } = parts(now + offset * 86400000, tz);
    for (const s of c.slots || []) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(s.time || "");
      if (!m || !onDay(s.day, date, weekday)) continue;
      const video = episodeOn(s, date, byId);
      if (!video) continue;
      out.push({ at: zonedTime(date, +m[1], +m[2], tz), video, dated: (s.day || "").length === 10, show: s.show || "" });
    }
  }
  out.sort((a, b) => a.at - b.at || (a.dated ? -1 : 1));
  return out.filter((s, i) => i === 0 || s.at !== out[i - 1].at);
}

/**
 * What [c] plays at [now]: { video, offset (ms into it), until (ms, when the schedule moves on), slot }
 * or { off: true, next, nextAt }.
 */
export function whatsOn(c, now = Date.now()) {
  const byId = Object.fromEntries((c.videos || []).map(v => [v.id, v]));
  const all = starts(c, now);
  let current = null, next = null;
  for (const s of all) { if (s.at <= now) current = s; else if (!next) next = s; }
  const nextAt = next ? next.at : Infinity;
  if (current) {
    const end = current.video.secs > 0 ? current.at + current.video.secs * 1000 : Infinity;
    if (now < end) return { video: current.video, offset: now - current.at, until: Math.min(end, nextAt), slot: true, show: current.show };
  }
  // After a time slot the loop starts again from the top; before any slot it runs on the clock.
  // The loop starts from the top at midnight (the channel's time) and waits during each slot, carrying
  // on after it (since 1.9.69, for the hourly news). Same as MyChannel.whatsOn in the app.
  const tz = c.tz || "America/Toronto";
  const midnight = zonedTime(parts(now, tz).date, 0, 0, tz);
  let slotTime = 0;
  all.forEach((s, i) => {
    if (s.at >= now) return;
    const cut = all[i + 1] ? all[i + 1].at : Infinity;
    const end = Math.min(s.video.secs > 0 ? s.at + s.video.secs * 1000 : Infinity, cut, now);
    slotTime += Math.max(0, end - Math.max(s.at, midnight));
  });
  const anchor = midnight + slotTime;
  const loopIds = (c.loop || []).filter(id => byId[id]);
  const loop = loopIds.map(id => byId[id]).filter(v => v.secs > 0);
  const total = loop.reduce((t, v) => t + v.secs * 1000, 0);
  if (total > 0) {
    let pos = (((now - anchor) % total) + total) % total;
    for (const [i, v] of loop.entries()) {
      const len = v.secs * 1000;
      if (pos < len) return { video: v, offset: pos, until: Math.min(now - pos + len, nextAt), slot: false, loopIndex: i, nextAt };
      pos -= len;
    }
  }
  const live = loopIds.map(id => byId[id]).find(v => !(v.secs > 0));
  if (live) return { video: live, offset: 0, until: nextAt, slot: false };
  return { off: true, next: next ? next.video : null, nextAt: next ? next.at : null };
}

/** The programme guide from [from] on: [{ at, video, slot }], at most [max] entries within [hours]. */
export function guide(c, from = Date.now(), hours = 12, max = 60) {
  const out = [];
  let t = from;
  const stop = from + hours * 3600000;
  while (t < stop && out.length < max) {
    const now = whatsOn(c, t);
    if (now.off) {
      if (!now.nextAt) break;
      t = now.nextAt;
      continue;
    }
    // Each entry starts and ends at real clock times. A programme a time slot (the news) cut into
    // comes back after it as its own entry, "resumed", carrying on where it stopped.
    const start = out.length ? t : t - now.offset;
    const prev = out[out.length - 1];
    if (prev && prev.video.id === now.video.id && prev.end === t && !now.slot) prev.end = now.until;
    else out.push({ at: start, end: now.until, video: now.video, slot: now.slot, show: now.show || "", resumed: !!out.length && now.offset > 1000 });
    if (!isFinite(now.until)) break;
    t = Math.max(now.until, t + 1000);
  }
  return out;
}

/*
 * A card over the picture (owner, 2026-10-07): every 10 minutes what's coming next, and every
 * 20 minutes today's shows first. It comes up with the first ad or ident of each 10 minutes, so
 * it rides on the breaks, or 8 minutes in when there's no break. Worked out from the clock, so
 * every viewer sees it at the same moment. Same as MyChannel.cardAt in the app.
 */
export const CARD_WINDOW_MS = 10 * 60000, TODAY_CARD_MS = 20000, NEXT_CARD_MS = 12000;
const isBreak = v => v && (v.kind === "ad" || v.kind === "ident");
const cardStarts = new Map();

/** { today: true/false, until } while a card is up at [now], else null. */
export function cardAt(c, now = Date.now()) {
  const window = now - (((now % CARD_WINDOW_MS) + CARD_WINDOW_MS) % CARD_WINDOW_MS);
  let byWindow = cardStarts.get(c);
  if (!byWindow) { byWindow = new Map(); cardStarts.set(c, byWindow); if (cardStarts.size > 4) cardStarts.delete(cardStarts.keys().next().value); }
  if (!byWindow.has(window)) {
    byWindow.set(window, firstBreak(c, window, window + 8 * 60000) ?? window + 8 * 60000);
    if (byWindow.size > 8) byWindow.delete(byWindow.keys().next().value);
  }
  const at = byWindow.get(window);
  const today = Math.floor(window / CARD_WINDOW_MS) % 2 === 0;
  const todayEnd = today ? at + TODAY_CARD_MS : at;
  if (now < at) return null;
  if (now < todayEnd) return { today: true, until: todayEnd };
  if (now < todayEnd + NEXT_CARD_MS) return { today: false, until: todayEnd + NEXT_CARD_MS };
  return null;
}

/** When the first ad or ident between [from] and [to] starts (or [from], if one is on); null when none. */
function firstBreak(c, from, to) {
  let t = from;
  for (let i = 0; i < 60 && t < to; i++) {
    const now = whatsOn(c, t);
    if (now.off) { if (!now.nextAt) return null; t = now.nextAt; continue; }
    if (isBreak(now.video)) return t;
    if (!isFinite(now.until)) return null;
    t = Math.max(now.until, t + 1000);
  }
  return null;
}

/** The next [count] programmes after [now] (ads and idents left out): [{ at, title, booked }]. */
export function upNext(c, now = Date.now(), count = 2) {
  const out = [];
  let t = now;
  for (let guard = 0; out.length < count && guard < 120 && t < now + 86400000; guard++) {
    const on = whatsOn(c, t);
    if (on.off) { if (!on.nextAt) break; t = on.nextAt; continue; }
    const start = t - on.offset;
    if (start > now && !isBreak(on.video) && (!out.length || out[out.length - 1].at !== start))
      out.push({ at: start, title: on.show || on.video.title, booked: !!on.slot, more: 0 });
    if (!isFinite(on.until)) break;
    t = Math.max(on.until, t + 1000);
  }
  return out;
}

/**
 * Today's booked shows (time slots) from the one on now, in the channel's day; a show booked many
 * times today (the hourly news) shows once, at its next time, with how many more follow ([more]).
 * When nothing is booked today, the next programmes instead.
 */
export function todaysShows(c, now = Date.now(), max = 7) {
  const tz = c.tz || "America/Toronto";
  const today = parts(now, tz).date;
  const list = starts(c, now).filter(s => parts(s.at, tz).date === today);
  if (!list.length) return upNext(c, now, max);
  let from = -1;
  list.forEach((s, i) => { if (s.at <= now) from = i; });
  // From the slot on now (it began before now and is still playing).
  if (from < 0 || list[from].at + (list[from].video.secs || 0) * 1000 <= now) from += 1;
  const left = list.slice(from);
  const title = s => s.show || s.video.title;
  const counts = {};
  for (const s of left) counts[title(s)] = (counts[title(s)] || 0) + 1;
  const seen = new Set(), out = [];
  for (const s of left) {
    if (seen.has(title(s))) continue;
    seen.add(title(s));
    out.push({ at: s.at, title: title(s), booked: true, more: counts[title(s)] - 1 });
    if (out.length >= max) break;
  }
  // Late in the day with few shows left, the next programmes fill it up.
  if (out.length < 3) for (const u of upNext(c, now, 4)) {
    if (out.length >= 3) break;
    if (!seen.has(u.title) && parts(u.at, tz).date === today) { seen.add(u.title); out.push(u); }
  }
  return out.sort((a, b) => a.at - b.at);
}

export function timeText(ms, tz) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: tz || undefined });
}

export function lengthText(secs) {
  if (!(secs > 0)) return "live";
  const h = Math.floor(secs / 3600), m = Math.floor(secs % 3600 / 60), s = Math.round(secs % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Plays [c] in [video] (a <video> element) as live TV: joins the current programme at the right spot. */
/**
 * Something short to play when a programme ends before the schedule moves on (the owner, 2026-10-07: never a
 * still picture or dead air): the channel's fillers (or its ads), taking turns by the minute, the first that fits
 * in [leftMs] and isn't [skip] (the one just played); the shortest when none fits. Same as MyChannel.filler.
 */
export function fillerFor(c, leftMs, now = Date.now(), skip = null) {
  const byId = Object.fromEntries((c.videos || []).map(v => [v.id, v]));
  let pool = (c.fillers || []).map(id => byId[id]).filter(Boolean);
  if (!pool.length) pool = (c.videos || []).filter(v => v.kind === "ad");
  pool = pool.filter((v, i, a) => v.secs >= 1 && v.secs <= 660 && !youtubeId(v.url) && a.findIndex(w => w.url === v.url) === i);
  if (!pool.length) return null;
  const start = Math.floor(now / 60000) % pool.length;
  const turn = pool.slice(start).concat(pool.slice(0, start));
  const others = turn.filter(v => v.url !== skip);
  return others.find(v => v.secs * 1000 <= leftMs)
    || others.reduce((a, v) => (!a || v.secs < a.secs ? v : a), null) || turn[0];
}

export function tuneIn(video, c, { onChange, onOff, onBlock } = {}) {
  let timer = null, hls = null, playing = null, stopped = false, lastFiller = null;
  async function step() {
    clearTimeout(timer);
    if (stopped) return;
    const now = Date.now();
    const on = whatsOn(c, now);
    if (on.off) {
      playing = null;
      if (hls) { hls.destroy(); hls = null; }
      video.removeAttribute("src"); video.load();
      onBlock && onBlock(null);
      onOff && onOff(on);
      timer = setTimeout(step, Math.min(60000, Math.max(1000, (on.nextAt || now + 60000) - now)));
      return;
    }
    const zero = on.video.secs > 0 ? now - on.offset : null;
    const key = on.video.url + "|" + zero;
    if (key !== playing) {
      playing = key;
      // Bazaar TV's upcoming trailers play on our locked YouTube page (onBlock), not in this player.
      const block = youtubeId(on.video.url) ? blockAt(c, now) : null;
      if (block) {
        if (hls) { hls.destroy(); hls = null; }
        video.pause(); video.removeAttribute("src"); video.load();
      } else await load(on.video.url, zero);
      onBlock && onBlock(block);
      onChange && onChange(on);
    }
    timer = setTimeout(step, Math.min(60000, Math.max(1000, on.until - now)));
  }
  async function load(url, zero) {
    if (hls) { hls.destroy(); hls = null; }
    const seek = () => { if (zero != null) { try { video.currentTime = Math.max(0, (Date.now() - zero) / 1000); } catch {} } };
    video.addEventListener("loadedmetadata", seek, { once: true });
    if (/\.m3u8(\?|$)/i.test(url) && !video.canPlayType("application/vnd.apple.mpegurl")) {
      if (!window.Hls) await new Promise((ok, fail) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js";
        s.onload = ok; s.onerror = fail; document.head.appendChild(s);
      });
      hls = new window.Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url;
    }
    video.play().catch(() => {});
  }
  // A programme that ends before its time is up: short fillers until the schedule moves on.
  video.addEventListener("ended", () => {
    const now = Date.now(), on = whatsOn(c, now);
    const left = on.off ? 0 : on.until - now;
    const f = left > 3000 && !youtubeId(on.video.url) ? fillerFor(c, left, now, lastFiller) : null;
    if (!f) return step();
    lastFiller = f.url;
    load(f.url, null);
  });
  step();
  return {
    update(newConfig) { c = newConfig; playing = null; step(); },
    stop() { stopped = true; clearTimeout(timer); if (hls) hls.destroy(); video.pause(); },
  };
}

/** The YouTube video id of [url] (Bazaar TV's upcoming trailers), or null. */
export function youtubeId(url) {
  const m = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url || "");
  return m ? m[1] : null;
}

/**
 * The run of YouTube videos [c] has on at [now] (Bazaar TV's upcoming trailers): { videos, start, end },
 * played on channel/block.html; null while our own player plays. Same as MyChannel.block in the app.
 */
export function blockAt(c, now = Date.now()) {
  const on = whatsOn(c, now);
  if (on.off || !youtubeId(on.video.url)) return null;
  const begun = now - on.offset;
  if (on.loopIndex === undefined) return { videos: [on.video], start: begun, end: on.until };
  const byId = Object.fromEntries((c.videos || []).map(v => [v.id, v]));
  const loop = (c.loop || []).map(id => byId[id]).filter(v => v && v.secs > 0);
  let first = on.loopIndex, last = on.loopIndex, start = begun, end = begun + on.video.secs * 1000;
  while (first > 0 && youtubeId(loop[first - 1].url)) { first--; start -= loop[first].secs * 1000; }
  while (last + 1 < loop.length && youtubeId(loop[last + 1].url)) { last++; end += loop[last].secs * 1000; }
  // The next time slot (the news) cuts it short; the rest follows after it, on a new page.
  return { videos: loop.slice(first, last + 1), start, end: Math.min(end, on.nextAt) };
}

/** The address of channel/block.html playing [b] for channel settings [c]. */
export function blockPage(c, b) {
  const p = new URLSearchParams({ at: b.start, until: b.end, ids: b.videos.map(v => youtubeId(v.url)).join(","),
    secs: b.videos.map(v => v.secs).join(","), name: c.name || "Bazaar TV One", corner: c.logoCorner || "tr" });
  if (c.logo) p.set("logo", c.logo);
  if (c.tickerOn !== false && c.ticker) p.set("tick", c.ticker);
  return "https://tv.bulkbazaar.ca/channel/block.html?" + p;
}

/**
 * [c] with each "trailers", "music" or "list" entry replaced by the videos of its list (rebuilt every day), as the app
 * does (MyChannel.expand): each loop place gets the whole list; a time slot can't hold a list.
 */
const listCache = {};
export async function expand(c) {
  const lists = (c.videos || []).filter(v => ["trailers", "music", "list", "ads"].includes(v.kind) && /^https?:/.test(v.url || ""));
  if (!lists.length) return c;
  const ids = {}, videos = [];
  for (const v of c.videos) {
    if (!lists.includes(v)) { videos.push(v); continue; }
    let list = [];
    try {
      // Fetched at most every 10 minutes (the lists change once a day).
      const hit = listCache[v.url];
      if (hit && Date.now() - hit.at < 600000) list = hit.videos;
      else {
        const o = await (await fetch(v.url, { cache: "no-store" })).json();
        list = (v.kind === "ads" ? o.ads || o.promos : o.videos) || [];
        listCache[v.url] = { at: Date.now(), videos: list };
      }
    } catch {}
    ids[v.id] = [];
    if (v.kind === "ads") {
      // Bazaar Ads: our promos or the sponsors' ads, our own videos ([src] beside the list or a full link), 5 to 60 s each.
      list.forEach((t, i) => {
        const secs = Math.min(60, Math.round(t.secs || 0));
        if (!t.src || secs < 5) return;
        const id = `${v.id}-${i}`;
        videos.push({ id, title: t.title || v.title || "Ad", url: new URL(t.src, v.url).href, secs, kind: "ad" });
        ids[v.id].push(id);
      });
      continue;
    }
    for (const t of list) {
      if (!/^[\w-]{11}$/.test(t.id || "") || !(t.secs > 0)) continue;
      const id = `${v.id}-${t.id}`;
      if (!ids[v.id].includes(id)) videos.push({ id, title: t.title, url: "https://www.youtube.com/watch?v=" + t.id, secs: t.secs, kind: "programme" });
      ids[v.id].push(id);
    }
  }
  return { ...c, videos, loop: (c.loop || []).flatMap(id => ids[id] || [id]), slots: (c.slots || []).filter(s => !ids[s.video]) };
}
