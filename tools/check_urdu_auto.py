#!/usr/bin/env python3
"""
Is there enough Urdu car content for a Spark Auto Urdu channel yet? (The owner's plan, 2026-10-08: Spark Auto
is English (47) and Hindi (32); Urdu only had about 30 hours, from Car Mate PK and PakWheels, so it waits
until there are at least MIN_HOURS.) Run once a month by check-urdu-auto.yml.

Reads each Pakistani car channel's newest uploads and its "review" search with the same filters as the
Spark Auto builder (length, never-on-our-channels words, no horror), adds up the hours, and checks a sample
of each source with YouTube's oEmbed (as the pre-air check does). Writes docs/channel/urdu-auto-check.json;
prints ENOUGH=1 when the total reaches MIN_HOURS, so the workflow can open an issue.
"""
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_dramas import channel_id, videos_page  # noqa: E402
from build_youtube_channels import CHANNELS, NEVER  # noqa: E402
from no_horror import is_horror  # noqa: E402
from preair_check import lookup  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIN_HOURS = 100
# Pakistani car channels in Urdu; add a line when a new one turns up.
SOURCES = [
    ("Car Mate PK", ["@CarMatePK", "@carmatepk"], "Car Mate"),
    ("PakWheels", ["@PakWheels", "@pakwheels"], "PakWheels"),
    ("Sunday Drive", ["@SundayDrive", "@SundayDrivePK"], "Sunday Drive"),
    ("AutoWorld PK", ["@AutoWorldPK", "@autoworldpakistan"], "Auto World|AutoWorld"),
    ("Auto Deals", ["@AutoDealsPK"], "Auto Deals"),
    ("Car First", ["@CarFirstPK", "@carfirstpk"], "CarFirst|Car First"),
    ("Gari.pk", ["@GariPK", "@garipk"], "Gari"),
]


def main():
    auto = CHANNELS["auto"]
    skip = re.compile(rf"{NEVER}|{auto['skip']}", re.I)
    low, high = auto["mins"]
    rows, total = [], 0.0
    for label, handles, name in SOURCES:
        _, chan = channel_id(handles, name)
        row = {"label": label, "found": bool(chan)}
        if chan:
            seen, kept = set(), []
            for url in (f"https://www.youtube.com/channel/{chan}/videos", f"https://www.youtube.com/channel/{chan}/search?query=review"):
                try:
                    for vid, title, mins, _ in videos_page(url, with_age=True):
                        if vid in seen or skip.search(title) or is_horror(title) or (mins is not None and not low <= mins <= high):
                            continue
                        seen.add(vid)
                        kept.append((vid, mins or 0))
                except Exception as e:  # noqa: BLE001
                    print(f"  {url}: {e}", file=sys.stderr)
            checks = [lookup(vid) for vid, _ in kept[:10]]
            ok = sum(1 for c in checks if c == "ok")
            # Only a source whose sampled videos all play counts.
            hours = round(sum(m for _, m in kept) / 60, 1) if checks and ok == len(checks) else 0
            row.update({"videos": len(kept), "hours": hours, "sample_ok": f"{ok}/{len(checks)}"})
            total += hours
        rows.append(row)
        print(f"{label:16} {row}")
    out = {"checked": dt.date.today().isoformat(), "min_hours": MIN_HOURS, "hours": round(total, 1),
           "enough": total >= MIN_HOURS, "sources": rows}
    with open(os.path.join(ROOT, "docs", "channel", "urdu-auto-check.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Urdu car content: {out['hours']} h (needs {MIN_HOURS})")
    print(f"ENOUGH={int(out['enough'])}")


if __name__ == "__main__":
    main()
