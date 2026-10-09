#!/usr/bin/env python3
"""
The owner's rule (2026-10-08): no horror programmes on any of our own channels (Bazaar/Spark 1-16: the
YouTube-built ones like Cinema, Movies and Dramas, the free-film schedules, Spark TV One's blocks, the
music and trailer lists). The Library is not part of this rule.

is_horror(item) looks at an item's title, and its description or genre when it has them. Every channel
builder leaves horror out, and the pre-air check (tools/preair_check.py --lists) takes anything horror off
our lists before it goes on air.

Run: python3 tools/no_horror.py            cleans the ready-made schedules (docs/channel/*-schedule.json)
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHANNEL = os.path.join(ROOT, "docs", "channel")

HORROR = re.compile(
    # Words that say horror, in English, Hindi and Urdu
    r"horror|haunt(?:ed|ing)|ghosts?\b(?![- ]?towns?)|zombies?|vampires?|werewolf|dracula|frankenstein|mummy'?s|"
    r"exorcis|paranormal|possess(?:ed|ion)|\bdemons?\b|demonic|\bwitch|voodoo|\bundead\b|evil (?:dead|returns|within)|"
    r"\bbhoot|bhut(?:iya|ni)\b|chudail|churail|daayan|\bdayan\b|pishach|\baatma\b|shaitaan|bhoothaddam|lugosi|"
    r"slasher|creepy|scream(?:ing)? skull|"
    # Horror films known by name (Hindi, South and the classic free films)
    r"\bphoonk\b|kanchana|\bstree\b|munjya|tumbbad|ragini mms|bhool bhulaiyaa|\b1920\b:|\braaz\b ?(?:\(|2|3|reboot)|"
    r"nosferatu|caligari|phantom of the opera|the golem|h[äa]xan|carnival of souls|cat and the canary|"
    r"little shop of horrors|house on haunted hill|brain that wouldn'?t die|bucket of blood|hands of orlac|"
    r"devil bat|the terror \(1963\)|the ghoul|phantom creeps|giant leeches|house on bare mountain|city of the dead|"
    r"the vampire bat|dementia \(|daughter of horror|living dead|last man on earth|dead men walk|the ape \(|"
    r"monster maker|corpse vanishes|bowery at midnight|mad monster|killer shrews|wasp woman|sun demon|"
    r"spider baby|beast of yucca|teenage zombies|the sadist|bloodlust|sweeney todd",
    re.I)


def is_horror(item):
    """Whether a programme is horror: a title string, or a dict with title (and description/genre)."""
    if isinstance(item, str):
        return bool(HORROR.search(item))
    text = " ".join(str(item.get(k, "")) for k in ("title", "description", "genre", "tags"))
    return bool(HORROR.search(text))


def clean_schedule(path):
    """Takes horror off a ready-made schedule (videos, loop, fillers); a slot that held one gets another film."""
    d = json.load(open(path, encoding="utf-8"))
    gone = {v["id"] for v in d.get("videos", []) if is_horror(v)}
    if not gone:
        return []
    titles = [v["title"] for v in d["videos"] if v["id"] in gone]
    d["videos"] = [v for v in d["videos"] if v["id"] not in gone]
    for key in ("loop", "fillers"):
        if isinstance(d.get(key), list):
            d[key] = [x for x in d[key] if x not in gone]
    used = {s.get("video") for s in d.get("slots", [])}
    spare = [v for v in d["videos"] if v["id"] not in used and v.get("secs", 0) >= 3600 and re.search(r"\(\d{4}\)$", v["title"])]
    slots = []
    for s in d.get("slots", []):
        if s.get("video") in gone:
            if not spare:
                continue
            v = spare.pop(0)
            s = dict(s, video=v["id"])
            # Spark Cinema's evening film is named "Raat Ki Film" on screen (tools/build_filmein.py).
            if any(x["title"].startswith("Raat Ki Film: ") for x in d["videos"]) and not v["title"].startswith("Raat Ki Film: "):
                v["title"] = "Raat Ki Film: " + v["title"]
        slots.append(s)
    if "slots" in d:
        d["slots"] = slots
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write("\n")
    return titles


def main():
    total = 0
    for path in sorted(glob.glob(os.path.join(CHANNEL, "*-schedule.json"))) + [os.path.join(CHANNEL, "test-schedule.json")]:
        gone = clean_schedule(path)
        total += len(gone)
        for t in gone:
            print(f"{os.path.basename(path)}: took off {t}")
    print(f"No horror on our channels: {total} programme(s) taken off.")


if __name__ == "__main__":
    sys.exit(main())
