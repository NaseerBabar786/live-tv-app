// Counts how long each channel is watched per day, for the owner's stats page (Watching.kt). The keys
// are the same as the TV app's, so a channel's PC and TV minutes add up on tv.bulkbazaar.ca/stats.
import { javaHashHex, today } from './util.js';
import { whatsOn } from './shared/schedule.js';
import * as mine from './mychannel.js';
import * as store from './store.js';

const DAY = 86400000;
let days = store.get('watching.days', {});
let progs = store.get('watching.programmes', {});
let hours = store.get('watching.hours', {});
const screens = new Map();
let current = null;
let since = 0;
let foreground = true;

(function prune() {
  const keep = today(Date.now() - 7 * DAY);
  for (const m of [days, progs, hours]) for (const d of Object.keys(m)) if (d < keep) delete m[d];
})();

function startOfNextDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** The hour and weekday of [t] in [tz]. */
function zoned(t, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), hour: p.hour };
}

function addProgrammes(day, ch, from, to) {
  if (mine.webPage(ch)) return;
  const c = mine.configOf(ch);
  if (!c) return;
  const tz = c.tz || c.timeZone || 'America/Toronto';
  let t = from, guard = 0;
  while (t < to && guard++ < 500) {
    const hourEnd = (Math.floor(t / 3600000) + 1) * 3600000; // whole hours line up in every zone used
    const on = whatsOn(c, t);
    let end = Math.min(to, hourEnd);
    if (!on.off && on.video) {
      end = Math.max(Math.min(end, on.until), t + 1000);
      const secs = Math.floor((Math.min(end, to) - t) / 1000);
      if (secs > 0) {
        const title = String(on.video.title || '').slice(0, 80);
        const key = javaHashHex(`${c.id}|${title}`);
        const m = (progs[day] ||= {});
        (m[key] ||= { t: title, st: c.id, sh: String(on.show || '').slice(0, 80), s: 0 }).s += secs;
        const z = zoned(t, tz);
        const slot = `${c.id}|${z.weekday}-${z.hour}`;
        const h = (hours[day] ||= {});
        h[slot] = (h[slot] || 0) + secs;
      }
    } else {
      end = Math.max(Math.min(end, on.nextAt || end), t + 1000);
    }
    t = end;
  }
}

let lastName = null, lastAt = 0;

function add() {
  const now = Date.now();
  const ch = current;
  if (ch && foreground) { lastName = ch.name.slice(0, 80); lastAt = now; }
  if (ch && foreground && since > 0) {
    let from = since;
    while (from < now) {
      const day = today(from);
      const to = Math.min(now, startOfNextDay(from));
      // A gap of over 6 hours means the clock jumped or the PC slept.
      if (to - from < 6 * 3600000) {
        const key = javaHashHex(ch.url);
        const m = (days[day] ||= {});
        const e = (m[key] ||= { n: ch.name.slice(0, 80), c: ch.country || '', g: String(ch.group || '').slice(0, 60), t: String(ch.category || '').slice(0, 40), s: 0 });
        e.s += Math.floor((to - from) / 1000);
        if (mine.isMine(ch)) { try { addProgrammes(day, ch, from, to); } catch {} }
      }
      from = to;
    }
  }
  since = now;
}

function save() {
  store.set('watching.days', days);
  store.set('watching.programmes', progs);
  store.set('watching.hours', hours);
}

/** [screen] now shows [ch] as its main picture; the newest screen counts. */
export function watch(screen, ch) {
  add();
  screens.delete(screen);
  screens.set(screen, ch);
  current = ch;
  if (foreground) { lastName = ch.name.slice(0, 80); lastAt = Date.now(); }
}

/** The last channel watched, when it was last on screen and whether it's on now (for the owner's /users page). */
export function now() {
  add();
  return lastName ? { name: lastName, at: lastAt, live: !!current && foreground } : null;
}

export function stop(screen) {
  if (!screens.delete(screen)) return;
  add();
  current = [...screens.values()].pop() || null;
}

/** The window was minimised (false) or came back (true). */
export function setForeground(on) {
  add();
  foreground = on;
  if (!on) save();
}

/** Every day's totals so far, oldest first: [day, { channels, programmes, hours }]. */
export function totals() {
  add();
  save();
  const all = [...new Set([...Object.keys(days), ...Object.keys(progs), ...Object.keys(hours)])].sort();
  return all.map((d) => [d, { channels: structuredClone(days[d] || {}), programmes: structuredClone(progs[d] || {}), hours: { ...(hours[d] || {}) } }]);
}

/** Days before today, once sent, are no longer needed. */
export function sent(day) {
  if (day < today()) {
    delete days[day]; delete progs[day]; delete hours[day];
    save();
  }
}
