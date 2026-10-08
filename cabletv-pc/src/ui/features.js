// Counts how long each part of the app is used, and how often it's opened, per day (Features.kt), so the
// owner can see which features viewers use most on tv.bulkbazaar.ca/users and /stats. Same keys as the TV
// app: the packages' feature keys ("five", "two", "four", "six"...) plus "list" (1+List) and "full".
import { today } from './util.js';
import * as store from './store.js';

const DAY = 86400000;
let days = store.get('features.days', {});
let current = null;
let since = 0;
let foreground = true;

(function prune() {
  const keep = today(Date.now() - 7 * DAY);
  for (const d of Object.keys(days)) if (d < keep) delete days[d];
})();

function add() {
  const now = Date.now();
  // A gap of over 6 hours means the clock jumped or the PC slept.
  if (current && foreground && since > 0 && now - since > 0 && now - since < 6 * 3600000) {
    const m = (days[today(now)] ||= {});
    (m[current] ||= { s: 0, o: 0 }).s += Math.floor((now - since) / 1000);
  }
  since = now;
}

/** [key] is on screen now (an open counts when it changes). */
export function use(key) {
  if (key === current) return;
  add();
  current = key;
  const m = (days[today(Date.now())] ||= {});
  (m[key] ||= { s: 0, o: 0 }).o += 1;
}

/** The part of the app on screen now. */
export const using = () => current;

/** The window was minimised (false) or came back (true). */
export function setForeground(on) {
  add();
  foreground = on;
  if (!on) store.set('features.days', days);
}

/** Every day's totals so far: { day: { key: { s, o } } }. */
export function totals() {
  add();
  store.set('features.days', days);
  return structuredClone(days);
}

/** Days before today, once sent, are no longer needed. */
export function sent(day) {
  if (day < today(Date.now()) && days[day]) { delete days[day]; store.set('features.days', days); }
}
