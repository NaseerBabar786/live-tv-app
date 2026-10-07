// The channel list and the viewer's choices: ChannelRepository.kt, CheckedList.kt and MainViewModel.kt
// (UiState) in the TV app. Cable TV always uses the daily-checked working lists on tv.bulkbazaar.ca.
import { parseM3u, convertChecked, nameKey, youtubeId, compareVersions } from './util.js';
import * as store from './store.js';
import * as mine from './mychannel.js';
import * as plans from './plans.js';

export const FILTER_ALL = 'All';
export const FILTER_FAVORITES = 'Favorites';
export const MAX_FAVORITES = 200;

const MIX_URL = 'https://tv.bulkbazaar.ca/LiveTV.m3u';
const ALL_URL = 'https://tv.bulkbazaar.ca/AllChannels.m3u';
const PAKISTAN_LIVE_URL = 'https://tv.bulkbazaar.ca/PakistanLive.m3u';
const COUNTRIES_URL = 'https://raw.githubusercontent.com/famelack/famelack-channels/main/tv/raw/countries_metadata.json';

export const SOURCE_MIX = 'famelack:mix';
export const SOURCE_ALL = 'famelack:all';
const SOURCE_PICK = 'famelack:pick:';

/** Pakistani, Indian (Hindi, Urdu and Punjabi), Canadian, UK and USA channels: the default (Famelack.MIX). */
export const MIX = [
  { country: 'pk', title: 'Pakistani' },
  { country: 'in', title: 'Indian', languages: ['Hindi', 'Urdu', 'Punjabi'] },
  { country: 'ca', title: 'Canadian' },
  { country: 'uk', title: 'British' },
  { country: 'us', title: 'American' },
];
/** Types that are not really genres, so they get no chip. */
const NOT_GENRES = new Set(['Geo-blocked']);

export const pickSource = (codes) => SOURCE_PICK + codes.map((c) => c.toLowerCase()).join(',');
export const pickedCountries = (source) =>
  source.startsWith(SOURCE_PICK) ? source.slice(SOURCE_PICK.length).split(',').map((s) => s.trim()).filter(Boolean) : null;
const countryOf = (source) =>
  source.startsWith('famelack:') && source !== SOURCE_MIX && source !== SOURCE_ALL && !source.slice(9).includes(':') ? source.slice(9) : null;

/** The app's state; screens read it and call the functions below to change it. */
export const state = {
  loading: true,
  error: null,
  channels: [],
  favorites: new Set(store.get('favorites', [])),
  query: '',
  filter: FILTER_ALL,
  category: null,
  languageFilter: new Set(store.get('languages', [])),
  source: store.get('source', SOURCE_MIX) || SOURCE_MIX,
  lastWatchedId: store.get('lastChannel', null),
  countries: [],
};

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = () => listeners.forEach((fn) => fn());

/** Every section of the checked list for [sections] (CheckedList.sections). */
function sections(all, list) {
  return list.flatMap((s) => {
    const keep = s.languages ? new Set(s.languages) : null;
    return all.filter((c) => c.country === s.country && (!keep || keep.has(c.language)))
      .map((c) => (s.title ? { ...c, group: s.title } : c));
  });
}

async function checkedAll() {
  return convertChecked(parseM3u(await store.fetchCached('checked:all', ALL_URL)));
}

/**
 * Adds the Pakistani channels that stream live on their own YouTube channel after the last Pakistani
 * channel, each replacing a channel of the same name whose own stream doesn't work (withPakistaniLive).
 */
async function withPakistaniLive(list) {
  let last = -1;
  list.forEach((c, i) => { if (c.country === 'pk') last = i; });
  if (last < 0) return list;
  let live = [];
  try { live = parseM3u(await store.fetchCached('pakistan-live', PAKISTAN_LIVE_URL)).filter((c) => youtubeId(c.url)); } catch {}
  if (!live.length) return list;
  const group = list[last].group;
  const old = { aajnews: 'aajtv' };
  const names = new Set(live.flatMap((c) => [nameKey(c.name), old[nameKey(c.name)]].filter(Boolean)));
  const kept = list.filter((c, i) => i > last || c.country !== 'pk' || !names.has(nameKey(c.name)));
  let at = -1;
  kept.forEach((c, i) => { if (c.country === 'pk') at = i; });
  at += 1;
  return [...kept.slice(0, at), ...live.map((c) => ({ ...c, group: group || c.group })), ...kept.slice(at)];
}

async function loadList() {
  const source = state.source;
  const picked = pickedCountries(source);
  const country = countryOf(source);
  let list;
  if (source === SOURCE_MIX) list = convertChecked(parseM3u(await store.fetchCached('checked:mix', MIX_URL)));
  else if (source === SOURCE_ALL) list = await checkedAll();
  else if (picked) list = sections(await checkedAll(), picked.map((code) => MIX.find((s) => s.country === code) || { country: code, title: '' }));
  else if (country) list = (await checkedAll()).filter((c) => c.country === country);
  else list = convertChecked(parseM3u(await store.fetchCached('checked:mix', MIX_URL)));
  if (!list.length) throw new Error('No playable channels found for this source.');
  list = await withPakistaniLive(list);
  // A stream listed twice would be one channel twice.
  const seen = new Set();
  return list.filter((c) => (seen.has(c.url) ? false : seen.add(c.url)));
}

/** [list] with our own channels first (those that are on). */
function withMine(list) {
  const rest = list.filter((c) => !mine.isMine(c));
  return rest.length ? [...mine.channels(), ...rest] : rest;
}

let opened = false;

/** Loads the channels; the app opens on Favorites (when there are any) and on the channel watched last. */
export async function reload() {
  state.loading = true;
  state.error = null;
  changed();
  try {
    const list = await loadList();
    const numbered = withMine(list.map((c, i) => ({ ...c, number: mine.COUNT + i + 1 })));
    const opening = !opened;
    opened = true;
    const favs = numbered.filter((c) => state.favorites.has(c.url));
    const onFavorites = opening && favs.length > 0;
    const lastUrl = store.get('lastChannel', null);
    const last = numbered.find((c) => c.url === lastUrl && (!freeOnly() || plans.freeChannel(c)));
    let start = state.lastWatchedId;
    if (onFavorites) start = (last && state.favorites.has(last.url) ? last : favs[0]).url;
    else if (opening) start = last ? last.url : null;
    state.channels = numbered;
    state.lastWatchedId = start;
    if (onFavorites) { state.filter = FILTER_FAVORITES; state.category = null; }
  } catch (e) {
    state.error = /Failed to fetch|network/i.test(String(e.message)) ? "Can't load the channels. Check the internet connection." : e.message || 'Could not load the channel list.';
  }
  state.loading = false;
  changed();
}

/** Our channels' settings changed: the list's own channels are swapped for the new ones. */
mine.onChange(() => {
  state.channels = withMine(state.channels);
  changed();
});

/** Countries that have free channels, for the country picker. */
export async function loadCountries() {
  if (state.countries.length) return state.countries;
  try {
    const obj = await store.fetchCached('countries', COUNTRIES_URL, { json: true });
    state.countries = Object.entries(obj)
      .map(([code, c]) => ({ code: code.toLowerCase(), name: c.country || code, count: c.channelCount || 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {}
  return state.countries;
}

const freeOnly = () => !plans.has('channels');

function inGroup() {
  return state.channels.filter((c) => {
    if (freeOnly() && !plans.freeChannel(c)) return false;
    if (state.filter === FILTER_ALL) return true;
    if (state.filter === FILTER_FAVORITES) return state.favorites.has(c.url) || mine.isMine(c);
    return c.group === state.filter;
  });
}

function inLanguage() {
  const langs = state.languageFilter;
  return inGroup().filter((c) => !langs.size || langs.has(c.language) || mine.isMine(c));
}

function byCount(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k]) => k);
}

/** Every language in the loaded channels, most channels first, "Other" last. */
export function allLanguages() {
  return byCount(state.channels.map((c) => c.language).filter(Boolean)).sort((a, b) => (a === 'Other') - (b === 'Other'));
}

/** The genre chips for the chosen countries and languages, most channels first, "General" last. */
export function categories() {
  return byCount(inLanguage().map((c) => c.category).filter((c) => c && !NOT_GENRES.has(c))).sort((a, b) => (a === 'General') - (b === 'General'));
}

function countryRank(c) {
  const code = c.country || MIX.find((s) => s.title === c.group)?.country;
  const i = MIX.findIndex((s) => s.country === code || (code === 'gb' && s.country === 'uk'));
  return i >= 0 ? i : MIX.length;
}

/**
 * The channels shown: our own first, then favorites, then the rest in list order. Inside Favorites
 * the channels are grouped by country (Pakistan, India, Canada, UK, USA, then the rest) and numbered
 * from 15, after our own channels.
 */
export function visibleChannels() {
  const q = state.query.trim().toLowerCase();
  const shown = inLanguage()
    .filter((c) => state.category == null || c.category === state.category)
    .filter((c) => !q || c.name.toLowerCase().includes(q));
  if (state.filter !== FILTER_FAVORITES) {
    // A stable sort, like Kotlin's sortedWith.
    return shown.map((c, i) => [c, i]).sort((a, b) => (!mine.isMine(a[0]) - !mine.isMine(b[0])) ||
      (!state.favorites.has(a[0].url) - !state.favorites.has(b[0].url)) || a[1] - b[1]).map(([c]) => c);
  }
  const own = shown.filter((c) => mine.isMine(c));
  const rest = shown.filter((c) => !mine.isMine(c))
    .map((c, i) => [c, i])
    .sort((a, b) => countryRank(a[0]) - countryRank(b[0]) ||
      String(a[0].group || a[0].country || '').localeCompare(String(b[0].group || b[0].country || '')) ||
      a[0].number - b[0].number || a[1] - b[1])
    .map(([c], i) => ({ ...c, number: mine.COUNT + i + 1 }));
  return [...own, ...rest];
}

/** The screen title: the country's name when showing one country's channels. */
export function title() {
  const code = countryOf(state.source);
  if (state.source === SOURCE_ALL) return 'All countries';
  if (code) return state.countries.find((c) => c.code === code)?.name || 'Cable TV';
  return 'Cable TV';
}

export function setFilter(f) { state.filter = f; state.category = null; changed(); }
export function setCategory(c) { state.category = c; changed(); }
export function setQuery(q) { state.query = q; changed(); }
export function setLanguages(set) {
  state.languageFilter = new Set(set);
  store.set('languages', [...set]);
  state.category = null;
  changed();
}
export function setSource(source) {
  state.source = source || SOURCE_MIX;
  store.set('source', state.source);
  state.filter = FILTER_ALL;
  state.category = null;
  reload();
}

/** Adds or removes a favorite; Favorites holds at most 200 channels. Returns a message when it's full. */
export function toggleFavorite(ch) {
  const favs = new Set(state.favorites);
  if (!favs.has(ch.url) && favs.size >= MAX_FAVORITES) return `Favorites is full (${MAX_FAVORITES} channels). Remove one to add another.`;
  if (favs.has(ch.url)) favs.delete(ch.url); else favs.add(ch.url);
  state.favorites = favs;
  store.set('favorites', [...favs]);
  changed();
  return null;
}

/** Remembers [ch] as the channel watched last. */
export function watched(ch) {
  state.lastWatchedId = ch.url;
  store.set('lastChannel', ch.url);
  changed();
}

/** The channel with [number] in the list being watched (MainViewModel.goToTyped), or our channel by its old dial. */
export function byNumber(typed) {
  const own = mine.byDial(typed);
  if (own) return own;
  const n = parseInt(typed, 10);
  if (Number.isNaN(n)) return null;
  const vis = visibleChannels();
  return vis.find((c) => c.number === n) || (state.filter !== FILTER_FAVORITES ? state.channels.find((c) => c.number === n) : null) || null;
}

/** The next (+1) or previous (-1) channel after [ch] in the list being watched, wrapping around. */
export function next(ch, step) {
  const vis = visibleChannels();
  const list = vis.length ? vis : state.channels;
  if (!list.length) return null;
  const i = list.findIndex((c) => c.url === ch?.url);
  return list[(((i + step) % list.length) + list.length) % list.length];
}

export const find = (url) => state.channels.find((c) => c.url === url) || null;
export { compareVersions };
