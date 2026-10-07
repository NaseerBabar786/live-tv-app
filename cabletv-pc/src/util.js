// Small helpers for the main process, kept apart so the tests can run them without Electron.

/** Compares dotted versions number by number ("1.10.0" is newer than "1.9.9"): >0, 0 or <0. */
function compareVersions(a, b) {
  const x = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const y = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** A crash report in Firestore's format, the same fields the Android apps send (CrashGuard.kt). */
function crashFields({ app, version, error, stack, onStart, device, os, time = new Date() }) {
  const str = (v) => ({ stringValue: String(v || '') });
  return {
    fields: {
      app: str(app),
      version: str(version),
      code: { integerValue: '0' },
      device: str(String(device).slice(0, 100)),
      // The crash list shows this as the system ("Windows_NT 10.0.22631").
      android: str(os),
      time: { timestampValue: time.toISOString().replace(/\.\d{3}Z$/, 'Z') },
      error: str(String(error).slice(0, 500)),
      stack: str(String(stack).slice(0, 8000)),
      onStart: { booleanValue: !!onStart },
    },
  };
}

/** Cable TV's own User-Agent for streams, as the TV app and the daily stream check use. */
const APP_UA = 'LiveTV-Android/1.0';

/** Hosts that are never streams: our website, Firebase and Google, YouTube and GitHub. */
const NOT_STREAMS = /(^|\.)(bulkbazaar\.ca|googleapis\.com|google\.com|gstatic\.com|youtube\.com|ytimg\.com|googlevideo\.com|github\.com|githubusercontent\.com|cloudflare\.com|jsdelivr\.net|open-meteo\.com|geojs\.io)$/i;

/**
 * The request headers for a request from the window: stream requests (video, playlists and their
 * pieces) get the channel's User-Agent and Referer, or Cable TV's own User-Agent.
 */
function streamHeaders(url, resourceType, headers, channelHeaders) {
  let host;
  try { host = new URL(url).hostname; } catch { return headers; }
  if (!/^https?:/.test(url) || NOT_STREAMS.test(host)) return headers;
  if (!['xhr', 'media', 'other', 'fetch'].includes(resourceType)) return headers;
  const out = { ...headers };
  const h = (channelHeaders && channelHeaders[host]) || {};
  out['User-Agent'] = h.ua || APP_UA;
  if (h.referrer) out.Referer = h.referrer;
  return out;
}

/** "fallback" or "done" for our pages' livetv:// signals; null for any other address. */
function LIVETV_SIGNAL(url) {
  const m = /^livetv:\/\/([a-z]+)/i.exec(url || '');
  return m ? m[1].toLowerCase() : null;
}

module.exports = { compareVersions, crashFields, streamHeaders, LIVETV_SIGNAL, APP_UA };
