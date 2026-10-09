// The Spark TV network's channels for the Spark website (tv.bulkbazaar.ca/spark), straight from the same
// list the app and the watch pages use (channel/schedule.js STATIONS, kept in step with MyChannel.STATIONS),
// so a new channel shows up here on its own. Only our own channels: MTA and the 7,800+ others are Cable TV's.

import { STATIONS } from "../channel/schedule.js";
import { torontoDay } from "../channel/ytorder.js";

export const LANGS = [
  { key: "ur", name: "Urdu", native: "اردو", from: 1, to: 19 },
  { key: "hi", name: "Hindi", native: "हिन्दी", from: 21, to: 39 },
  { key: "en", name: "English", native: "English", from: 41, to: 59 },
  { key: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", from: 61, to: 79 },
];

// Spark Hits (23) plays on its own page (channel/bollywood.html), so it isn't in STATIONS.
const HITS = { id: "hits", name: "Spark Hits", dial: "23", tagline: "Bollywood hit songs, day and night",
  logo: "../channel/logos/spark-hits.png", watch: "../channel/bollywood.html" };

const TAGLINES = {
  main: "Our flagship Urdu channel: news every hour, films, dramas and music",
  ads: "Our sponsors' ads and Spark promos, round the clock",
};

/** Every Spark channel, by dial number: { id, name, dial, tagline, logo, lang, watch, live }. */
export function sparkChannels() {
  const list = STATIONS.map(s => ({
    id: s.id,
    // A channel or two still carries its old Bazaar name in the list until its next build.
    name: s.name.replace(/^Bazaar /, "Spark "),
    dial: s.dial,
    tagline: s.tagline || TAGLINES[s.id] || "",
    logo: (s.logo || "").replace("https://tv.bulkbazaar.ca/channel/", "../channel/").replace("/logos/bazaar-", "/logos/spark-"),
    watch: s.yt ? `../channel/ytc.html?c=${s.id}` : s.id === "main" ? "../channel/" : `../channel/?c=${s.id}`,
    live: s.yt ? `../channel/ytc.html?c=${s.id}&mute=1` : null,
    yt: !!s.yt,
  })).concat([HITS]);
  for (const c of list) c.lang = (LANGS.find(l => +c.dial >= l.from && +c.dial <= l.to) || LANGS[2]).key;
  return list.sort((a, b) => a.dial - b.dial);
}

/** The programme on now from the channel's locked day (channel/locked/<id>.json): { title, thumb } or null. */
export async function onNow(c) {
  if (!c.yt) return null;
  try {
    const r = await fetch(`../channel/locked/${c.id}.json`, { cache: "no-cache" });
    if (!r.ok) return null;
    const { days } = await r.json();
    const { date, start } = torontoDay();
    const items = days?.[date];
    if (!items?.length) return null;
    const total = items.reduce((t, x) => t + (x.secs || 0), 0);
    let pos = ((Date.now() - start) / 1000) % total, i = 0;
    while (i < items.length - 1 && pos >= items[i].secs) { pos -= items[i].secs; i++; }
    // During an ad break, show what comes next.
    const v = items.slice(i).concat(items).find(x => x.kind === "video" && x.v?.id)?.v;
    return v ? { title: cleanTitle(v.title), thumb: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg` } : null;
  } catch { return null; }
}

/** A programme name without the uploader's tags ("| HAR PAL GEO", "[Eng Sub]", hashtags). */
export function cleanTitle(t = "") {
  return t.split(/\s[|｜]\s|\s-\s(?=[A-Z ]+$)/)[0].replace(/\[[^\]]*\]|\([^)]*(sub|official|full)[^)]*\)|#\S+/gi, "").replace(/\s+/g, " ").trim() || t;
}
