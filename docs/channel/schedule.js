// The owner's channel: works out what is on at any moment from the saved settings.
// The same rules as the app (MyChannel.kt), so the website and every TV show the same thing.
//
// Settings: { name, logo, logoCorner, active, tz, ticker, tickerOn,
//             videos: [{ id, title, url, secs, kind }], slots: [{ day, time, video }], loop: [ids] }

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const TEST_SCHEDULE_URL = "https://tv.bulkbazaar.ca/channel/test-schedule.json";

/**
 * Our channels. [doc] is the owner's copy in Firestore sponsors/ (the app reads it) and channel/[id]
 * the public copy; [ready] plays until the owner saves anything. Keep in step with MyChannel.STATIONS.
 * [yt] channels run like Bazaar Hits (1.9.47): official YouTube videos on [web] (channel/ytc.html),
 * locked; their schedule ([ready] or the owner's saved one) is the backup when YouTube won't play.
 */
export const STATIONS = [
  { id: "main", name: "Bazaar TV", dial: "1", doc: "_channel", page: "channel/",
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-tv.png", ready: TEST_SCHEDULE_URL,
    credits: "Shows are public domain or Creative Commons works. Blender films: Blender Foundation, blender.org (CC BY). Space videos: NASA." },
  { id: "filmein", yt: true, web: "channel/ytc.html?c=filmein", ytMins: 120, tagline: "Full films from the studios' own channels, day and night",
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
  { id: "sports", yt: true, web: "channel/ytc.html?c=sports", ytMins: 8, tagline: "Cricket, wrestling and more, day and night",
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
  { id: "english", yt: true, web: "channel/ytc.html?c=english", ytMins: 100, tagline: "Full English films, day and night",
    name: "Bazaar Movies English", dial: "9", doc: "_channel_english", page: "channel/?c=english", auto: true, backup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-english.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    credits: "Films: full films from the studios' and distributors' own YouTube channels. Backup: public-domain classics from the Internet Archive." },
  { id: "hindi", yt: true, web: "channel/ytc.html?c=hindi", ytMins: 140, tagline: "Full Hindi films, day and night",
    name: "Bazaar Movies Hindi", dial: "10", doc: "_channel_hindi", page: "channel/?c=hindi", auto: true, backup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-hindi.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    credits: "Films: full Hindi films from the studios' own YouTube channels. Backup: public-domain classics from the Internet Archive." },
  { id: "dramas", yt: true, web: "channel/ytc.html?c=dramas", ytMins: 40, tagline: "Pakistani dramas, day and night",
    name: "Bazaar Dramas", dial: "11", doc: "_channel_dramas", page: "channel/?c=dramas", auto: true, backup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-dramas.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    credits: "Dramas: full episodes from the TV channels' own YouTube channels (HUM TV, ARY Digital, Geo, Green). Backup: public-domain classic films." },
  { id: "cooking", yt: true, web: "channel/ytc.html?c=cooking", ytMins: 15, tagline: "Recipes and cooking shows, day and night",
    name: "Bazaar Cooking", dial: "12", doc: "_channel_cooking", page: "channel/?c=cooking", auto: true, backup: true,
    logo: "https://tv.bulkbazaar.ca/channel/logos/bazaar-cooking.png", ready: "https://tv.bulkbazaar.ca/channel/filmein-schedule.json",
    credits: "Cooking: recipes and shows from the cooks' own YouTube channels (Food Fusion, Kitchen with Amna, Sanjeev Kapoor, Masala TV and others). Backup: public-domain classic films." },
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

/** The slot start times around [now]: yesterday, today and tomorrow. */
function starts(c, now) {
  const tz = c.tz || "America/Toronto";
  const byId = Object.fromEntries((c.videos || []).map(v => [v.id, v]));
  const out = [];
  for (const offset of [-1, 0, 1]) {
    const { date, weekday } = parts(now + offset * 86400000, tz);
    for (const s of c.slots || []) {
      const video = byId[s.video];
      const m = /^(\d{1,2}):(\d{2})$/.exec(s.time || "");
      if (!video || !m || !onDay(s.day, date, weekday)) continue;
      out.push({ at: zonedTime(date, +m[1], +m[2], tz), video, dated: (s.day || "").length === 10 });
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
    if (now < end) return { video: current.video, offset: now - current.at, until: Math.min(end, nextAt), slot: true };
  }
  // After a time slot the loop starts again from the top; before any slot it runs on the clock.
  let anchor = 0;
  all.forEach((s, i) => {
    if (s.at > now) return;
    const cut = all[i + 1] ? all[i + 1].at : Infinity;
    const end = Math.min(s.video.secs > 0 ? s.at + s.video.secs * 1000 : Infinity, cut);
    if (end <= now) anchor = Math.max(anchor, end);
  });
  const loopIds = (c.loop || []).filter(id => byId[id]);
  const loop = loopIds.map(id => byId[id]).filter(v => v.secs > 0);
  const total = loop.reduce((t, v) => t + v.secs * 1000, 0);
  if (total > 0) {
    let pos = (((now - anchor) % total) + total) % total;
    for (const v of loop) {
      const len = v.secs * 1000;
      if (pos < len) return { video: v, offset: pos, until: Math.min(now - pos + len, nextAt), slot: false };
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
    const start = t - now.offset;
    if (!out.length || out[out.length - 1].at !== start || out[out.length - 1].video.id !== now.video.id) {
      out.push({ at: start, video: now.video, slot: now.slot });
    }
    if (!isFinite(now.until)) break;
    t = Math.max(now.until, t + 1000);
  }
  return out;
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
export function tuneIn(video, c, { onChange, onOff } = {}) {
  let timer = null, hls = null, playing = null, stopped = false;
  async function step() {
    clearTimeout(timer);
    if (stopped) return;
    const now = Date.now();
    const on = whatsOn(c, now);
    if (on.off) {
      playing = null;
      if (hls) { hls.destroy(); hls = null; }
      video.removeAttribute("src"); video.load();
      onOff && onOff(on);
      timer = setTimeout(step, Math.min(60000, Math.max(1000, (on.nextAt || now + 60000) - now)));
      return;
    }
    const zero = on.video.secs > 0 ? now - on.offset : null;
    const key = on.video.url + "|" + zero;
    if (key !== playing) {
      playing = key;
      await load(on.video.url, zero);
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
  video.addEventListener("ended", () => step());
  step();
  return {
    update(newConfig) { c = newConfig; playing = null; step(); },
    stop() { stopped = true; clearTimeout(timer); if (hls) hls.destroy(); video.pause(); },
  };
}
