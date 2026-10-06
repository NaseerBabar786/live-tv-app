#!/usr/bin/env python3
"""
Builds the ready-made schedules of our Internet Archive channels in Cable TV:

  * Bazaar Sports (6): classic sport, boxing, baseball, roller derby, sport films;
  * Bazaar Travel (7): travelogues and scenic films of countries, cities and parks;
  * Bazaar Comedy (8): silent and classic comedy shorts, films and early TV comedies.

Only films from the Archive's curated collections whose item states a public-domain mark, CC0
or plain CC BY licence are taken (no "share-alike", "non-commercial" or "no-derivatives"), and
only from 1970 or before. Today's leagues, tournaments and TV travel shows are copyrighted and
never play here.

Writes docs/channel/<id>-schedule.json, the same shape Channel Studio saves: all the films back
to back round the clock, in a new order every week. Standard library only.
Run: python3 tools/build_archive_channels.py --channel sports|travel|comedy [--date YYYY-MM-DD]
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
MIN_SECS, MAX_SECS = 2 * 60, 100 * 60

# Only the Archive's curated collections: anyone can upload to the Archive and mark it public
# domain, so a claim on a private upload (a modern cartoon, a TV advert) can't be trusted.
TRUSTED = {"prelinger", "feature_films", "classic_tv", "silent_films", "universal_newsreels", "newsandpublicaffairs",
           "classic_cartoons", "comedy_films", "sports_films", "fedflix", "nasa", "ephemera"}
# Old enough that the public-domain claim is believable (US films before 1964 that weren't renewed).
LAST_YEAR = 1970
# The Archive's own H.264 copies: an original ".mp4" is often older MPEG-4 video that browsers
# show as a black picture with sound.
H264 = ("h.264", "h.264 ia", "h.264 hd", "512kb mpeg4")
# Licences that let anyone show the film: public domain, CC0 and CC BY (not -SA, -NC or -ND).
FREE = re.compile(r"publicdomain|/licenses/by/\d", re.I)
# Never on our channels.
NEVER = (r"trailer|promo|commercial|ad\b|advert|nazi|propaganda|podcast|lecture|interview|talk show|radio|"
         r"slideshow|video game|gameplay|confederacy")
TRAVEL_FILMS = r"state parks|ten thousand lakes|recreation resources|california recreation"

CHANNELS = {
    "sports": {
        "name": "Bazaar Sports", "dial": "6",
        "subjects": ["sports", "sport", "boxing", "baseball", "football", "soccer", "cricket", "hockey", "tennis",
                     "golf", "basketball", "wrestling", "athletics", "track and field", "olympics", "skiing",
                     "swimming", "racing", "auto racing", "horse racing", "cycling", "rowing", "polo", "squash",
                     "badminton", "kabaddi", "field hockey"],
        # Not for a family sports channel, or not really sport (the travel films go to Bazaar Travel).
        "skip": rf"bullfight|cockfight|hunting|fifa \d|pes \d|nba 2k|highlights 20\d\d|vs\.? .* 20[12]\d|"
                rf"ozzie and harriet|{TRAVEL_FILMS}",
        "ticker": "Bazaar Sports · Classic sport from the film archives, day and night · Boxing, cricket, football, "
                  "athletics and more · Channel 6 on Cable TV · Advertise with us: WhatsApp 437 602 6500",
    },
    "travel": {
        "name": "Bazaar Travel", "dial": "7",
        "subjects": ["travel", "travelogue", "travelogues", "tourism", "tourist", "tourists", "vacation",
                     "vacations", "sightseeing", "scenery", "national parks", "voyages and travels",
                     "description and travel", "travel films"],
        # A travel channel shows places, not war films, newsreels of disasters or adverts.
        "skip": r"war\b|army|military|navy|bomb|atomic|invasion|combat|enemy|crime|disaster|accident|newsreel|"
                r"conservation corps|civilan conservation|ccc\b|human crop|groundwater|silt|captain z-ro|fashion|"
                r"planet|spaceship|venus",
        "ticker": "Bazaar Travel · See the world, day and night · Classic travel films of countries, cities and "
                  "parks · Channel 7 on Cable TV · Advertise with us: WhatsApp 437 602 6500",
    },
    "comedy": {
        "name": "Bazaar Comedy", "dial": "8",
        "subjects": ["comedy", "comedies", "slapstick", "silent comedy", "comedy films", "sitcom", "sitcoms",
                     "comedy shorts", "humor", "laurel and hardy", "charlie chaplin", "buster keaton", "three stooges",
                     "harold lloyd", "abbott and costello"],
        # The Archive's own comedy collections, searched as a whole too.
        "collections": ["comedy_films"],
        # Family viewing: no horror comedies, no blackface minstrel routines, no adverts.
        # Family viewing: no horror or crime films, no burlesque, no cartoons with racist caricatures,
        # and no later TV shows (Steptoe and Son, Dick Van Dyke) whose free-licence claim is doubtful.
        "skip": r"minstrel|blackface|horror|horrors|zombie|zombies|murder|strip|burlesque|teaserama|stag|risque|"
                r"naughty|death|killer|crime|crooked|manhunt|creature|haunted|machine gun|baby face|scarlet clue|"
                r"rascal you|bamboo isle|c\.c\. and company|steptoe|dick van dyke|raiders|billy the kid",
        "ticker": "Bazaar Comedy · Laughs day and night · Chaplin, Laurel and Hardy, Keaton and classic TV comedies "
                  "· Channel 8 on Cable TV · Advertise with us: WhatsApp 437 602 6500",
    },
}


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


def old_enough(doc):
    """True when the item's year is known and no later than LAST_YEAR."""
    m = re.search(r"\d{4}", str(doc.get("year", "")))
    return bool(m) and int(m.group()) <= LAST_YEAR


def candidates(ch, skip):
    """Archive items tagged with one of the channel's subjects and a free licence, most watched first."""
    seen, out = set(), []
    queries = [f'subject:"{x}"' for x in ch["subjects"]] + [f"collection:{c}" for c in ch.get("collections", [])]
    for sport in queries:
        # Licence is checked here (and again on the item), not in the query: the search's
        # wildcards don't match inside licence links.
        url = SEARCH + urllib.parse.urlencode({"q": f"mediatype:movies AND {sport}",
                                               "fl[]": ["identifier", "title", "licenseurl", "collection", "year"], "rows": 300,
                                               "output": "json", "sort[]": "downloads desc"}, doseq=True)
        try:
            docs = get_json(url).get("response", {}).get("docs", [])
        except Exception as e:  # noqa: BLE001 - one sport's search failing shouldn't stop the rest
            print(f"  search {sport}: {e}", file=sys.stderr)
            continue
        free = [d for d in docs if FREE.search(str(d.get("licenseurl", ""))) and not skip.search(str(d.get("title", "")))
                and TRUSTED & set(d.get("collection") or []) and old_enough(d)]
        print(f"  {sport}: {len(docs)} items, {len(free)} free")
        for d in free:
            if d["identifier"] not in seen:
                seen.add(d["identifier"])
                out.append(d)
    return out


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
    # An H.264 copy plays everywhere; prefer the full-size one.
    mp4s.sort(key=lambda f: (str(f.get("format", "")).lower() not in H264, "512kb" in f["name"].lower(), int(f.get("size", 0) or 0)))
    for f in mp4s:
        secs = int(seconds(f.get("length")))
        if MIN_SECS <= secs <= MAX_SECS:
            title = md.get("title") or ident
            if isinstance(title, list):
                title = title[0]
            return re.sub(r"\s+", " ", str(title)).strip(), \
                f"https://archive.org/download/{ident}/{urllib.parse.quote(f['name'])}", secs
    return None


TITLE = "Bazaar channels"


def notice(kind, text):
    """A GitHub Actions annotation, which shows on the run's page (and through the API) without its log."""
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::{kind} title={TITLE}::" + text.replace("%", "%25").replace("\r", "").replace("\n", "%0A"))


def fix(path):
    """Points [path]'s Archive videos at H.264 copies, which browsers can show (see build_filmein.playable)."""
    from build_filmein import playable
    with open(path, encoding="utf-8") as fh:
        schedule = json.load(fh)
    changed = 0
    for v in schedule.get("videos", []):
        secs, url = playable(v["url"])
        if url != v["url"]:
            print(f"  {v['title']}: {v['url']} -> {url}")
            v["url"], changed = url, changed + 1
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(schedule, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    notice("notice", f"{path}: {changed} videos now point at H.264 copies")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", choices=sorted(CHANNELS))
    ap.add_argument("--date", help="build for the week of this date (default: today)")
    ap.add_argument("--fix", metavar="SCHEDULE", help="only swap the Archive videos in this schedule for H.264 copies")
    args = ap.parse_args()
    if args.fix:
        return fix(args.fix)
    if not args.channel:
        ap.error("--channel or --fix is needed")
    global TITLE
    ch = CHANNELS[args.channel]
    TITLE = ch["name"]
    skip = re.compile(rf"\b({NEVER}|{ch['skip']})\b", re.I)
    out = os.path.join(ROOT, "docs", "channel", f"{args.channel}-schedule.json")
    today = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
    year, week, _ = today.isocalendar()

    try:
        found = candidates(ch, skip)
    except Exception as e:  # noqa: BLE001 - say why in the run's annotations
        notice("error", f"Archive search failed: {e}")
        raise
    print(f"{len(found)} free-licence items on the Archive for {ch['name']}")
    with cf.ThreadPoolExecutor(8) as pool:
        files = list(pool.map(best_file, [d["identifier"] for d in found]))

    videos, ids, titles = [], set(), set()
    for d, f in zip(found, files):
        if not f or skip.search(f[0]) or f[0].lower() in titles:
            continue
        titles.add(f[0].lower())
        vid = re.sub(r"[^a-z0-9]+", "-", f[0].lower()).strip("-")[:40] or args.channel
        while vid in ids:
            vid += "-2"
        ids.add(vid)
        videos.append({"id": vid, "title": f[0], "url": f[1], "secs": f[2], "kind": "programme"})
        print(f"  {f[2] // 60:3d} min  {f[0]}  [{d.get('licenseurl')}]  {d['identifier']}")
    notice("notice", f"{len(found)} items found, {len(videos)} usable")
    lines = [f"{v['secs'] // 60}m {v['title']}" for v in videos]
    for k in range(0, min(len(lines), 240), 30):  # annotations are cut at about 4 KB each
        notice("notice", "\n".join(lines[k:k + 30]))
    if len(videos) < 10:
        notice("error", f"Too few films ({len(videos)}); keeping the old schedule.")
        sys.exit("Too few films; keeping the old schedule.")

    loop = [v["id"] for v in videos]
    random.Random(year * 100 + week).shuffle(loop)
    schedule = {
        "name": ch["name"],
        "logo": f"https://tv.bulkbazaar.ca/channel/logos/bazaar-{args.channel}.png",
        "logoCorner": "tr",
        "active": True,
        "tz": "America/Toronto",
        "ticker": ch["ticker"],
        "tickerOn": True,
        "videos": videos,
        "slots": [],
        "loop": loop,
        "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(schedule, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"Wrote {os.path.relpath(out, ROOT)}: {len(videos)} films, {sum(v['secs'] for v in videos) / 3600:.0f} hours")


if __name__ == "__main__":
    main()
