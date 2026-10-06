#!/usr/bin/env python3
"""
Builds Bazaar TV's block of upcoming film trailers (the owner's wish, 2026-10-06): the newest
official trailers and teasers of English, Hindi, Punjabi and Pakistani films, from the studios'
and labels' own YouTube channels. They play in YouTube's own player, locked like Bazaar Hits
(docs/channel/block.html); nothing is downloaded or re-hosted, as YouTube's terms require.

Bazaar TV's schedule holds one entry of kind "trailers" pointing at docs/channel/trailers.json;
the app (MyChannel.expand) and the website (schedule.js expand) put this list in its place, so the
block changes every day without the owner saving anything in the Studio.

Each video's exact length matters: every viewer joins the block at the same moment, worked out
from the clock. Only uploads from the last MAX_DAYS days count as "upcoming".

Writes docs/channel/trailers.json. Standard library only.
Run: python3 tools/build_trailers.py
"""
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_dramas import channel_id, fetch, _text  # noqa: E402
from build_youtube_channels import other_language  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "channel", "trailers.json")

# Newer than this many days counts as upcoming (films are usually out within three months of the trailer).
MAX_DAYS = 60
# A trailer or teaser runs from about half a minute to five minutes.
SECS = (25, 330)
# The whole block, about 50 minutes, so Bazaar TV's test programme comes to about two hours.
TARGET_SECS = 50 * 60
# At most this many trailers of one film (a teaser and a trailer are both fine).
PER_FILM = 2

TRAILER = re.compile(r"\btrailer\b|\bteaser\b", re.I)
SKIP = re.compile(r"reaction|review|breakdown|explained|recap|behind the scenes|\bbts\b|making of|interview|"
                  r"full (movie|film)|#shorts?\b|\bshorts\b|song|lyric|jukebox|\baudio\b|fan[- ]?made|concept|"
                  r"\bspoof\b|parody|re-?release|anniversary|\bgame\b|gameplay|season \d|series|\bep(isode)?\b|"
                  r"tv spot|\bspot\b|featurette|clip|scene|restor|remaster|television|netflix|prime video|disney\+|"
                  r"jiohotstar|hotstar|zee5|\bott\b|streaming|out tomorrow|out now|trailer out|announcement|countdown", re.I)
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
MON = r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?"
DAY_MONTH = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s*" + MON + r"(?:\s*,?\s*(20\d\d))?", re.I)
MONTH_DAY = re.compile(r"\b" + MON + r"\s*(\d{1,2})(?:st|nd|rd|th)?\b(?:\s*,?\s*(20\d\d))?", re.I)

# (label, handles, the channel's name as YouTube shows it). Only a channel whose name fits is used.
LANGUAGES = [
    ("English", "Upcoming English movies", [
        ("Warner Bros. Pictures", ["@warnerbrospictures", "@WarnerBrosPictures"], "Warner Bros"),
        ("Universal Pictures", ["@UniversalPictures", "@universalpictures"], "Universal Pictures"),
        ("Sony Pictures", ["@SonyPictures", "@sonypictures"], "Sony Pictures Entertainment|Sony Pictures"),
        ("Paramount Pictures", ["@ParamountPictures", "@paramountpictures"], "Paramount Pictures"),
        ("Marvel", ["@marvel", "@Marvel"], "Marvel Entertainment|Marvel"),
        ("20th Century Studios", ["@20thCenturyStudios", "@20thcenturystudios"], "20th Century Studios"),
        ("Lionsgate", ["@LionsgateMovies", "@lionsgatemovies"], "Lionsgate Movies|Lionsgate"),
        ("Pixar", ["@Pixar", "@pixar"], "Pixar"),
    ]),
    ("Hindi", "Upcoming Hindi movies", [
        ("Yash Raj Films", ["@yrf", "@YRF"], "Yash Raj Films|YRF"),
        ("T-Series", ["@tseries", "@TSeries"], "T-Series"),
        ("Dharma Productions", ["@dharmamovies", "@DharmaProductions"], "Dharma Productions"),
        ("Excel Movies", ["@excelmovies", "@ExcelMovies"], "Excel Movies|Excel Entertainment"),
        ("Maddock Films", ["@MaddockFilms", "@maddockfilms"], "Maddock Films"),
        ("Jio Studios", ["@JioStudios", "@jiostudios"], "Jio Studios"),
        ("Pen Movies", ["@PenMovies"], "Pen Movies"),
    ]),
    ("Punjabi", "Upcoming Punjabi movies", [
        ("Speed Records", ["@SpeedRecords", "@speedrecords"], "Speed Records"),
        ("White Hill Music", ["@WhiteHillMusic", "@whitehillmusic"], "White Hill"),
        ("Rhythm Boyz", ["@RhythmBoyz", "@rhythmboyzentertainment"], "Rhythm Boyz"),
        ("Tips Punjabi", ["@TipsPunjabi", "@tipspunjabi"], "Tips Punjabi"),
        ("Geet MP3", ["@GeetMP3"], "Geet MP3"),
        ("Humble Music", ["@HumbleMusic", "@humblemusic"], "Humble"),
    ]),
    ("Pakistani", "Upcoming Pakistani movies", [
        ("ARY Films", ["@ARYFilms", "@aryfilms", "@ARYFilmsOfficial"], "ARY Films"),
        ("Showcase Films", ["@ShowcaseFilms", "@showcasefilms"], "Showcase Films"),
    ]),
]

AGO = re.compile(r"(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago", re.I)
DAYS = {"second": 0, "minute": 0, "hour": 0, "day": 1, "week": 7, "month": 30, "year": 365}


def seconds(length):
    total = 0
    for part in (length or "").split(":"):
        if not part.isdigit():
            return None
        total = total * 60 + int(part)
    return total or None


def age_days(chunk):
    m = AGO.search(chunk)
    return int(m.group(1)) * DAYS[m.group(2).lower()] if m else None


def uploads(url):
    """A channel's videos page: (id, title, seconds, days since upload) for each video."""
    page = fetch(url)
    out, seen = [], set()
    for m in re.finditer(r'"videoRenderer":\{"videoId":"([\w-]{11})"', page):
        chunk = page[m.end():m.end() + 6000].split('"videoRenderer":{', 1)[0]
        title = re.search(r'"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"', chunk)
        length = re.search(r'"lengthText":\{.*?"simpleText":"([\d:]+)"', chunk)
        ago = re.search(r'"publishedTimeText":\{"simpleText":"([^"]*)"', chunk)
        if title and m.group(1) not in seen:
            seen.add(m.group(1))
            out.append((m.group(1), _text(title.group(1)), seconds(length.group(1)) if length else None,
                        age_days(ago.group(1)) if ago else None))
    for m in re.finditer(r'"lockupViewModel":\{', page):
        # Only this video's part of the page, so the next one's date isn't read as its own.
        chunk = page[m.end():m.end() + 12000].split('"lockupViewModel":{', 1)[0]
        vid = re.search(r'"contentId":"([\w-]{11})"', chunk)
        if not vid or vid.group(1) in seen or "LOCKUP_CONTENT_TYPE_VIDEO" not in chunk:
            continue
        title = re.search(r'"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"', chunk)
        length = re.search(r'"text":"(\d{1,2}:\d{2}(?::\d{2})?)"', chunk)
        if title:
            seen.add(vid.group(1))
            out.append((vid.group(1), _text(title.group(1)), seconds(length.group(1)) if length else None, age_days(chunk)))
    return out


def released(title, today):
    """Whether the title's own release date ("In Cinemas 16th Oct", "Rel 17th July") has passed by more than a week."""
    m = DAY_MONTH.search(title)
    if m:
        day, mon, year = int(m.group(1)), m.group(2), m.group(3)
    else:
        m = MONTH_DAY.search(title)
        if not m:
            return False
        mon, day, year = m.group(1), int(m.group(2)), m.group(3)
    try:
        date = dt.date(int(year) if year else today.year, MONTHS.index(mon.lower()[:3]) + 1, day)
    except ValueError:
        return False
    # "15th Jan" written in October is next January.
    if not year and (today - date).days > 200:
        date = date.replace(year=date.year + 1)
    return (today - date).days > 7


def film_name(title):
    """The film a trailer belongs to: the title before "Official Trailer", "| Teaser" and the like."""
    name = re.split(r"\s*[|\-–—:(\[]\s*(?:official\s+)?(?:hindi\s+|punjabi\s+|urdu\s+|final\s+|new\s+|first\s+)?(?:trailer|teaser)",
                    title, maxsplit=1, flags=re.I)[0]
    name = re.sub(r"\b(official|trailer|teaser|\d+)\b", " ", name, flags=re.I)
    return re.sub(r"[^a-z]", "", name.lower()) or title.lower()


def language(lang, label, sources, today, old):
    found, films = [], {}
    for source, handles, name in sources:
        _, chan = channel_id(handles, name)
        if not chan:
            print(f"{source}: channel not found", file=sys.stderr)
            continue
        videos = []
        for url in (f"https://www.youtube.com/channel/{chan}/videos",
                    f"https://www.youtube.com/channel/{chan}/search?query=official+trailer"):
            try:
                videos += uploads(url)
            except Exception as e:  # noqa: BLE001
                print(f"  {url}: {e}", file=sys.stderr)
        kept = 0
        for vid, title, secs, age in videos:
            if not TRAILER.search(title) or SKIP.search(title) or other_language(title) or released(title, today):
                continue
            if secs is None or not SECS[0] <= secs <= SECS[1]:
                continue
            first = old.get(vid, {}).get("found", today.isoformat())
            # Without an upload date, a trailer counts from the day we first saw it.
            if (age if age is not None else (today - dt.date.fromisoformat(first)).days) > MAX_DAYS:
                continue
            film = film_name(title)
            if films.get(film, 0) >= PER_FILM or any(v["id"] == vid for v in found):
                continue
            films[film] = films.get(film, 0) + 1
            found.append({"id": vid, "title": title.strip(), "label": source, "lang": lang, "secs": secs,
                          "age": age, "found": first})
            print(f"    {age if age is not None else '?':>3} days  {title}")
            kept += 1
        print(f"{lang} · {source}: {len(videos)} videos, {kept} trailers")
    # Newest first.
    found.sort(key=lambda v: (v["age"] if v["age"] is not None else 999, v["title"]))
    return found


def main():
    today = dt.date.today()
    old = {}
    if os.path.exists(OUT):
        old = {v["id"]: v for v in json.load(open(OUT, encoding="utf-8")).get("videos", [])}
    lists = [(lang, label, language(lang, label, sources, today, old)) for lang, label, sources in LANGUAGES]
    # Each language gets an equal share of the block; a language with too few trailers leaves its
    # share to the others. In the block they follow one another: English, Hindi, Punjabi, Pakistani.
    chosen = {lang: [] for lang, _, _ in lists}
    used, share = 0, TARGET_SECS // len(lists)
    for rnd in range(2):
        for lang, _, videos in lists:
            have = sum(v["secs"] for v in chosen[lang])
            for v in videos:
                if v in chosen[lang]:
                    continue
                if used + v["secs"] > TARGET_SECS or (rnd == 0 and have + v["secs"] > share):
                    continue
                chosen[lang].append(v)
                have += v["secs"]
                used += v["secs"]
    block = []
    for lang, label, _ in lists:
        for i, v in enumerate(sorted(chosen[lang], key=lambda v: (v["age"] if v["age"] is not None else 999))):
            block.append({**v, "section": label if i == 0 else None})
    for v in block:
        if v["section"] is None:
            del v["section"]
        del v["age"]
    counts = ", ".join(f"{lang} {len(chosen[lang])}" for lang, _, _ in lists)
    total = sum(v["secs"] for v in block)
    summary = f"{len(block)} trailers, {total // 60} min ({counts})"
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::notice title=Upcoming trailers::{summary}")
    for v in block:
        print(f"  {v['lang']:9} {v['secs']:4}s  {v['label']:24} {v['title']}  (first seen {v['found']})")
    if len(block) < 6:
        sys.exit(f"Too few trailers ({summary}); keeping the old list.")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"name": "Upcoming movie trailers", "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                   "secs": total, "videos": block}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Wrote {os.path.relpath(OUT, ROOT)}: {summary}")


if __name__ == "__main__":
    main()
