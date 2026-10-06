#!/usr/bin/env python3
"""
Builds the programme blocks that make Bazaar TV's six-hour day feel like a real channel (the owner's
wish, 2026-10-06): cartoons, dramas, cooking, comedy, sports and travel, picked each day from the
official YouTube lists our other channels already use (docs/channel/yt-<id>.json, built daily by
tools/build_youtube_channels.py). They play in YouTube's player, locked like Bazaar Hits
(docs/channel/block.html), between our own ads, idents and free shows.

Bazaar TV's schedule holds one entry of kind "list" per block, pointing at docs/channel/block-<name>.json;
the app (MyChannel.expand) and the website (schedule.js expand) put the day's videos in its place.
A different choice each day (seeded by the date), the same for every viewer.

Writes docs/channel/block-<name>.json. Standard library only, no network.
Run: python3 tools/build_bazaar_blocks.py
"""
import datetime as dt
import json
import os
import random
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHANNEL = os.path.join(ROOT, "docs", "channel")

# name: (source list, kind, about how many minutes, shortest and longest video in minutes, title filter, title to skip)
BLOCKS = {
    "kids": ("kids", "kids", 30, (2, 15), None, None),
    "drama-1": ("dramas", "drama", 40, (18, 48), r"episode|\bep\b", r"reality|tamasha|game show|morning"),
    "drama-2": ("dramas", "drama", 40, (18, 48), r"episode|\bep\b", r"reality|tamasha|game show|morning"),
    "cooking": ("cooking", "cooking", 20, (4, 16), None, None),
    "comedy": ("comedy", "comedy", 25, (3, 26), None, None),
    "sports": ("sports", "sports", 25, (2, 12), None, None),
    "travel": ("travel", "travel", 20, (2, 12), None, None),
}
TITLES = {"kids": "Kids' time", "drama": "Drama", "cooking": "Cooking", "comedy": "Comedy",
          "sports": "Sports highlights", "travel": "Travel"}


def main():
    today = dt.date.today()
    rnd = random.Random(today.toordinal())
    taken = set()
    for name, (source, kind, mins, (low, high), keep, skip) in BLOCKS.items():
        path = os.path.join(CHANNEL, f"yt-{source}.json")
        try:
            videos = json.load(open(path, encoding="utf-8")).get("videos", [])
        except (OSError, ValueError) as e:
            print(f"{name}: {e}", file=sys.stderr)
            continue
        pool = [v for v in videos if v.get("mins") and low <= v["mins"] <= high and v["id"] not in taken
                and (not keep or re.search(keep, v["title"], re.I)) and not (skip and re.search(skip, v["title"], re.I))]
        # The newest (or main events) first, in a different order each day.
        top = [v for v in pool if v.get("top") or v.get("found", "") >= (today - dt.timedelta(days=7)).isoformat()]
        rest = [v for v in pool if v not in top]
        rnd.shuffle(top)
        rnd.shuffle(rest)
        chosen, total = [], 0
        for v in top + rest:
            secs = round(v["mins"] * 60)
            if total and total + secs > mins * 60 * 1.15:
                continue
            chosen.append({"id": v["id"], "title": v["title"], "label": v.get("label", ""), "secs": secs, "kind": kind})
            taken.add(v["id"])
            total += secs
            if total >= mins * 60 * 0.85:
                break
        if not chosen:
            print(f"{name}: nothing to choose; keeping the old list.", file=sys.stderr)
            continue
        out = os.path.join(CHANNEL, f"block-{name}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"name": TITLES[kind], "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                       "secs": total, "videos": chosen}, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print(f"{name}: {len(chosen)} videos, {total // 60} min: " + " / ".join(v["title"][:50] for v in chosen))


if __name__ == "__main__":
    main()
