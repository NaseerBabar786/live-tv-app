// Small pure helpers, the same rules as the TV app's (file names in each comment); test/ui.test.mjs checks them.

/** Parses an extended M3U playlist into channels (M3uParser.kt). */
export function parseM3u(text) {
  const out = [];
  let name = null, attrs = {}, extGroup = null, ua = null, ref = null;
  const reset = () => { name = null; attrs = {}; extGroup = null; ua = null; ref = null; };
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.trim().replace(/^﻿/, '');
    if (!line) continue;
    if (/^#EXTINF/i.test(line)) {
      reset();
      const body = line.slice(line.indexOf(':') + 1);
      const header = headerPart(body);
      for (const m of header.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1].toLowerCase()] = m[2];
      name = body.slice(header.length).replace(/^,/, '').trim();
    } else if (/^#EXTGRP:/i.test(line)) {
      extGroup = line.slice(line.indexOf(':') + 1).trim();
    } else if (/^#EXTVLCOPT:/i.test(line)) {
      const opt = line.slice(line.indexOf(':') + 1);
      const key = opt.split('=')[0].trim().toLowerCase();
      const value = opt.includes('=') ? opt.slice(opt.indexOf('=') + 1).trim() : '';
      if (key === 'http-user-agent') ua = value;
      if (key === 'http-referrer' || key === 'http-referer') ref = value;
    } else if (line.startsWith('#')) {
      // #EXTM3U and other directives
    } else {
      const url = line;
      const first = (v) => (v && v.trim() ? v : null);
      out.push({
        name: first(name) || first(attrs['tvg-name']) || url.split('/').pop().split('?')[0],
        url,
        logo: first(attrs['tvg-logo']),
        group: first(attrs['group-title'] ?? extGroup),
        tvgId: first(attrs['tvg-id']),
        language: first((attrs['tvg-language'] || '').split(';')[0]),
        category: first((attrs['tvg-genre'] || '').split(';')[0]),
        country: first((attrs['tvg-country'] || '').split(';')[0].toLowerCase()),
        userAgent: ua || attrs['http-user-agent'] || null,
        referrer: ref || attrs['http-referrer'] || null,
        alternates: [],
        number: 0,
      });
      reset();
    }
  }
  return out;
}

function headerPart(body) {
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '"') inQuotes = !inQuotes;
    else if (body[i] === ',' && !inQuotes) return body.slice(0, i);
  }
  return body;
}

/** iptv-org's spellings to the app's (IptvOrg.kt). */
export function languageName(name) {
  if (!name || name === 'Undefined') return 'Other';
  return name === 'Panjabi' ? 'Punjabi' : name;
}
export function categoryName(name) {
  const first = (name || '').split(';')[0].trim();
  return !first || first === 'Undefined' ? 'General' : first;
}

/** The daily-checked lists' entries with the app's language and type names (CheckedList.kt). */
export function convertChecked(list) {
  return list.map((c) => ({ ...c, language: languageName(c.language), category: categoryName(c.category) }));
}

/** "92 News HD" and "92 News" are the same channel (ChannelRepository.nameKey). */
export function nameKey(name) {
  let k = String(name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (k.endsWith('hd')) k = k.slice(0, -2);
  return k;
}

/** Java's String.hashCode as Integer.toHexString, so stats keys match the TV app's (Watching.kt). */
export function javaHashHex(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/** The channel's country as a short code, "PK" ("UK" for the United Kingdom), or null. */
export function countryCode(channel) {
  const c = channel && channel.country;
  if (!c || c.length !== 2 || !/^[a-z]+$/i.test(c)) return null;
  const up = c.toUpperCase();
  return up === 'GB' ? 'UK' : up;
}

/** [text] as a web address when it looks like one; null for a phone number or blank (Sponsors.kt siteUrl). */
export function siteUrl(text) {
  const t = String(text || '').trim();
  if (!t || /\s/.test(t)) return null;
  const host = t.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
  if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(host)) return null;
  return /^https?:\/\//.test(t) ? t : `https://${t}`;
}

/** Compares dotted versions: >0 when [a] is newer. */
export function compareVersions(a, b) {
  const x = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const y = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** "yyyy-MM-dd" in the PC's own time zone. */
export function today(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The YouTube video id of [url], or null (YouTube.kt / schedule.js youtubeId). */
export function youtubeId(url) {
  const m = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url || '');
  return m ? m[1] : null;
}

/** Which ways to try a stream: 'hls', 'ts' (MPEG-TS) or 'file' (StreamPlayer.mimeCandidates). */
export function streamKinds(url) {
  const path = String(url).split('?')[0].split('#')[0].toLowerCase();
  if (path.endsWith('.m3u8') || path.endsWith('.m3u')) return ['hls'];
  if (path.endsWith('.mpd')) return ['file'];
  if (path.endsWith('.ts')) return ['ts'];
  if (/\.(mp4|mkv|aac|mp3|webm)$/.test(path)) return ['file'];
  return ['hls', 'ts', 'file'];
}

/** Initials for a channel without a logo ("Geo News" -> "GN"). */
export function initials(name) {
  return String(name || '').split(/[\s\-_]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
