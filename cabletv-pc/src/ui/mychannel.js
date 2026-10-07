// Our own channels 1 to 14, run from tv.bulkbazaar.ca/studio (MyChannel.kt and MyChannelSync.kt in the
// TV app). Their schedule rules come from the website's docs/channel/schedule.js, copied in at build
// time, so the website, the TV app and this app agree on what's on.
import { STATIONS, expand, blockAt, youtubeId } from './shared/schedule.js';
import { FIREBASE } from './config.js';

const SCHEME = 'mychannel://';
/** Our channels take numbers 1 to 14; the other channels are numbered from 15. */
export const COUNT = 14;
export const HITS_NUMBER = 4;
export const BOLLYWOOD_URL = 'https://tv.bulkbazaar.ca/channel/bollywood.html';
/** Raised whenever our logos are redrawn at the same address (MyChannel.LOGO_VERSION). */
const LOGO_VERSION = 5;
/** The "v" the TV app adds to its pages' addresses, so a changed page is fetched afresh. */
const PAGE_VERSION = 'pc1';
/** Latest Movies carries no logo of ours on the picture (1.9.81). */
const NO_BUG = new Set(['latest']);
/** The rows of zeros that reached channels 1 to 8 before 1.9.45; they still work. */
const OLD_DIALS = { 0: 'main', '00': 'filmein', '000': 'sur', '00000': 'kids', '000000': 'sports', '0000000': 'travel', '00000000': 'comedy' };

export const freshLogo = (url) => (url && url.includes('/channel/logos/') && !url.includes('?') ? `${url}?v=${LOGO_VERSION}` : url);

const hits = { name: 'Bazaar Hits', url: BOLLYWOOD_URL, logo: freshLogo('https://tv.bulkbazaar.ca/channel/logos/bazaar-hits.png'), number: HITS_NUMBER, alternates: [] };

/** Station id -> its settings, for the channels the owner switched on. */
let configs = {};
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const isMine = (ch) => !!ch && (ch.url.startsWith(SCHEME) || ch.url === BOLLYWOOD_URL);
const idOf = (ch) => (ch && ch.url.startsWith(SCHEME) ? ch.url.slice(SCHEME.length) : null);
export const stationOf = (ch) => STATIONS.find((s) => s.id === idOf(ch)) || null;
export const configOf = (ch) => (isMine(ch) ? configs[idOf(ch)] || null : null);

/** Whether [ch] is one of ours with its own scrolling line along the bottom (MyChannel.hasTicker). */
export const hasTicker = (ch) => {
  const c = configOf(ch);
  return !!(c && c.tickerOn !== false && String(c.ticker || '').trim());
};

/** The channels that are on, in number order: 1 to 14, Bazaar Hits being 4. */
export function channels() {
  const mine = STATIONS.filter((s) => configs[s.id]).map((s) => ({
    name: s.name,
    url: SCHEME + s.id,
    logo: freshLogo(configs[s.id].logo || s.logo),
    number: Number(s.dial),
    alternates: [],
  }));
  return [...mine, hits].sort((a, b) => a.number - b.number);
}

/** The channel reached by typing [typed] the old way ("0", "00", "0000"), or 9 to 14, when it's on. */
export function byDial(typed) {
  if (typed === '0000') return hits;
  const id = OLD_DIALS[typed] || (Number(typed) >= 9 ? STATIONS.find((s) => s.dial === typed)?.id : null);
  return id ? channels().find((c) => c.url === SCHEME + id) || null : null;
}

/** Our page that plays [ch] like Bazaar Hits (official YouTube videos, locked), for a channel that runs that way. */
export function webPage(ch) {
  const st = stationOf(ch);
  return st && st.yt ? `https://tv.bulkbazaar.ca/channel/ytc.html?c=${st.id}&app=1` : null;
}

/**
 * The page of ours that plays [ch] in YouTube's player, locked: our YouTube channels, Bazaar Hits, or any
 * YouTube video in a channel list; null for channels our own player plays (MyChannel.pageFor).
 */
export function pageFor(ch) {
  if (!ch) return null;
  const web = webPage(ch);
  if (web) return `${web}&v=${PAGE_VERSION}`;
  if (ch.url === BOLLYWOOD_URL) return `${BOLLYWOOD_URL}?app=1&v=${PAGE_VERSION}`;
  const id = youtubeId(ch.url);
  if (!id) return null;
  return `https://tv.bulkbazaar.ca/channel/yt.html?app=1&v=${id}&name=${encodeURIComponent(ch.name)}&ver=${PAGE_VERSION}`;
}

/** Bazaar TV's run of YouTube videos on now (its upcoming trailers) on our locked page; null while our player plays. */
export function blockPage(ch, now = Date.now()) {
  const c = configOf(ch);
  if (!c || stationOf(ch)?.yt) return null;
  const b = blockAt(c, now);
  if (!b) return null;
  const p = new URLSearchParams({
    app: '1', at: b.start, until: b.end, ids: b.videos.map((v) => youtubeId(v.url)).join(','),
    secs: b.videos.map((v) => v.secs).join(','), name: c.name || 'Bazaar TV One', corner: c.logoCorner || 'tr',
  });
  if (c.logo) p.set('logo', c.logo);
  if (c.tickerOn !== false && c.ticker) p.set('tick', c.ticker);
  p.set('ver', PAGE_VERSION);
  return `https://tv.bulkbazaar.ca/channel/block.html?${p}`;
}

/** The owner's public settings for [station] (channel/<id>), or its ready-made schedule until there are any. */
async function load(station) {
  let saved = null;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents/channel/${station.id}?key=${FIREBASE.apiKey}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (r.ok) {
      const data = (await r.json()).fields?.data?.stringValue;
      if (data) saved = JSON.parse(data);
    }
  } catch {}
  if (!saved) {
    const ready = await (await fetch(station.ready, { cache: 'no-store' })).json();
    // Another channel's free films as the backup: it keeps this channel's own name and logo.
    saved = station.backup ? { ...ready, name: station.name, logo: station.logo, ...(NO_BUG.has(station.id) ? { logoCorner: 'off' } : {}) } : ready;
  }
  // Our channels keep their fixed names (owner, 2026-10-07), whatever a saved schedule says.
  return { ...(await expand(saved)), name: station.name, id: station.id };
}

const usable = (c) => c && c.active !== false && Array.isArray(c.videos) && c.videos.length > 0;

/** Reads every channel's settings; the last ones are kept when offline. */
export async function refresh() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('ctv.mychannels') || '{}'); } catch { return {}; } })();
  if (!Object.keys(configs).length) configs = Object.fromEntries(Object.entries(saved).filter(([, c]) => usable(c)));
  const next = { ...configs };
  await Promise.all(STATIONS.map(async (st) => {
    try {
      const c = await load(st);
      if (usable(c)) next[st.id] = c; else delete next[st.id];
    } catch {}
  }));
  const changed = JSON.stringify(next) !== JSON.stringify(configs);
  configs = next;
  try { localStorage.setItem('ctv.mychannels', JSON.stringify(configs)); } catch {}
  if (changed) listeners.forEach((fn) => fn());
}

/** Reads the saved settings at once, so our channels show before the network answers. */
export function init() {
  try {
    const saved = JSON.parse(localStorage.getItem('ctv.mychannels') || '{}');
    configs = Object.fromEntries(Object.entries(saved).filter(([, c]) => usable(c)));
  } catch {}
}
