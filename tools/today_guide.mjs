// Today's programmes on channel 1, worked out by the same rules the TVs and website use
// (docs/channel/schedule.js), from the lists in docs/channel/ as they are now.
// Prints JSON: { date, tz, rows: [{ at: "15:10", kind: "news" | "programme", block, title }] }.
// Used by tools/make_today_video.py (the "Today on channel 1" list in each half-hour break).
//
// Run: node tools/today_guide.mjs [YYYY-MM-DD]     (default: today in the channel's time zone)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHANNEL = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "channel");
// The lists come from this checkout, not the website (the daily job has just rebuilt them).
globalThis.fetch = async url => {
  const name = String(url).replace(/^https:\/\/tv\.bulkbazaar\.ca\/channel\//, "");
  const text = readFileSync(join(CHANNEL, name), "utf8");
  return { ok: true, json: async () => JSON.parse(text) };
};
const { expand, guide, zonedTime } = await import(join(CHANNEL, "schedule.js"));

const plain = JSON.parse(readFileSync(join(CHANNEL, "test-schedule.json"), "utf8"));
const tz = plain.tz || "America/Toronto";
const date = process.argv[2] || new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
const c = await expand(plain);
const midnight = zonedTime(date, 0, 0, tz);
const blocks = Object.fromEntries((plain.videos || []).map(v => [v.id, v]));
const blockOf = id => (plain.loop || []).find(b => id === b || id.startsWith(b + "-")) || id;
const clock = ms => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);

const rows = [];
let lastBlock = null;
for (const e of guide(c, midnight, 24, 2000)) {
  const v = e.video;
  if (v.kind === "ad" || v.kind === "ident" || v.id === "today") continue;
  if (e.at >= midnight + 86400000) break;
  // After the news, what carries on gets its own line ("resumed"), so the list has no gaps.
  if (v.id.startsWith("news")) { rows.push({ at: clock(e.at), kind: "news", block: v.id, title: v.title }); lastBlock = null; continue; }
  // A programme the 5-minute break cut into carries on after it: once in the list is enough.
  if (e.resumed && lastBlock !== null) continue;
  const block = blockOf(v.id);
  // One row for each run of a block (the songs, the trailers), with its first programme's title.
  if (block === lastBlock) continue;
  lastBlock = block;
  rows.push({ at: clock(e.at), kind: "programme", block, id: v.id, resumed: !!e.resumed, name: (blocks[block] || v).title, title: v.title });
}
console.log(JSON.stringify({ date, tz, rows }, null, 1));
