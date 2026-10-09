#!/usr/bin/env python3
"""Spark TV's schedules: docs/channel/play/<id>.json, read by the Google Play app (SparkSync.kt).

Spark TV on Google Play carries only channels whose every programme we own or may show (the owner,
2026-10-09): our news bulletins and ads, public-domain films and shows from the Internet Archive, and
free-licence music from Wikimedia Commons. They are made here from our other channels' schedules:

  pnews      Spark TV News           the hourly bulletins from channel 1's schedule, round the clock
  pclassics  Spark Classics          Spark Cinema's public-domain films (filmein-schedule.json)
  purdu      Spark Cinema Urdu       our Urdu AI dubs of free films and our Urdu story videos (library.json)
  phindi     Spark Cinema Hindi      our Hindi AI dubs of the same films (library.json)
  pshayari   Spark Shayari           our "Aaj ka Sher" clips of the classic poets (shayari-clips.json)
  psports    Spark Sports Classics   sports-schedule.json
  ptravel    Spark Travel Classics   travel-schedule.json
  pcomedy    Spark Comedy Classics   comedy-schedule.json
  pauto      Spark Auto Classics     auto-schedule.json (public-domain car films)
  pcooking   Spark Kitchen Classics  cooking-schedule.json (public-domain cooking films)
  pmusic     Spark Music             sur-schedule.json (Wikimedia Commons recordings)
  pads       Spark Ads               our "advertise here" ad and the sponsors' ads (ads-sponsors.json)

The owner (2026-10-09): every Spark TV channel works like channel 1, with only programmes that are ours to
show. A channel whose source schedule isn't built yet is left out until it is (the app then hides it).

Every YouTube video is left out, so is anything only allowed on the website (Cable TV promos, which
point to an app outside Google Play), and nothing may link to a list the app would fill from YouTube.
A short ad break of ours follows every programme. Fails (exit 1) when a schedule would carry a YouTube
link or come out empty. Run after the schedules it reads change (build-play-schedules.yml).
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from no_horror import is_horror  # noqa: E402  (no horror on our channels, the owner 2026-10-08)

ROOT = Path(__file__).resolve().parent.parent
CH = ROOT / "docs" / "channel"
OUT = CH / "play"
LOGOS = "https://tv.bulkbazaar.ca/channel/logos/"
TZ = "America/Toronto"
ADVERTISE = "Advertise on Spark TV: WhatsApp 437 602 6500"

YOUTUBE = re.compile(r"youtu\.?be|youtube(-nocookie)?\.com", re.I)

# Our own short clips, from channel 1's schedule: the moving Spark logo and "advertise here".
IDENT = {"id": "spark-ident", "title": "Spark TV", "url": "https://tv.bulkbazaar.ca/media/spark-ident.mp4",
         "secs": 20, "kind": "ident"}
ADHERE = {"id": "adhere", "title": "Advertise on Spark TV",
          "url": "https://tv.bulkbazaar.ca/channel/media/ad-advertise-here.mp4", "secs": 15, "kind": "ad"}

# The schedule each classic channel is made from, its name, logo and the line along the bottom.
CLASSICS = {
    "pclassics": ("filmein-schedule.json", "Spark Classics", "spark-cinema.png",
                  "Spark Classics · Classic films, free, day and night · A film every night at 8 PM (Toronto)"),
    "pcomedy": ("comedy-schedule.json", "Spark Comedy Classics", "spark-comedy-play.png",
                "Spark Comedy Classics · Classic comedy films and TV shows, day and night"),
    "psports": ("sports-schedule.json", "Spark Sports Classics", "spark-sports.png",
                "Spark Sports Classics · Great moments and classic sports films"),
    "ptravel": ("travel-schedule.json", "Spark Travel Classics", "spark-travel.png",
                "Spark Travel Classics · Classic travel films from around the world"),
    "pmusic": ("sur-schedule.json", "Spark Music", "spark-music-play.png",
               "Spark Music · Free-licence recordings from Wikimedia Commons · Artist and licence on screen"),
    "pauto": ("auto-schedule.json", "Spark Auto Classics", "spark-auto.png",
              "Spark Auto Classics · Classic car films: how cars are made, driven and raced"),
    "pcooking": ("cooking-schedule.json", "Spark Kitchen Classics", "spark-cooking-play.png",
                 "Spark Kitchen Classics · Classic cooking films: recipes, baking and kitchens"),
}

# Our own dubs and stories (docs/channel/library.json): the Urdu and Hindi cinemas.
DUBS = {
    "purdu": ("Urdu AI dub", "Spark Cinema Urdu", "spark-cinema-urdu.png",
              "Spark Cinema Urdu · Films in Urdu, dubbed by our AI voices · Stories made by us"),
    "phindi": ("Hindi AI dub", "Spark Cinema Hindi", "spark-cinema-hindi.png",
               "Spark Cinema Hindi · Films in Hindi, dubbed by our AI voices"),
}

CREDITS = {
    "pclassics": "Films: public-domain classics from the Internet Archive (archive.org).",
    "pcomedy": "Comedy: public-domain films and TV shows from the Internet Archive (archive.org).",
    "psports": "Sports: public-domain films from the Internet Archive (archive.org).",
    "ptravel": "Travel: public-domain films from the Internet Archive (archive.org).",
    "pmusic": "Music: CC0, CC BY and public-domain recordings from Wikimedia Commons; artist and licence on screen.",
    "pauto": "Cars: public-domain films from the Internet Archive (archive.org).",
    "pcooking": "Cooking: public-domain films from the Internet Archive (archive.org).",
    "purdu": "Films: Blender Foundation (CC BY) and public-domain films, dubbed into Urdu by our AI voices; credits on screen. Stories: made by us.",
    "phindi": "Films: Blender Foundation (CC BY) and public-domain films, dubbed into Hindi by our AI voices; credits on screen.",
    "pshayari": "Poetry: couplets of the classic Urdu poets (public domain), read by our AI voice over our own pictures.",
    "pnews": "News: our own bulletins from the news services named on screen, read by AI voices.",
    "pads": "Our own ads and our sponsors' ads.",
}


def load(name):
    return json.loads((CH / name).read_text(encoding="utf-8"))


def ok(v):
    return bool(v.get("url")) and not YOUTUBE.search(v["url"]) and v.get("kind") not in ("trailers", "music", "list", "ads")


def channel(pid, name, logo, ticker, videos, loop, slots=(), fillers=("adhere", "spark-ident"), corner="tr"):
    return {
        "name": name, "logo": LOGOS + logo, "logoCorner": corner, "active": True, "tz": TZ,
        "ticker": f"{ticker} · {ADVERTISE}", "tickerOn": True,
        "credits": CREDITS[pid], "videos": videos, "slots": list(slots), "loop": loop, "fillers": list(fillers),
    }


def with_breaks(ids):
    """[ids] with our 15-second "advertise here" after every programme and the Spark logo every fifth."""
    out = []
    for i, vid in enumerate(ids):
        out.append(vid)
        out.append("adhere")
        if i % 5 == 4:
            out.append("spark-ident")
    return out


def classic(pid):
    src, name, logo, ticker = CLASSICS[pid]
    if not (CH / src).exists():
        return None
    o = load(src)
    videos = [v for v in o.get("videos", []) if ok(v)]
    have = {v["id"] for v in videos}
    loop = [i for i in o.get("loop", []) if i in have]
    slots = [s for s in o.get("slots", []) if s.get("video") in have and all(e in have for e in s.get("episodes", []))]
    return channel(pid, name, logo, ticker, videos + [ADHERE, IDENT], with_breaks(loop), slots)


def slug(url):
    return re.sub(r"[^a-z0-9]+", "-", url.rsplit("/", 1)[-1].rsplit(".", 1)[0].lower()).strip("-")


def ours(url):
    """Our own files: the channel-media release or our website."""
    return url.startswith(("https://github.com/NaseerBabar786/live-tv-app/releases/download/", "https://tv.bulkbazaar.ca/"))


def dubbed(pid):
    tag, name, logo, ticker = DUBS[pid]
    lib = load("library.json")
    films = [x for x in lib if tag in x.get("title", "") and ours(x.get("url", "")) and x.get("secs") and not is_horror(x["title"])]
    # Our Urdu stories go on the Urdu cinema between the films.
    if pid == "purdu":
        films += [x for x in lib if x.get("cat", "").startswith("Our stories") and ours(x.get("url", "")) and x.get("secs")]
    videos = [{"id": slug(x["url"]), "title": x["title"].replace(f" ({tag})", ""), "url": x["url"], "secs": round(x["secs"]),
               "kind": "programme"} for x in films]
    return channel(pid, name, logo, ticker, videos + [ADHERE, IDENT], with_breaks([v["id"] for v in videos]))


def shayari():
    clips = [c for c in load("shayari-clips.json").get("clips", []) if ours(c.get("src", "")) and c.get("secs")]
    videos = [{"id": f"sher-{c['n']:02d}", "title": c.get("title") or "Aaj ka Sher", "url": c["src"], "secs": round(c["secs"]),
               "kind": "programme"} for c in clips]
    # A short ad of ours after every five couplets, the Spark logo after every fifteen.
    loop = []
    for i, v in enumerate(videos):
        loop.append(v["id"])
        if i % 5 == 4:
            loop.append("adhere")
        if i % 15 == 14:
            loop.append("spark-ident")
    return channel("pshayari", "Spark Shayari", "spark-shayari.png",
                   "Spark Shayari · Couplets of Ghalib, Mir, Iqbal and the classic poets, day and night",
                   videos + [ADHERE, IDENT], loop)


def news():
    o = load("test-schedule.json")
    by = {v["id"]: v for v in o.get("videos", [])}
    head, full = by["news-headlines"], by["news-full"]
    for v in (head, full):
        if not ok(v):
            sys.exit(f"news bulletin {v['id']} is not our own file: {v['url']}")
    # Headlines and the full report in turn, our ads between them: about 20 minutes, round the clock.
    loop = ["spark-ident", "news-headlines", "adhere", "news-full", "adhere"]
    return channel("pnews", "Spark TV News", "spark-news.png",
                   "Spark TV News · Headlines and the full report, round the clock", [head, full, ADHERE, IDENT], loop)


def ads():
    sponsors = load("ads-sponsors.json").get("ads", [])
    videos, loop = [IDENT, ADHERE], ["spark-ident", "adhere"]
    for j, a in enumerate(sponsors):
        url, secs = a.get("src", ""), round(float(a.get("secs") or 0))
        if not url.startswith("https://") or YOUTUBE.search(url) or not 5 <= secs <= 60:
            continue
        videos.append({"id": f"sponsor-{j}", "title": a.get("title") or "Ad", "url": url, "secs": secs, "kind": "ad"})
        loop.append(f"sponsor-{j}")
    # Our logo top left: the Spark ident carries its own logo top right (logo placement rule).
    return channel("pads", "Spark Ads", "spark-ads.png", "Spark Ads · Our sponsors' ads round the clock", videos, loop, corner="tl")


def check(pid, o):
    bad = [v["url"] for v in o["videos"] if not ok(v)]
    if bad:
        sys.exit(f"{pid}: not allowed on Google Play: {bad[:3]}")
    ids = {v["id"] for v in o["videos"]}
    if not o["loop"] or any(i not in ids for i in o["loop"]):
        sys.exit(f"{pid}: empty loop or a loop entry without a video")


def main():
    OUT.mkdir(exist_ok=True)
    built = {"pnews": news(), "pads": ads(), "pshayari": shayari(), **{pid: dubbed(pid) for pid in DUBS},
             **{pid: classic(pid) for pid in CLASSICS}}
    for pid, o in built.items():
        if o is None:
            print(f"{pid}: its source schedule isn't built yet; left out")
            continue
        check(pid, o)
        (OUT / f"{pid}.json").write_text(json.dumps(o, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        hours = sum(v.get("secs", 0) for v in o["videos"] if v.get("kind") != "ad") / 3600
        print(f"{pid}: {o['name']}, {len(o['videos'])} videos, {hours:.0f} h, {len(o['slots'])} slots")


if __name__ == "__main__":
    main()
