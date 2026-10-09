// Locks each of our YouTube channels' day (owner, 2026-10-07: "lock the schedule for 24 hours").
// Writes docs/channel/locked/<id>.json = { built, days: { "<today>": [items], "<tomorrow>": [items] } }:
// a day once locked is never made again, except that a day the owner locked or fixed in Channel Studio
// (Firestore channel/sched-<id>) always wins. Today's is written now only if it's missing; tomorrow's is made
// in the evening run from the owner's approved programmes (Firestore channel/picks), our promos and the trailers.
// The channel pages (channel/ytc.html) and Channel Studio play/show the locked day.
//   node tools/lock_schedules.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { STATIONS } from "../docs/channel/schedule.js";
import { dayPlan, sparkFor, torontoDay, loadPicks, carryOver, slimItem as slim, loadOwnerDays } from "../docs/channel/ytorder.js";

const DIR = new URL("../docs/channel/", import.meta.url);
mkdirSync(new URL("locked/", DIR), { recursive: true });
const read = name => JSON.parse(readFileSync(new URL(name, DIR), "utf8"));
const promos = (read("../media/promos.json").promos || []).filter(p => p.src && p.secs >= 10 && p.secs <= 60);
// Spark TV's own ads (each channel's, in turn with the promos) and its moving logo once an hour (owner, 2026-10-09).
const spark = existsSync(new URL("../media/spark-promos.json", DIR)) ? read("../media/spark-promos.json") : null;
const allTrailers = existsSync(new URL("trailers.json", DIR)) ? read("trailers.json").videos || [] : [];
const picks = await loadPicks();
// Videos that no longer play in an embedded player (tools/check_channels.mjs) stay out of new days.
const unplayable = existsSync(new URL("unplayable.json", DIR)) ? read("unplayable.json").ids || {} : {};
if (!Object.keys(picks).length) console.log("::warning::No picks from Firestore (no public-read rule for channel/{id}?): every programme counts as approved.");

const today = torontoDay().date;
// Tomorrow is locked in the evening run (from 8 PM Toronto time), from the approvals saved by then; once
// locked, a day is never made again. Any other run only makes sure today has one.
const hour = +new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", hourCycle: "h23" }).format(new Date());
const tomorrow = hour >= 20 || process.argv.includes("--tomorrow") ? torontoDay(Date.now() + 24 * 3600e3).date : null;

for (const st of STATIONS.filter(s => s.yt)) {
  const file = new URL(`locked/${st.id}.json`, DIR);
  if (!existsSync(new URL(`yt-${st.id}.json`, DIR))) continue;
  const list = (read(`yt-${st.id}.json`).videos || []).filter(v => !unplayable[v.id]);
  const trailers = st.trailerLangs ? allTrailers.filter(v => v.id && v.secs > 0 && v.secs <= 600 && st.trailerLangs.includes(v.lang)) : [];
  // A channel's own short clips (Spark Shayari's hourly "Aaj ka Sher", tools/shayari).
  const own = st.ownClips && existsSync(new URL(st.ownClips, DIR))
    ? (read(st.ownClips).clips || []).filter(c => c.src && c.secs > 0 && c.secs <= 120).map(c => ({ ...c, own: true })) : [];
  const old = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { days: {} };
  const days = {};
  const sp = sparkFor(st, spark);
  const breaks = st.noAds ? [] : promos.concat(sp.promos);
  const make = date => dayPlan(st, { list, picks: picks[st.id] || null, promos: breaks, trailers, own, ident: sp.ident }, date).map(slim);
  const mine = await loadOwnerDays(st.id);
  days[today] = mine[today]?.items || old.days?.[today] || make(today);
  const nextDay = torontoDay(Date.now() + 24 * 3600e3).date;
  if (mine[nextDay]?.items) days[nextDay] = mine[nextDay].items;
  else if (tomorrow && old.days?.[tomorrow]) days[tomorrow] = old.days[tomorrow];
  else if (tomorrow) {
    days[tomorrow] = make(tomorrow);
    // A film still running at midnight finishes first, like TV: tomorrow starts with the rest of it.
    const cont = carryOver(days[today], torontoDay().start);
    // (Not on a half-hour channel: its day always starts on the dot with its own set.)
    if (cont && !st.halfHours) days[tomorrow].unshift(cont);
  }
  writeFileSync(file, JSON.stringify({ name: st.name, built: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC", days }) + "\n");
  console.log(`${st.name}: ${Object.entries(days).map(([d, it]) => `${d} ${it.length} items`).join(", ")}`);
}
