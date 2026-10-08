// Saved settings, like the TV app's SharedPreferences: one JSON value per key in localStorage
// (kept in the user's AppData folder by Electron).

const PREFIX = 'ctv.';

export function get(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  try {
    if (value === undefined || value === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Full or unavailable: the app carries on with what it has in memory.
  }
}

export function remove(key) {
  set(key, null);
}

/** Text downloaded before, kept so the app starts without internet (ChannelRepository.downloadCached). */
export async function fetchCached(key, url, { json = false } = {}) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    try { localStorage.setItem(`${PREFIX}cache.${key}`, text); } catch {}
    return json ? JSON.parse(text) : text;
  } catch (e) {
    const saved = localStorage.getItem(`${PREFIX}cache.${key}`);
    if (saved == null) throw e;
    return json ? JSON.parse(saved) : saved;
  }
}
