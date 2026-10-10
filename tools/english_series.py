#!/usr/bin/env python3
"""
English drama and comedy series for the Library's English > Series tab (owner, 2026-10-10: "we need to
add series, same like other Urdu, Punjabi and Hindi sections"). Each series comes from its own
official YouTube channel, full episodes only, newer series only (no old classics), no horror.

Episodes are named "Show S01E03 - Title" (or "Show Episode 12 - Title") so Cable TV files them in one
folder per series, in order. Episodes without a number go in the same folder by their group-title.

Used by build_dramas.main(); adds items to its kept dict in the same form as named_shows.add().
Run alone to print what it finds without writing anything:
    python3 tools/english_series.py
"""
import re
import sys
import urllib.parse

# (folder name, title words that mark the series or None for every full video, channel handles,
#  channel name, shortest minutes, searches in the channel)
SERIES = [
    # Checked from Actions on 2026-10-10 (probe run 38030383883): official channels, full episodes, embeddable.
    ("Dhar Mann", None, ["@DharMann"], "Dhar Mann Studios|Dhar Mann", 15, ["full episode"]),
    ("Neighbours", r"neighbours\s+episode", ["@Neighbours"], "Neighbours Official Channel|Neighbours", 15, ["episode", "full episode"]),
    ("Midsomer Murders", r"(season|series)\s*\d+\s*,?\s*(episode|ep)\s*\d", ["@midsomermurdersofficial"], "Midsomer Murders", 40,
     ["full episode", "season 1 episode", "series 1 episode"]),
    ("Studio C", None, ["channel/UCsZXuHKonP9utl5q2hFCkgA", "@StudioC"], "Studio C", 15, ["full episode"]),
    ("Brat TV", None, ["@brat"], "Brat TV|Brat", 12, ["marathon", "full series", "episode"]),
    ("Ackley Bridge", r"ackley bridge", ["@Channel4"], "Channel 4", 40, ["ackley bridge full episode", "ackley bridge episode"]),
]
# Longer than this is several episodes in one video (a "marathon" of a whole season).
LONGEST_MINUTES = 200

SEASON_EPISODE = re.compile(r"\bS(?:eason|eries)?\s*(\d{1,2})\s*[,:\-|]?\s*E(?:p(?:isode)?\.?)?\s*(\d{1,3})\b", re.I)
EPISODE_ONLY = re.compile(r"\b(?:Episode|Ep\.?)\s*(\d{1,4})\b", re.I)
# The app's own episode readers (Vod.parse): an unnumbered title they would read as an episode
# could land in a folder of its own, so such titles are left out.
APP_READS = re.compile(r"[\s._\-:|](?:Episode\s*|Ep\.?\s*|E)\d{1,4}\b|\bS\d{1,2}[\s._\-]*E\d{1,3}\b|[\s._\-:|]\d{1,2}x\d{1,3}\b", re.I)
LEFT_OUT = re.compile(r"\b(uncensored|adult|explicit)\b|\b18\+", re.I)


JUNK = re.compile(r"\b(full episodes?|full|official|hd|4k|new|(?:watch [\w\s]+ |available )on all ?4)\b|#\S+", re.I)


def tidy(text, show, owner):
    """A title without the series' or channel's name, "Full Episode" and the like, at most 70 letters."""
    for name in sorted([show] + owner.split("|"), key=len, reverse=True):
        text = re.sub(re.escape(name), " ", text, flags=re.I)
    text = re.sub(r"\s*[|\[\](){}]\s*", " | ", JUNK.sub(" ", text))
    parts = [p.strip(" -–:,.") for p in text.split("|") if p.strip(" -–:,.")]
    text = re.sub(r"\s+", " ", " - ".join(parts[:2]))
    return (text[:67] + "...") if len(text) > 70 else text


def name_for(show, owner, title):
    """ "Show S01E03 - Title", "Show Episode 12 - Title", or the tidied title when it has no number."""
    m = SEASON_EPISODE.search(title)
    if m:
        tail = tidy(SEASON_EPISODE.sub(" ", title), show, owner)
        return f"{show} S{int(m.group(1)):02d}E{int(m.group(2)):02d}" + (f" - {tail}" if tail else "")
    m = EPISODE_ONLY.search(title)
    if m:
        tail = tidy(EPISODE_ONLY.sub(" ", title), show, owner)
        return f"{show} Episode {int(m.group(1))}" + (f" - {tail}" if tail else "")
    name = tidy(title, show, owner)
    return None if not name or APP_READS.search(" " + name) else name


def find(bd, cid, mark, searches):
    videos, seen = [], set()
    urls = [f"https://www.youtube.com/channel/{cid}/videos"] + [
        f"https://www.youtube.com/channel/{cid}/search?" + urllib.parse.urlencode({"query": q}) for q in searches]
    for url in urls:
        try:
            for v in bd.videos_page(url):
                if v[0] not in seen and (mark is None or mark.search(v[1])):
                    seen.add(v[0])
                    videos.append(v)
        except Exception as e:  # noqa: BLE001
            print(f"  {url} failed ({e})", file=sys.stderr)
    return videos


def add(kept, today, dry_run=False):
    """Adds each series' full episodes to kept (build_dramas' dict, keyed by video id)."""
    import build_dramas as bd  # here, as build_dramas calls this module
    from no_horror import is_horror
    for show, words, handles, owner, shortest, searches in SERIES:
        handle, cid = bd.channel_id(handles, owner)
        if not cid:
            print(f"{show}: channel {owner} not found", file=sys.stderr)
            continue
        new = total = 0
        for vid, title, mins in find(bd, cid, words and re.compile(words, re.I), searches):
            if bd.SKIP.search(title) or LEFT_OUT.search(title) or is_horror(title) or (mins is not None and not shortest <= mins <= LONGEST_MINUTES):
                continue
            name = name_for(show, owner, title)
            if not name:
                continue
            if vid in kept:
                kept[vid]["seen"] = today.isoformat()
            elif dry_run or bd.plays(vid):
                kept[vid] = {"item": name, "folder": show, "genre": "Series", "channel": show,
                             "language": "English", "title": title, "added": today.isoformat()}
                new += 1
            else:
                continue
            total += 1
        print(f"{show} ({owner}, {handle} {cid}): {total} episodes, {new} new")


if __name__ == "__main__":
    import datetime as dt
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    add({}, dt.date.today(), dry_run="--check" not in sys.argv)
