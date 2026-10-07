#!/usr/bin/env python3
"""
Builds the programme blocks that make Bazaar TV's six-hour day feel like a real channel (the owner's
wish, 2026-10-06): dramas, cooking, comedy and a Hindi film (no children's shows: those are on Bazaar Kids), picked each day from the
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from titles import screen_title  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHANNEL = os.path.join(ROOT, "docs", "channel")

# Since 2026-10-07 the owner wants Bazaar TV 100% Urdu and Hindi: only Hindi and Urdu uploaders
# (the English kids' channels, Get Curried and the English sports and travel channels are left out),
# and a Hindi film in place of sports and travel.
# Bazaar TV carries no programmes for small children (the owner, 2026-10-07): they belong on Bazaar Kids
# (channel 5). Nothing whose uploader or title looks like children's TV gets into any block.
KIDS = re.compile(r"chuchu|cocomelon|infobells|peppa|masha|nursery|rhymes?\b|kids?\b|toddler|cartoon|"
                  r"lullab|abc song|phonics|bal geet|bachon|bacho", re.I)

# A cooking show's video is about food (a singer who shares a cook's name once slipped in).
COOKING = (r"recipe|banaye|banane|bana(?:ein|yen)|kitchen|cook|karahi|biryani|curry|sabzi|da(?:a)?l\b|roti|halwa|kheer|"
           r"chicken|mutton|beef|paneer|masala|sandwich|cake|pakor|tikka|kebab|salad|pulao|nihari|haleem|chutney|"
           r"dessert|breakfast|lunch|dinner|snack|qeema|keema|korma|paratha|samosa|chaat|modak|laddu|barfi")

def for_grown_ups(v):
    return not KIDS.search(v.get("title", "")) and not KIDS.search(v.get("label", ""))
URDU_HINDI_COOKING = {"Food Fusion", "Kitchen with Amna", "Masala TV", "Shireen Anwar", "Sanjeev Kapoor",
                      "Ranveer Brar", "Kabita's Kitchen"}
# name: (source lists, kind, about how many minutes, shortest and longest video in minutes, title filter,
#        title to skip, uploaders to use (None: all))
BLOCKS = {
    "drama-1": (["dramas"], "drama", 40, (18, 48), r"episode|\bep\b", r"reality|tamasha|game show|morning", None),
    "drama-2": (["dramas"], "drama", 40, (18, 48), r"episode|\bep\b", r"reality|tamasha|game show|morning", None),
    "drama-3": (["dramas"], "drama", 40, (18, 48), r"episode|\bep\b", r"reality|tamasha|game show|morning", None),
    "cooking": (["cooking"], "cooking", 20, (4, 16), COOKING, r"official|music video|\bsong\b|animated", URDU_HINDI_COOKING),
    "comedy": (["comedy"], "comedy", 25, (3, 26), None, None, {"Taarak Mehta"}),
    # One whole Hindi film, an hour and a half to two and a half hours.
    "film": (["filmein", "hindi"], "film", 90, (80, 150), r"hindi|urdu|[\u0900-\u097F]",
             r"bhojpuri|marathi|punjabi|gujarati|bengali|english|trailer|teaser|scene|songs", None),
}
TITLES = {"kids": "بچوں کا وقت", "drama": "ڈرامہ", "cooking": "کھانا پکائیں", "comedy": "مزاحیہ", "film": "ہندی فلم"}


def main():
    today = dt.date.today()
    rnd = random.Random(today.toordinal())
    taken = set()
    for name, (sources, kind, mins, (low, high), keep, skip, labels) in BLOCKS.items():
        videos = []
        for source in sources:
            path = os.path.join(CHANNEL, f"yt-{source}.json")
            try:
                videos += json.load(open(path, encoding="utf-8")).get("videos", [])
            except (OSError, ValueError) as e:
                print(f"{name}: {e}", file=sys.stderr)
        pool = [v for v in videos if v.get("mins") and low <= v["mins"] <= high and v["id"] not in taken
                and (labels is None or v.get("label") in labels) and for_grown_ups(v)
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
            chosen.append({"id": v["id"], "title": screen_title(v["title"], TITLES[kind]), "label": v.get("label", ""), "secs": secs, "kind": kind})
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
