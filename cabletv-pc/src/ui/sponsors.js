// The businesses that pay to be shown in Cable TV, as the owner set them up on tv.bulkbazaar.ca/sponsors
// (Sponsors.kt), and how often each was shown (SponsorViews).
import { siteUrl, today } from './util.js';
import * as store from './store.js';
import * as fb from './firebase.js';

const TICKER_ID = '_ticker';
export const DEFAULT_TICKER = 'Advertise your business on Cable TV  ·  WhatsApp 437 602 6500  ·  tv.bulkbazaar.ca/advertise';

let all = store.get('sponsors.list', []);
let ticker = store.get('sponsors.ticker', DEFAULT_TICKER);

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** The address OK opens: the website box, else the contact box when it's a web address. */
export function site(s) {
  return siteUrl(s.website) || siteUrl(s.contact) || (/bulk bazaar/i.test(s.name) ? 'https://bulkbazaar.ca' : null);
}
const showsOn = (s, day) => s.active && s.image && (!s.start || day >= s.start) && (!s.end || day <= s.end);

/** Today's sponsors, in the order the owner added them. */
export const current = () => all.filter((s) => showsOn(s, today()));
/** The scrolling "advertise with us" line; null when the owner turned it off. */
export const tickerText = () => ticker;

/** Fetches the owner's latest list; keeps the saved one when offline. */
export async function refresh(account) {
  if (!account.user()) return;
  try {
    const docs = await fb.list('sponsors', { limit: 50, token: await account.token() });
    let line = DEFAULT_TICKER;
    const list = [];
    for (const [id, f] of docs) {
      if (id === TICKER_ID) {
        const words = String(f.text || '').trim().replace('Free Live TV', 'Cable TV');
        line = f.active && words ? words : null;
        continue;
      }
      list.push({
        id, name: f.name || '', line: f.line || '', contact: f.contact || '', start: f.start || '', end: f.end || '',
        active: !!f.active, image: f.active ? f.image || '' : '', video: String(f.video || '').trim().startsWith('https://') ? String(f.video).trim() : '',
        website: String(f.website || '').trim(), popupVideo: f.popup === 'video', videoSecs: Math.round(Number(f.videoSecs) || 0),
      });
    }
    all = list;
    ticker = line;
    store.set('sponsors.list', all);
    store.set('sponsors.ticker', ticker ?? '');
    if (ticker === '') ticker = null;
    listeners.forEach((fn) => fn());
  } catch {}
}
if (ticker === '') ticker = null;

/** The next sponsor in turn for [place] ("start" or "card"); null when there are none today. */
export function next(place) {
  const list = current();
  if (!list.length) return null;
  const i = store.get(`sponsors.next.${place}`, 0);
  store.set(`sponsors.next.${place}`, i + 1);
  return list[((i % list.length) + list.length) % list.length];
}

// ---------- Views ----------

let views = store.get('sponsors.views', {});
(function prune() {
  const keep = today(Date.now() - 7 * 86400000);
  for (const d of Object.keys(views)) if (d < keep) delete views[d];
})();

/** [s] was shown at [place]: "start", "card", or "click" (its website was opened). */
export function count(s, place) {
  const d = (views[today()] ||= {});
  const e = (d[s.id] ||= { n: '' });
  e.n = s.name.slice(0, 80);
  e[place] = (e[place] || 0) + 1;
  store.set('sponsors.views', views);
}

export const viewsStore = {
  totals: () => Object.keys(views).sort().map((day) => [day, Object.fromEntries(Object.entries(views[day]).map(([id, s]) =>
    [id, { n: s.n, start: s.start || 0, strip: s.strip || 0, card: s.card || 0, bar: s.bar || 0, click: s.click || 0 }]))]),
  sent: (day) => { if (day < today()) { delete views[day]; store.set('sponsors.views', views); } },
};
