#!/usr/bin/env python3
"""
Builds the ready-made schedule for Bazaar Sports, our sports channel (000000 in Free Live TV).

Source: the Internet Archive. Only sports films whose item states a public-domain mark, CC0 or
plain CC BY licence are taken (no "share-alike", "non-commercial" or "no-derivatives"): old
newsreels, instructional films and classic matches whose copyright has run out. Today's
leagues and tournaments (cricket, football, the Olympics) are copyrighted and never play here.

Writes docs/channel/sports-schedule.json, the same shape Channel Studio saves: all the films
back to back round the clock, in a new order every week. Standard library only.
Run: python3 tools/build_sports.py [--date YYYY-MM-DD]
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
USER_AGENT = "LiveTV-playlist-builder/1.0 (+https://tv.bulkbazaar.ca)"
SEARCH = "https://archive.org/advancedsearch.php?"
METADATA = "https://archive.org/metadata/"
OUT = os.path.join(ROOT, "docs", "channel", "sports-schedule.json")
MIN_SECS, MAX_SECS = 2 * 60, 75 * 60

SPORTS = ["sports", "sport", "boxing", "baseball", "football", "soccer", "cricket", "hockey", "tennis", "golf",
          "basketball", "wrestling", "athletics", "track and field", "olympics", "skiing", "swimming", "racing",
          "auto racing", "horse racing", "cycling", "rowing", "polo", "squash", "badminton", "kabaddi", "field hockey"]
# Licences that let anyone show the film: public domain, CC0 and CC BY (not -SA, -NC or -ND).
FREE = re.compile(r"publicdomain|/licenses/by/\d", re.I)
# Not for a family sports channel, or not really sport.
SKIP = re.compile(r"\b(bullfight|cockfight|hunting|trailer|promo|commercial|ad\b|advert|nazi|propaganda|"
                  r"podcast|lecture|interview|talk show|radio|slideshow|video game|gameplay|fifa \d|pes \d|nba 2k|"
                  r"highlights 20\d\d|vs\.? .* 20[12]\d)\b", re.I)

TICKER = ("Bazaar Sports · Classic sport from the film archives, day and night · Boxing, cricket, football, "
          "athletics and more · Channel 000000 on Free Live TV · Advertise with us: WhatsApp 437 602 6500")
CREDITS = "Films: public-domain and CC BY sports films from the Internet Archive."


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


def candidates():
    """Archive items tagged with a sport and a free licence, most watched first."""
    subjects = " OR ".join(f'subject:"{s}"' for s in SPORTS)
    q = (f"mediatype:movies AND ({subjects}) AND "
         "(licenseurl:*publicdomain* OR licenseurl:*licenses/by/*)")
    url = SEARCH + urllib.parse.urlencode({"q": q, "fl[]": ["identifier", "title", "licenseurl"], "rows": 400,
                                           "output": "json", "sort[]": "downloads desc"}, doseq=True)
    docs = get_json(url).get("response", {}).get("docs", [])
    return [d for d in docs if FREE.search(str(d.get("licenseurl", ""))) and not SKIP.search(str(d.get("title", "")))]


def best_file(ident):
    """(title, url, secs) of the item's best MP4, or None."""
    try:
        meta = get_json(METADATA + urllib.parse.quote(ident))
    except Exception as e:  # noqa: BLE001 - one bad item shouldn't stop the build
        print(f"  skip {ident}: {e}", file=sys.stderr)
        return None
    md = meta.get("metadata", {})
    if not FREE.search(str(md.get("licenseurl", ""))):
        return None
    mp4s = [f for f in meta.get("files", []) if f.get("name", "").lower().endswith(".mp4")]
    # The Archive's own h.264 copy plays everywhere; prefer it, then the smallest other MP4.
    mp4s.sort(key=lambda f: (f.get("format") != "h.264", "512kb" not in f["name"], int(f.get("size", 0) or 0)))
    for f in mp4s:
        secs = int(seconds(f.get("length")))
        if MIN_SECS <= secs <= MAX_SECS:
            title = md.get("title") or ident
            if isinstance(title, list):
                title = title[0]
            return re.sub(r"\s+", " ", str(title)).strip(), \
                f"https://archive.org/download/{ident}/{urllib.parse.quote(f['name'])}", secs
    return None


def notice(kind, text):
    """A GitHub Actions annotation, which shows on the run's page (and through the API) without its log."""
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::{kind} title=Bazaar Sports::" + text.replace("%", "%25").replace("\r", "").replace("\n", "%0A"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="build for the week of this date (default: today)")
    args = ap.parse_args()
    today = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
    year, week, _ = today.isocalendar()

    try:
        found = candidates()
    except Exception as e:  # noqa: BLE001 - say why in the run's annotations
        notice("error", f"Archive search failed: {e}")
        raise
    print(f"{len(found)} free-licence sports items on the Archive")
    with cf.ThreadPoolExecutor(8) as pool:
        files = list(pool.map(best_file, [d["identifier"] for d in found]))

    videos, ids, titles = [], set(), set()
    for d, f in zip(found, files):
        if not f or SKIP.search(f[0]) or f[0].lower() in titles:
            continue
        titles.add(f[0].lower())
        vid = re.sub(r"[^a-z0-9]+", "-", f[0].lower()).strip("-")[:40] or "sport"
        while vid in ids:
            vid += "-2"
        ids.add(vid)
        videos.append({"id": vid, "title": f[0], "url": f[1], "secs": f[2], "kind": "programme"})
        print(f"  {f[2] // 60:3d} min  {f[0]}  [{d.get('licenseurl')}]  {d['identifier']}")
    listing = "\n".join(f"{v['secs'] // 60} min  {v['title']}  {v['url']}" for v in videos)
    notice("notice", f"{len(found)} items found, {len(videos)} usable:\n{listing}"[:60000])
    if len(videos) < 10:
        notice("error", f"Too few sports films ({len(videos)}); keeping the old schedule.")
        sys.exit("Too few sports films; keeping the old schedule.")

    loop = [v["id"] for v in videos]
    random.Random(year * 100 + week).shuffle(loop)
    schedule = {
        "name": "Bazaar Sports",
        "logo": "https://tv.bulkbazaar.ca/channel/logos/bazaar-sports.png",
        "logoCorner": "tr",
        "active": True,
        "tz": "America/Toronto",
        "ticker": TICKER,
        "tickerOn": True,
        "videos": videos,
        "slots": [],
        "loop": loop,
        "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(schedule, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"Wrote docs/channel/sports-schedule.json: {len(videos)} films, {sum(v['secs'] for v in videos) / 3600:.0f} hours")


if __name__ == "__main__":
    main()
