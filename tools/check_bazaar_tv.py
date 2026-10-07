#!/usr/bin/env python3
"""
Checks that Bazaar TV (channel 1) carries only programmes that fit it. The owner's rule (2026-10-07):
no programmes for small children on Bazaar TV, they belong on Bazaar Kids (channel 5); every channel
carries only what fits it. Run after the day's lists are built (build-trailers.yml); it fails, naming
what doesn't fit, so it never goes on air unnoticed.

Run: python3 tools/check_bazaar_tv.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_bazaar_blocks import KIDS, for_grown_ups  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHANNEL = os.path.join(ROOT, "docs", "channel")


def main():
    c = json.load(open(os.path.join(CHANNEL, "test-schedule.json"), encoding="utf-8"))
    by_id = {v["id"]: v for v in c.get("videos", [])}
    on_air = list(dict.fromkeys(c.get("loop", []) + c.get("fillers", []) + [s.get("video") for s in c.get("slots", [])]))
    wrong = []
    for vid in on_air:
        v = by_id.get(vid)
        if not v:
            continue
        if KIDS.search(v.get("title", "")) or KIDS.search(v.get("url", "")):
            wrong.append(f"{vid}: {v.get('title')} (children's programme)")
        if v.get("kind") in ("trailers", "music", "list"):
            path = os.path.join(CHANNEL, os.path.basename(v["url"]))
            if not os.path.exists(path):
                continue
            for item in (lambda d: d.get("videos", []) + d.get("spares", []))(json.load(open(path, encoding="utf-8"))):
                if not for_grown_ups(item):
                    wrong.append(f"{vid} ({os.path.basename(path)}): {item.get('title')} · {item.get('label')}")
    if wrong:
        print("Not for Bazaar TV (move children's programmes to Bazaar Kids):", *wrong, sep="\n  ")
        sys.exit(1)
    print(f"Bazaar TV: {len(on_air)} items checked, all fit the channel.")


if __name__ == "__main__":
    main()
