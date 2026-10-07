// Locks each of our YouTube channels' day (owner, 2026-10-07: "lock the schedule for 24 hours").
// Writes docs/channel/locked/<id>.json = { built, days: { "<today>": [items], "<tomorrow>": [items] } }:
// a day once locked is never made again. Today's is written now only if it's missing; tomorrow's is made
// in the evening run from the owner's approved programmes (Firestore channel/picks), our promos and the trailers.
// The channel pages (channel/ytc.html) and Channel Studio play/show the locked day.
//   node tools/lock_schedules.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { STATIONS } from "../docs/channel/schedule.js";
import { dayPlan, torontoDay, loadPicks, itemAt } from "../docs/channel/ytorder.js";

const DIR = new URL("../docs/channel/", import.meta.url);
mkdirSync(new URL("locked/", DIR), { recursive: true });
const read = name => JSON.parse(readFileSync(new URL(name, DIR), "utf8"));
const promos = (read("../media/promos.json").promos || []).filter(p => p.src && p.secs >= 10 && p.secs <= 60);
const allTrailers = existsSync(new URL("trailers.json", DIR)) ? read("trailers.json").videos || [] : [];
const picks = await loadPicks();
if (!Object.keys(picks).length) console.log("::warning::No picks from Firestore (no public-read rule for channel/{id}?): every programme counts as approved.");

const today = torontoDay().date;
// Tomorrow is locked in the evening run (from 8 PM Toronto time), from the approvals saved by then; once
// locked, a day is never made again. Any other run only makes sure today has one.
const hour = +new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", hourCycle: "h23" }).format(new Date());
const tomorrow = hour >= 20 || process.argv.includes("--tomorrow") ? torontoDay(Date.now() + 24 * 3600e3).date : null;
// Only what a player needs, so the files stay small.
const slim = x => x.kind === "break" ? x : { ...x, v: { id: x.v.id, title: x.v.title, label: x.v.label, mins: x.v.mins } };

for (const st of STATIONS.filter(s => s.yt)) {
  const file = new URL(`locked/${st.id}.json`, DIR);
  if (!existsSync(new URL(`yt-${st.id}.json`, DIR))) continue;
  const list = read(`yt-${st.id}.json`).videos || [];
  const trailers = st.trailerLangs ? allTrailers.filter(v => v.id && v.secs > 0 && v.secs <= 600 && st.trailerLangs.includes(v.lang)) : [];
  const old = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { days: {} };
  const days = {};
  const make = date => dayPlan(st, { list, picks: picks[st.id] || null, promos, trailers }, date).map(slim);
  days[today] = old.days?.[today] || make(today);
  if (tomorrow && old.days?.[tomorrow]) days[tomorrow] = old.days[tomorrow];
  else if (tomorrow) {
    days[tomorrow] = make(tomorrow);
    // A film still running at midnight finishes first, like TV: tomorrow starts with the rest of it.
    const last = torontoDay(Date.now()).start + 24 * 3600e3;
    const nextStart = [last - 3600e3, last, last + 3600e3].find(ms => torontoDay(ms).date === tomorrow && torontoDay(ms - 1000).date === today);
    if (nextStart) {
      const w = itemAt(days[today], nextStart - 1000);
      const it = days[today][w.i], rest = Math.round(it.secs - w.offset - 1);
      if (it.kind === "video" && !it.trailer && rest > 120)
        days[tomorrow].unshift({ ...it, secs: rest, start: Math.round((it.start || 0) + w.offset + 1), cont: true });
    }
  }
  writeFileSync(file, JSON.stringify({ name: st.name, built: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC", days }) + "\n");
  console.log(`${st.name}: ${Object.entries(days).map(([d, it]) => `${d} ${it.length} items`).join(", ")}`);
}
