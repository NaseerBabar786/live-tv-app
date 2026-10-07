// Checks our YouTube channels for anything that could leave a frozen screen or dead air (owner, 2026-10-07:
// "keep checking ... if that kind of problem is coming over there too"):
//  - every video in the programme lists and the locked days still plays in an embedded player (YouTube's
//    oEmbed: 401 = its owner turned embedding off, 404 = removed or private). Those go into
//    docs/channel/unplayable.json, and new schedules leave them out (tools/lock_schedules.mjs, ytc.html);
//  - every locked day is sound: lengths above zero, ad breaks no longer than 60 seconds, a film carried
//    over from the night before starting inside the film, and enough programmes to fill the day.
// Writes docs/channel/channel-check.json (what was found) and prints a warning for each problem.
//   node tools/check_channels.mjs [--offline]   (--offline: skip the YouTube look-ups)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { STATIONS } from "../docs/channel/schedule.js";
import { lengthOf } from "../docs/channel/ytorder.js";

const DIR = new URL("../docs/channel/", import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, DIR), "utf8"));
const offline = process.argv.includes("--offline");
const problems = [];
const warn = (channel, text) => { problems.push({ channel, text }); console.log(`::warning::${channel}: ${text}`); };

// ---- The locked days ----
const ids = new Map();   // video id -> channel names
const note = (id, name) => { if (!ids.has(id)) ids.set(id, new Set()); ids.get(id).add(name); };
for (const st of STATIONS.filter(s => s.yt)) {
  const listFile = `yt-${st.id}.json`;
  if (!existsSync(new URL(listFile, DIR))) continue;
  const list = read(listFile).videos || [];
  list.forEach(v => note(v.id, st.name));
  const noLength = list.filter(v => !v.mins).length;
  if (noLength) warn(st.name, `${noLength} programme(s) have no length; each gets ${st.ytMins || 5} minutes in the schedule (a shorter one is filled with promos or the next programme starts early).`);
  const file = new URL(`locked/${st.id}.json`, DIR);
  if (!existsSync(file)) { warn(st.name, "no locked schedule yet."); continue; }
  const days = JSON.parse(readFileSync(file, "utf8")).days || {};
  for (const [date, items] of Object.entries(days)) {
    let total = 0;
    items.forEach((x, n) => {
      total += x.secs;
      if (!(x.secs > 0)) warn(st.name, `${date} item ${n + 1} has no length.`);
      if (x.kind === "break") {
        if (x.secs > 60) warn(st.name, `${date} item ${n + 1}: an ad break of ${x.secs} s (over 60).`);
        return;
      }
      note(x.v.id, st.name);
      const full = lengthOf(x.v, st);
      if (x.cont && (x.start || 0) + x.secs > full + 5) warn(st.name, `${date}: the film carried over from the night before runs past its end (${x.v.title}).`);
      if (!x.clip && !x.trailer && !x.cont && Math.abs(x.secs - full) > 5) warn(st.name, `${date} item ${n + 1}: listed ${x.secs} s but the video is ${full} s (${x.v.title}).`);
    });
    if (total < 23 * 3600) warn(st.name, `${date}: only ${(total / 3600).toFixed(1)} hours of programmes; the day starts again from the top (not dead air, but repeats).`);
  }
}

// ---- Do the videos still play in an embedded player? ----
const unplayable = {};
const before = existsSync(new URL("unplayable.json", DIR)) ? read("unplayable.json").ids || {} : {};
if (!offline) {
  const all = [...ids.keys()];
  let n = 0, failedLookups = 0;
  async function check(id) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=" + id)}`, { signal: AbortSignal.timeout(15000) });
        if (r.status === 401 || r.status === 403) return "embedding turned off by its owner";
        if (r.status === 404 || r.status === 400) return "removed or private";
        if (r.ok) return null;
      } catch {}
    }
    failedLookups++;
    return before[id]?.why || null;   // couldn't tell: keep what we knew
  }
  const workers = Array.from({ length: 8 }, async () => {
    while (n < all.length) {
      const id = all[n++];
      const why = await check(id);
      if (why) unplayable[id] = { why, channels: [...ids.get(id)], since: before[id]?.since || new Date().toISOString().slice(0, 10) };
    }
  });
  await Promise.all(workers);
  if (failedLookups > all.length / 4) {
    console.log(`::warning::${failedLookups} of ${all.length} look-ups failed; unplayable.json left as it was.`);
    Object.assign(unplayable, before);
  }
  for (const [id, u] of Object.entries(unplayable)) warn(u.channels.join(", "), `video ${id} can't play here (${u.why}); new schedules leave it out, and today's fills its time.`);
  writeFileSync(new URL("unplayable.json", DIR), JSON.stringify({ checked: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC", ids: unplayable }, null, 1) + "\n");
}

writeFileSync(new URL("channel-check.json", DIR), JSON.stringify({ checked: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC", problems }, null, 1) + "\n");
console.log(problems.length ? `${problems.length} problem(s) found.` : "All channels look fine.");
