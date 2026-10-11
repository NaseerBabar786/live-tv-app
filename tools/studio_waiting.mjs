// What waits for the owner in Channel Studio > 📺 Programmes: each on-air channel's "🆕 New" programmes
// (found by the daily search, not approved yet). The daily unfinished-items audit runs this and tells the
// owner only when something waits (owner, 2026-10-11).
//   node tools/studio_waiting.mjs          one line per channel with new programmes, or "Nothing waiting"
import { readFileSync, existsSync } from "node:fs";
import { STATIONS } from "../docs/channel/schedule.js";
import { loadPicks, status } from "../docs/channel/ytorder.js";

const DIR = new URL("../docs/channel/", import.meta.url);
const picks = await loadPicks();
let waiting = 0;
for (const st of STATIONS.filter(s => s.yt)) {
  const file = new URL(`yt-${st.id}.json`, DIR);
  if (!existsSync(file)) continue;
  const fresh = (JSON.parse(readFileSync(file, "utf8")).videos || []).filter(v => status(v, picks[st.id]) === "new");
  if (!fresh.length) continue;
  waiting += fresh.length;
  console.log(`${st.name} (${st.id}): ${fresh.length} new, newest found ${fresh.map(v => v.found || "").sort().pop()}`);
}
console.log(waiting ? `${waiting} programmes wait for "✓ Approve all new" in Channel Studio.` : "Nothing waiting in Channel Studio.");
