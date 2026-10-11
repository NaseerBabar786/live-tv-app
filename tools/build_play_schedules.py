#!/usr/bin/env python3
"""Spark TV's schedules: docs/channel/play/<id>.json, read by the Google Play app (SparkSync.kt).

Spark TV on Google Play carries only channels whose every programme we own or may show (the owner,
2026-10-09): our news bulletins and ads, public-domain films and shows from the Internet Archive, and
free-licence music from Wikimedia Commons. They are made here from our other channels' schedules:

  pone       Spark TV One            channel 1 for Google Play: channel 1's news, ad breaks and idents on the
                                     same clock, with our own Urdu/Hindi films, stories and shayari in place
                                     of its YouTube dramas, songs and trailers (the only channel on Play for now)
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
show. Spark TV launches on Play with channel 1 alone (the owner, 2026-10-09); the others are built here
and kept ready, to be added to the app one by one (MyChannel.PLAY_READY). A channel whose source schedule isn't built yet is left out until it is (the app then hides it).

Every YouTube video is left out, so is anything only allowed on the website (NextGen Cable promos, which
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

YOUTUBE = re.compile(r"youtu\.?be|youtube(-nocookie)?\.com", re.I)

# Spark TV One launches without news (2026-10-09): our bulletins translate other publishers' stories, whose
# terms don't allow an app with ads. Back on once the news is made from sources free to reuse.
WITH_NEWS = False

# Our own short clip from channel 1's schedule: "advertise here".
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
    "pone": "News: our own bulletins. Films: Blender Foundation (CC BY) and public-domain films dubbed by our AI "
            "voices. Poetry: classic Urdu poets (public domain) read by our AI voice. Stories: made by us.",
    "pshayari": "Poetry: couplets of the classic Urdu poets (public domain), read by our AI voice over our own pictures.",
    "pnews": "News: our own bulletins from the news services named on screen, read by AI voices.",
    "pads": "Our own ads and our sponsors' ads.",
}


def load(name):
    return json.loads((CH / name).read_text(encoding="utf-8"))


def ok(v):
    return bool(v.get("url")) and not YOUTUBE.search(v["url"]) and v.get("kind") not in ("trailers", "music", "list", "ads")


def channel(pid, name, logo, ticker, videos, loop, slots=(), fillers=("adhere",), corner="tr"):
    return {
        "name": name, "logo": LOGOS + logo, "logoCorner": corner, "active": True, "tz": TZ,
        "ticker": ticker, "tickerOn": True,
        "credits": CREDITS[pid], "videos": videos, "slots": list(slots), "loop": loop, "fillers": list(fillers),
    }


def with_breaks(ids):
    """[ids] with our 15-second "advertise here" after every programme. No Spark logo ident: it names channels
    (kids, sports, travel) a Play channel may not have."""
    out = []
    for vid in ids:
        out += [vid, "adhere"]
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
    return channel(pid, name, logo, ticker, videos + [ADHERE], with_breaks(loop), slots)


def slug(url):
    return re.sub(r"[^a-z0-9]+", "-", url.rsplit("/", 1)[-1].rsplit(".", 1)[0].lower()).strip("-")


def ours(url):
    """Our own files: the channel-media release or our website."""
    return url.startswith(("https://github.com/NaseerBabar786/live-tv-app/releases/download/", "https://tv.bulkbazaar.ca/"))


def urdu_titles():
    """English film title -> its Urdu name (tools/dub/films.json), for "Urdu · English" programme titles."""
    films = json.loads((ROOT / "tools" / "dub" / "films.json").read_text(encoding="utf-8"))
    return {f["title"]: f["titleUr"] for f in films.values() if f.get("titleUr")}


def both(title, ur):
    """A programme title in Urdu and English (owner 2026-10-10: all writing on Spark TV One in both)."""
    return f"{ur[title]} · {title}" if title in ur else title


def dubbed(pid):
    tag, name, logo, ticker = DUBS[pid]
    ur = urdu_titles()
    lib = load("library.json")
    films = [x for x in lib if tag in x.get("title", "") and ours(x.get("url", "")) and x.get("secs") and not is_horror(x["title"])]
    # Our Urdu stories go on the Urdu cinema between the films.
    if pid == "purdu":
        films += [x for x in lib if x.get("cat", "").startswith("Our stories") and ours(x.get("url", "")) and x.get("secs")]
    videos = [{"id": slug(x["url"]), "title": both(x["title"].replace(f" ({tag})", ""), ur), "url": x["url"], "secs": round(x["secs"]),
               "kind": "programme"} for x in films]
    return channel(pid, name, logo, ticker, videos + [ADHERE], with_breaks([v["id"] for v in videos]))


def shayari():
    clips = [c for c in load("shayari-clips.json").get("clips", []) if ours(c.get("src", "")) and c.get("secs")]
    poets = json.loads((ROOT / "tools" / "shayari" / "shers.json").read_text(encoding="utf-8"))["poets"]
    poet_ur = {p["en"]: p["ur"] for p in poets.values()}

    def title(c):  # "آج کا شعر · مرزا غالب · Today's verse · Mirza Ghalib", also for clips made before English came in
        p = c.get("poet", "")
        return f"آج کا شعر · {poet_ur[p]} · Today's verse · {p}" if p in poet_ur else c.get("title") or "Aaj ka Sher"
    videos = [{"id": f"sher-{c['n']:02d}", "title": title(c), "url": c["src"], "secs": round(c["secs"]),
               "kind": "programme"} for c in clips]
    # A short ad of ours after every five couplets, the Spark logo after every fifteen.
    loop = []
    for i, v in enumerate(videos):
        loop.append(v["id"])
        if i % 5 == 4:
            loop.append("adhere")
    return channel("pshayari", "Spark Shayari", "spark-shayari.png",
                   "Spark Shayari · Couplets of Ghalib, Mir, Iqbal and the classic poets, day and night",
                   videos + [ADHERE], loop)


def one():
    """Channel 1 for Google Play: channel 1's clock (news, ad breaks), our own programmes in between."""
    o = load("test-schedule.json")
    by = {v["id"]: v for v in o.get("videos", [])}
    # Only channel 1's clips that are right for Google Play, checked frame by frame (2026-10-09): the break and
    # "next programme" cards, our "advertise here" ad and the news. Left out: the NextGen Cable promos and the 1-minute
    # ad breaks (Gold, promo codes, "free on NextGen Cable"), the Urdu Spark ad (YouTube drama and song pictures), the
    # welcome card ("on NextGen Cable"), the Spark logo and montages (they name channels Spark TV on Play doesn't
    # have, kids among them) and the "today's programmes" segment (it lists channel 1's YouTube dramas).
    keep = ["break", "next", "adhere"] + ([i for i in by if i.startswith("news-")] if WITH_NEWS else [])
    videos = [by[i] for i in keep if i in by and ok(by[i])]
    have = {v["id"] for v in videos}
    # Channel 1's ad slots carry our "advertise here" ad instead; the second 1-minute break of the hour goes.
    swap = {"promo": "adhere", "promo2": "adhere", "ad9": "adhere", "adbreak": "adhere"}
    slots = []
    for sl in o.get("slots", []):
        vid = swap.get(sl.get("video"), sl.get("video"))
        if vid in have:
            slots.append({**sl, "video": vid})
    # Between the news: our Urdu films and stories, shayari, then the Hindi films, each brought in by "next".
    urdu, hindi, sher = dubbed("purdu"), dubbed("phindi"), shayari()
    progs = [v for v in urdu["videos"] + hindi["videos"] if v.get("kind") == "programme"]
    shers = [v for v in sher["videos"] if v.get("kind") == "programme"]
    videos += progs + shers
    loop = []
    for k, v in enumerate(progs):
        loop += ["next", v["id"], "break", "adhere"]
        # Three couplets after every film.
        loop += [shers[(3 * k + j) % len(shers)]["id"] for j in range(3)] if shers else []
    ticker = ("Spark TV · Films in Urdu and Hindi, stories and shayari of the classic poets"
              if not WITH_NEWS else "Spark TV · Full news at 12, 4 and 8, headlines every hour · Films in Urdu and "
              "Hindi, stories and shayari of the classic poets")
    o = channel("pone", "Spark TV One", "spark-one.png", ticker, videos, loop, slots,
                   fillers=("adhere", "next", "break"))
    if not WITH_NEWS:
        o["credits"] = o["credits"].replace("News: our own bulletins. ", "")
    # Channel 1 writes everything in Urdu and English (owner 2026-10-09, again for Spark One 2026-10-10).
    o["ticker"] += " · " + ("اسپارک ٹی وی: اردو اور ہندی میں فلمیں، کہانیاں اور کلاسیکی شاعروں کی شاعری")
    o["credits"] += (" فلمیں: بلینڈر فاؤنڈیشن (CC BY) اور پبلک ڈومین فلمیں، ہماری اے آئی آوازوں میں۔"
                     " شاعری: کلاسیکی اردو شاعر (پبلک ڈومین)، ہماری اے آئی آواز میں۔ کہانیاں: ہماری اپنی۔")
    return o


def news():
    o = load("test-schedule.json")
    by = {v["id"]: v for v in o.get("videos", [])}
    head, full = by["news-headlines"], by["news-full"]
    for v in (head, full):
        if not ok(v):
            sys.exit(f"news bulletin {v['id']} is not our own file: {v['url']}")
    # Headlines and the full report in turn, our ads between them: about 20 minutes, round the clock.
    loop = ["news-headlines", "adhere", "news-full", "adhere"]
    return channel("pnews", "Spark TV News", "spark-news.png",
                   "Spark TV News · Headlines and the full report, round the clock", [head, full, ADHERE], loop)


def ads():
    sponsors = load("ads-sponsors.json").get("ads", [])
    videos, loop = [ADHERE], ["adhere"]
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
    built = {"pone": one(), "pnews": news(), "pads": ads(), "pshayari": shayari(), **{pid: dubbed(pid) for pid in DUBS},
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
