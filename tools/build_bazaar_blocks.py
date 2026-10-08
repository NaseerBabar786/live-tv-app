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

Only videos that play in an embedded player (tools/playable.py), and a few spares of the same kind that the
block page plays in place of one that still won't start there.

Writes docs/channel/block-<name>.json. Standard library only.
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
from playable import plays  # noqa: E402
from build_youtube_channels import recent_film  # noqa: E402
from no_horror import is_horror  # noqa: E402  (the owner's rule 2026-10-08: no horror on our channels)

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

# Bazaar TV One is a newly launched channel (the owner, 2026-10-08: "only keep the new programs, so we get
# the feeling of a new channel"): a drama episode, cooking show or comedy episode must have gone up in the
# last NEW_DAYS days (the date in its title, else the day YouTube shows), and a film must be one released
# this year or last year (the year in its title, as on Latest Movies). Old episodes re-uploaded today
# ("SE 01 EP 360", "Haste Raho" compilations of old episodes) stay out.
NEW_DAYS = 90
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
TITLE_DATE = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?[\s\-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,\-']+(\d{4}|\d{2})\b", re.I)
EPISODE_NO = re.compile(r"(?:new|full) episode (\d{3,5})", re.I)
NEWEST_EPISODE = {}  # uploader: highest episode number in its list (set in main)
OLD_YEAR = re.compile(r"\b(19[3-9]\d|20[0-4]\d)\b")


def aired(v):
    """The day this video's programme first aired or went up, as far as we can tell; None when unknown."""
    m = TITLE_DATE.search(v.get("title", ""))
    if m:
        year = int(m.group(3))
        try:
            return dt.date(year + 2000 if year < 100 else year, MONTHS.index(m.group(2).lower()[:3]) + 1, int(m.group(1)))
        except ValueError:
            pass
    up = v.get("posted") or v.get("up")
    return dt.date.fromisoformat(up) if up else None


def is_new(v, kind, today):
    if kind == "film":
        return recent_film(v.get("title", ""), today, 1)
    years = [int(y) for y in OLD_YEAR.findall(v.get("title", ""))]
    if years and min(years) < today.year - 1:
        return False
    day = aired(v)
    if day is None and kind == "comedy":
        # A numbered episode within about two months of the newest one (Taarak Mehta airs six a week).
        m = EPISODE_NO.search(v.get("title", ""))
        return bool(m) and int(m.group(1)) >= NEWEST_EPISODE.get(v.get("label"), 0) - 50
    return day is not None and (today - day).days <= NEW_DAYS


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
    # Only this week's Taarak Mehta episodes ("NEW Episode 4835", "FULL EPISODE 4816"), not the old ones
    # the channel re-uploads ("SE 01 EP 360") or its compilations of old scenes.
    "comedy": (["comedy"], "comedy", 25, (3, 26), r"(new|full) episode \d{4}", r"\bse \d+ ep\b|haste raho|full movie", {"Taarak Mehta"}),
    # One whole Hindi film, an hour and a half to two and a half hours.
    "film": (["latest", "hindi", "filmein"], "film", 90, (75, 150), r"hindi|urdu|telefilm|[\u0900-\u097F]",
             r"bhojpuri|marathi|punjabi|gujarati|bengali|english|trailer|teaser|scene|songs", None),
}
# Spare videos for each block, in case one won't start on a viewer's TV (docs/channel/block.html).
SPARES = 3
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
        for v in videos:
            m = EPISODE_NO.search(v.get("title", ""))
            if m:
                NEWEST_EPISODE[v.get("label")] = max(NEWEST_EPISODE.get(v.get("label"), 0), int(m.group(1)))
        pool = [v for v in videos if v.get("mins") and low <= v["mins"] <= high and v["id"] not in taken
                and (labels is None or v.get("label") in labels) and for_grown_ups(v) and not is_horror(v) and is_new(v, kind, today)
                and (not keep or re.search(keep, v["title"], re.I)) and not (skip and re.search(skip, v["title"], re.I))]
        # The newest (or main events) first, in a different order each day.
        top = [v for v in pool if v.get("top") or v.get("found", "") >= (today - dt.timedelta(days=7)).isoformat()]
        rest = [v for v in pool if v not in top]
        rnd.shuffle(top)
        rnd.shuffle(rest)
        chosen, spares, total = [], [], 0
        item = lambda v: {"id": v["id"], "title": screen_title(v["title"], TITLES[kind]), "label": v.get("label", ""),
                          "secs": round(v["mins"] * 60), "kind": kind}
        for v in top + rest:
            secs = round(v["mins"] * 60)
            if total >= mins * 60 * 0.85:
                if len(spares) >= SPARES:
                    break
                if plays(v["id"]):
                    spares.append(item(v))
                    taken.add(v["id"])
                continue
            if total and total + secs > mins * 60 * 1.15:
                continue
            if not plays(v["id"]):
                print(f"{name}: leaving out {v['id']} (won't play embedded)", file=sys.stderr)
                continue
            chosen.append(item(v))
            taken.add(v["id"])
            total += secs
        if not chosen:
            print(f"{name}: nothing to choose; keeping the old list.", file=sys.stderr)
            continue
        out = os.path.join(CHANNEL, f"block-{name}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"name": TITLES[kind], "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                       "secs": total, "videos": chosen, "spares": spares}, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print(f"{name}: {len(chosen)} videos, {total // 60} min: " + " / ".join(v["title"][:50] for v in chosen))


if __name__ == "__main__":
    main()
