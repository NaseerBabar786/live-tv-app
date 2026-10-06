#!/usr/bin/env python3
"""
Builds the ready-made schedule for Bazaar Cinema, our classic-films channel (00 in Free Live TV).

Takes the public-domain films in docs/Movies.m3u (made by build_movies.py from the Internet
Archive), reads each film's length from the Archive, and writes a channel schedule in the
same shape Channel Studio saves:

  * a film every night at 8 PM Toronto time ("Raat Ki Film"), a different one each night
    of the week, changing every week;
  * all the other films back to back round the clock in between, in a new order each week.

The app and tv.bulkbazaar.ca/channel/?c=filmein play this file until the owner saves the channel
in Channel Studio (tv.bulkbazaar.ca/studio).

Writes docs/channel/filmein-schedule.json. Standard library only.
Run: python3 tools/build_filmein.py [--date YYYY-MM-DD]
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import json
import os
import random
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
METADATA = "https://archive.org/metadata/"
USER_AGENT = "LiveTV-playlist-builder/1.0 (+https://tv.bulkbazaar.ca)"
# Shorter items are cartoons or trailers, not a film for the evening.
MIN_SECONDS = 45 * 60
NIGHT = "20:00"
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
SOUTH_ASIAN = {"Hindi", "Urdu", "Punjabi"}
RIP = re.compile(r"www\.|\.com|@|\bCD ?\d\b|xclusive|dvdrip|x264", re.I)

TICKER = ("Bazaar Cinema · Classic films, free, day and night · Raat Ki Film: a film every night at 8 PM (Toronto) "
          "· Channel 00 on Free Live TV · Advertise with us: WhatsApp 437 602 6500 · tv.bulkbazaar.ca")


def films_in_playlist(path):
    """[(title, url, language, poster)] for the films in Movies.m3u."""
    out, info = [], None
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("#EXTINF"):
                info = line
            elif line and not line.startswith("#") and info:
                if 'tvg-genre="Movies"' in info:
                    lang = re.search(r'tvg-language="([^"]*)"', info)
                    logo = re.search(r'tvg-logo="([^"]*)"', info)
                    out.append((tidy(info.rsplit(",", 1)[1].strip()), line, lang.group(1) if lang else "English",
                                logo.group(1) if logo else None))
                info = None
    return out


def tidy(title):
    """Archive titles lose their commas in the playlist: "Amazing Mr. X   The (1948)", "It's A Joke  Son"."""
    m = re.match(r"^(.*?)\s{2,}(The|A|An)(\s*\(\d{4}\))?$", title)
    if m:
        return f"{m.group(2)} {m.group(1)}{m.group(3) or ''}"
    return re.sub(r"\s{2,}", ", ", title).strip()


def get_json(url, tries=4, timeout=60):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except Exception:  # noqa: BLE001 - the Archive is busy now and then
            if i == tries - 1:
                raise
            time.sleep(3 * (i + 1))


def seconds(length):
    """File length from Archive metadata: "5412.3" or "01:30:12"."""
    try:
        if ":" in str(length):
            total = 0.0
            for part in str(length).split(":"):
                total = total * 60 + float(part)
            return total
        return float(length)
    except (TypeError, ValueError):
        return 0.0


# The Archive's own H.264 copies. An uploader's original ".mp4" is often older MPEG-4 video
# (DivX/Xvid), which Android plays but Chrome, Edge and Safari can't: the web page then plays
# the sound over a black picture. So the page and the app both get an H.264 copy when there is one.
H264 = ("h.264", "h.264 ia", "h.264 hd", "512kb mpeg4")


def playable(url):
    """(length in whole seconds, url of a copy browsers can play) for an Archive file; (0, url) when unknown."""
    m = re.match(r"https://archive\.org/download/([^/]+)/(.+)$", url)
    if not m:
        return 0, url
    ident, name = m.group(1), urllib.parse.unquote(m.group(2))
    try:
        meta = get_json(METADATA + urllib.parse.quote(ident))
    except Exception as e:  # noqa: BLE001 - one bad item shouldn't stop the build
        print(f"  skip {ident}: {e}", file=sys.stderr)
        return 0, url
    files = meta.get("files", [])
    this = next((f for f in files if f.get("name") == name), None)
    if not this:
        return 0, url
    secs = int(seconds(this.get("length")))
    if str(this.get("format", "")).lower() in H264:
        return secs, url
    # An H.264 copy made from this file, the full-size one first.
    copies = [f for f in files if str(f.get("format", "")).lower() in H264 and f.get("name", "").lower().endswith(".mp4")
              and (f.get("original") == name or not f.get("original"))]
    copies.sort(key=lambda f: (str(f.get("format", "")).lower() == "512kb mpeg4", f.get("original") != name))
    if copies:
        best = copies[0]
        return int(seconds(best.get("length"))) or secs, f"https://archive.org/download/{ident}/{urllib.parse.quote(best['name'])}"
    return secs, url


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="build for the week of this date (default: today)")
    args = ap.parse_args()
    today = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
    year, week, _ = today.isocalendar()

    films = films_in_playlist(os.path.join(ROOT, "docs", "Movies.m3u"))
    with cf.ThreadPoolExecutor(8) as pool:
        found = list(pool.map(playable, [f[1] for f in films]))

    videos, ids = [], set()
    for (title, _, lang, _), (secs, url) in zip(films, found):
        # The Hindi, Urdu and Punjabi films in the list are people's uploads of films still under
        # copyright in India and Pakistan (some carry a piracy site's name), so a channel that
        # broadcasts them could be taken down. Only the Archive's public-domain classics play.
        if secs < MIN_SECONDS or lang in SOUTH_ASIAN or RIP.search(title):
            continue
        vid = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40] or "film"
        while vid in ids:
            vid += "-2"
        ids.add(vid)
        videos.append({"id": vid, "title": title, "url": url, "secs": secs, "kind": "programme", "lang": lang})
    swapped = sum(url != f[1] for f, (_, url) in zip(films, found))
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::notice title=Bazaar Cinema::{swapped} of {len(films)} films now play the Archive's H.264 copy")
    print(f"{len(videos)} of {len(films)} films have a known length of at least {MIN_SECONDS // 60} minutes")
    if len(videos) < 10:
        sys.exit("Too few films; keeping the old schedule.")

    # The films take turns in the evening, a new seven every week.
    # (Proper films only: a title with its year, not a file name like "German_SniperTraining".)
    proper = [v for v in videos if re.search(r"\(\d{4}\)$", v["title"]) and "_" not in v["title"]] or videos
    start = (week * len(DAYS)) % len(proper)
    tonight = (proper[start:] + proper[:start])[:len(DAYS)]
    slots = [{"day": day, "time": NIGHT, "video": v["id"]} for day, v in zip(DAYS, tonight)]
    for v in tonight:
        v["title"] = "Raat Ki Film: " + v["title"]

    # The rest play round the clock, shuffled differently each week.
    loop = [v["id"] for v in videos if v not in tonight]
    random.Random(year * 100 + week).shuffle(loop)
    for v in videos:
        v.pop("lang")

    schedule = {
        "name": "Bazaar Cinema",
        "logo": "https://tv.bulkbazaar.ca/channel/logos/bazaar-cinema.png",
        "logoCorner": "tr",
        "active": True,
        "tz": "America/Toronto",
        "ticker": TICKER,
        "tickerOn": True,
        "videos": videos,
        "slots": slots,
        "loop": loop,
        "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    out = os.path.join(ROOT, "docs", "channel", "filmein-schedule.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(schedule, f, ensure_ascii=False, indent=1)
        f.write("\n")
    hours = sum(v["secs"] for v in videos) / 3600
    print(f"Wrote docs/channel/filmein-schedule.json: {len(videos)} films, {hours:.0f} hours")
    for s, v in zip(slots, tonight):
        print(f"  {s['day']} {NIGHT}  {v['title']}")


if __name__ == "__main__":
    main()
