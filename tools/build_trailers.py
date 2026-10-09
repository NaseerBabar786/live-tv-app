#!/usr/bin/env python3
"""
Builds Bazaar TV's block of upcoming film trailers (the owner's wish, 2026-10-06): the newest
official trailers and teasers of Hindi and Pakistani (Urdu) films, from the studios'
and labels' own YouTube channels. They play in YouTube's own player, locked like Bazaar Hits
(docs/channel/block.html); nothing is downloaded or re-hosted, as YouTube's terms require.

Bazaar TV's schedule holds one entry of kind "trailers" pointing at docs/channel/trailers.json;
the app (MyChannel.expand) and the website (schedule.js expand) put this list in its place, so the
block changes every day without the owner saving anything in the Studio.

Each video's exact length matters: every viewer joins the block at the same moment, worked out
from the clock. Only uploads from the last MAX_DAYS days count as "upcoming".

Since 2026-10-08 the same run also builds Movie Trailers, our channel of nothing but upcoming film
trailers (the owner's wish): mostly English, from the Hollywood studios' own channels (ENGLISH), with
the Hindi and Pakistani ones above making up about a fifth. It plays like Bazaar Hits, locked, on
docs/channel/ytc.html?c=trailers, in a new order every day.

Writes docs/channel/trailers.json and docs/channel/yt-trailers.json. Standard library only.
Run: python3 tools/build_trailers.py
"""
import datetime as dt
from itertools import zip_longest
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_dramas import channel_id, fetch, _text  # noqa: E402
from build_youtube_channels import other_language  # noqa: E402
from titles import screen_title  # noqa: E402
from no_horror import is_horror  # noqa: E402  (the owner's rule 2026-10-08: no horror on our channels)
from playable import keep_playable  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "channel", "trailers.json")

# Newer than this many days counts as upcoming (films are usually out within three months of the trailer).
MAX_DAYS = 60
# A trailer or teaser runs from about half a minute to five minutes.
SECS = (25, 330)
# The whole block, about 35 minutes. Since 2026-10-07 only Hindi and Pakistani films: the owner wants
# Bazaar TV 100% Urdu and Hindi.
TARGET_SECS = 35 * 60
# At most this many trailers of one film (a teaser and a trailer are both fine).
PER_FILM = 2

TRAILER = re.compile(r"\btrailer\b|\bteaser\b", re.I)
SKIP = re.compile(r"reaction|review|breakdown|explained|recap|behind the scenes|\bbts\b|making of|interview|"
                  r"full (movie|film)|#shorts?\b|\bshorts\b|song|lyric|jukebox|\baudio\b|fan[- ]?made|concept|"
                  r"\bspoof\b|parody|re-?release|anniversary|\bgame\b|gameplay|season \d|series|\bep(isode)?\b|"
                  r"tv spot|\bspot\b|featurette|clip|scene|restor|remaster|television|netflix|prime video|disney\+|"
                  r"jiohotstar|hotstar|zee5|\bott\b|streaming|out tomorrow|out now|trailer out|announcement|countdown|"
                  # A TV channel's promo for showing an old film ("RELEASING THIS SUNDAY, AT 8:00 PM"), not a new film.
                  r"releasing (?:this|next|tomorrow|today)|at \d{1,2}(?::\d\d)? ?[ap]\.?m\b", re.I)
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
MON = r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?"
DAY_MONTH = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s*" + MON + r"(?:\s*,?\s*(20\d\d))?", re.I)
MONTH_DAY = re.compile(r"\b" + MON + r"\s*(\d{1,2})(?:st|nd|rd|th)?\b(?:\s*,?\s*(20\d\d))?", re.I)

# (label, handles, the channel's name as YouTube shows it). Only a channel whose name fits is used.
LANGUAGES = [
    ("Hindi", "آنے والی ہندی فلمیں", [
        ("Yash Raj Films", ["@yrf", "@YRF"], "Yash Raj Films|YRF"),
        ("T-Series", ["@tseries", "@TSeries"], "T-Series"),
        ("Dharma Productions", ["@dharmamovies", "@DharmaProductions"], "Dharma Productions"),
        ("Excel Movies", ["@excelmovies", "@ExcelMovies"], "Excel Movies|Excel Entertainment"),
        ("Maddock Films", ["@MaddockFilms", "@maddockfilms"], "Maddock Films"),
        ("Jio Studios", ["@JioStudios", "@jiostudios"], "Jio Studios"),
        ("Pen Movies", ["@PenMovies"], "Pen Movies"),
    ]),
    ("Pakistani", "آنے والی پاکستانی فلمیں", [
        ("ARY Films", ["@ARYFilms", "@aryfilms", "@ARYFilmsOfficial"], "ARY Films"),
        ("Showcase Films", ["@ShowcaseFilms", "@showcasefilms"], "Showcase Films"),
        ("HUM Films", ["@HUMFilms", "@humfilms", "@HUMFilmsOfficial"], "HUM Films"),
        ("Geo Films", ["@GeoFilms", "@geofilms", "@GeoFilmsOfficial"], "Geo Films"),
        ("IMGC Global", ["@IMGCGlobal", "@imgcglobal"], "IMGC"),
    ]),
]

# Movie Trailers' English half: the Hollywood studios' own channels only.
ENGLISH = [
    ("Warner Bros. Pictures", ["@WarnerBrosPictures", "@warnerbrospictures"], "Warner Bros"),
    ("Universal Pictures", ["@UniversalPictures", "@universalpictures"], "Universal Pictures"),
    ("Sony Pictures", ["@SonyPictures", "@sonypictures"], "Sony Pictures"),
    ("Paramount Pictures", ["@ParamountPictures", "@paramountpictures"], "Paramount Pictures"),
    ("Walt Disney Studios", ["@DisneyStudios", "@WaltDisneyStudios"], "Walt Disney Studios|Disney Studios"),
    ("Marvel", ["@marvel", "@MarvelEntertainment"], "Marvel Entertainment|Marvel"),
    ("Pixar", ["@Pixar", "@pixar"], "Pixar"),
    ("20th Century Studios", ["@20thCenturyStudios", "@20thcenturystudios"], "20th Century Studios"),
    ("Lionsgate", ["@Lionsgate", "@LionsgateMovies"], "Lionsgate"),
    ("Amazon MGM Studios", ["@AmazonMGMStudios", "@amazonmgmstudios"], "Amazon MGM Studios"),
    ("Focus Features", ["@FocusFeatures", "@focusfeatures"], "Focus Features"),
    ("DreamWorks Animation", ["@DreamWorksAnimation", "@dreamworksanimation"], "DreamWorks"),
]
CHANNEL_OUT = os.path.join(ROOT, "docs", "channel", "yt-trailers.json")
# The channel keeps trailers a little longer than Bazaar TV's block: new films are still showing then.
CHANNEL_DAYS = 90
# English is about four in five of the channel's trailers.
OTHER_SHARE = 0.25
# Red-band (grown-ups only) trailers and horror never go on the channel.
ADULT = re.compile(r"red[- ]?band|restricted|\brated r\b|\br-rated\b|uncensored|explicit|18\+|nsfw|"
                   r"horror|slasher|haunt|ghost|zombie|demon|exorcis|possess|terrifier|\bsaw\b|conjuring|annabelle|"
                   r"insidious|smile 2|final destination|scream \d|\bthe nun\b|5 nights|five nights", re.I)

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


def language(lang, label, sources, today, old, max_days=MAX_DAYS):
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
            if not TRAILER.search(title) or SKIP.search(title) or is_horror(title) or other_language(title) or released(title, today):
                continue
            if secs is None or not SECS[0] <= secs <= SECS[1]:
                continue
            first = old.get(vid, {}).get("found", today.isoformat())
            # Only trailers whose upload date YouTube shows (2026-10-08): without one, old trailers found by
            # the channel search (Bodyguard, Kuch Kuch Hota Hai, a TV premiere of an old film) looked new.
            if age is None or age > max_days:
                continue
            film = film_name(title)
            if films.get(film, 0) >= PER_FILM or any(v["id"] == vid for v in found):
                continue
            films[film] = films.get(film, 0) + 1
            found.append({"id": vid, "title": screen_title(title, f"{source} trailer"), "label": source, "lang": lang, "secs": secs,
                          "age": age, "found": first, "kind": "trailer"})
            print(f"    {age if age is not None else '?':>3} days  {title}")
            kept += 1
        print(f"{lang} · {source}: {len(videos)} videos, {kept} trailers")
    # Newest first.
    found.sort(key=lambda v: (v["age"] if v["age"] is not None else 999, v["title"]))
    return found


def channel(today, others):
    """Movie Trailers (docs/channel/yt-trailers.json): every English trailer found, and the Hindi and
    Pakistani ones [others] up to about a quarter of that. The page plays them in a new order each day."""
    old = {}
    if os.path.exists(CHANNEL_OUT):
        old = {v["id"]: v for v in json.load(open(CHANNEL_OUT, encoding="utf-8")).get("videos", [])}
    english = [v for v in language("English", "", ENGLISH, today, old, CHANNEL_DAYS) if not ADULT.search(v["title"])]
    english = keep_playable(english)
    # Hindi and Pakistani take turns, so a short share still has both.
    by = {}
    for v in others:
        if not ADULT.search(v["title"]):
            by.setdefault(v["lang"], []).append(v)
    turns = [v for row in zip_longest(*by.values()) for v in row if v]
    rest = turns[:max(4, round(len(english) * OTHER_SHARE))]
    videos = [{"id": v["id"], "title": v["title"], "label": v["label"], "lang": v["lang"], "mins": round(v["secs"] / 60, 2),
               "found": old.get(v["id"], {}).get("found", v["found"]),
               **({"up": (today - dt.timedelta(days=v["age"])).isoformat()} if v.get("age") is not None else {})}
              for v in english + rest]
    langs = {}
    for v in videos:
        langs[v["lang"]] = langs.get(v["lang"], 0) + 1
    summary = f"Movie Trailers: {len(videos)} trailers, {round(sum(v['mins'] for v in videos))} min (" + \
        ", ".join(f"{k} {n}" for k, n in langs.items()) + ")"
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::notice title=Movie Trailers channel::{summary}")
    if len(videos) < 10:
        print(f"{summary}: too few; keeping the old list.", file=sys.stderr)
        return
    with open(CHANNEL_OUT, "w", encoding="utf-8") as f:
        json.dump({"name": "Movie Trailers", "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                   "videos": videos}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Wrote {os.path.relpath(CHANNEL_OUT, ROOT)}: {summary}")


def main():
    today = dt.date.today()
    old = {}
    if os.path.exists(OUT):
        old = {v["id"]: v for v in json.load(open(OUT, encoding="utf-8")).get("videos", [])}
    lists = [(lang, label, language(lang, label, sources, today, old)) for lang, label, sources in LANGUAGES]
    # Only videos that play in an embedded player (Bazaar TV's block page): tools/playable.py.
    lists = [(lang, label, keep_playable(videos)) for lang, label, videos in lists]
    # Movie Trailers takes the Hindi and Pakistani ones too, before the block below drops its "age".
    channel(today, [dict(v) for _, _, videos in lists for v in videos])
    # Each language gets an equal share of the block; a language with too few trailers leaves its
    # share to the others. In the block they follow one another: Hindi, then Pakistani.
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
    if len(block) < 3:
        sys.exit(f"Too few trailers ({summary}); keeping the old list.")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"name": "آنے والی فلموں کے ٹریلر", "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                   "secs": total, "videos": block}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Wrote {os.path.relpath(OUT, ROOT)}: {summary}")


if __name__ == "__main__":
    main()
