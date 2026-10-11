#!/usr/bin/env python3
"""
Builds Spark Music, our music channel (channel 3 in NextGen Cable), from music that is free to use.

Source: Wikimedia Commons, where every file states its licence. Only public domain, CC0 and
CC BY recordings are taken (no "share-alike", "non-commercial" or "no-derivatives"), and
never film songs: Bollywood and other film music is copyrighted. Hindustani classical,
qawwali, ghazal and other South Asian recordings come first, then classical music.

For each song it makes a 720p MP4: a card with the song's name, the artist and the licence
(so the credit CC BY asks for is on screen while it plays) over the song, loudness-evened.
The MP4s go on the "sur-media" GitHub pre-release; the schedule (all songs back to back,
round the clock) goes to docs/channel/sur-schedule.json, the same shape Channel Studio saves.

Needs ffmpeg and Pillow. Run: python3 tools/build_sur.py --out DIR [--limit N]
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "LiveTV-SurTV-builder/1.0 (https://tv.bulkbazaar.ca; naseerahmadbabar@gmail.com)"
MEDIA = "https://github.com/NaseerBabar786/live-tv-app/releases/download/sur-media/"
SCHEDULE = os.path.join(ROOT, "docs", "channel", "sur-schedule.json")

# South Asian music first; a category that doesn't exist simply gives nothing.
DESI = [
    "Hindustani classical music", "Audio files of Hindustani classical music", "Carnatic music",
    "Audio files of Carnatic music", "Qawwali", "Ghazal", "Ghazals", "Sufi music", "Music of Pakistan",
    "Audio files of music of Pakistan", "Music of India", "Audio files of music of India",
    "Sitar music", "Sarod music", "Bansuri", "Shehnai", "Tabla", "Santoor", "Ragas", "Bhajans", "Naat",
]
CLASSICAL = [
    "Musopen", "Audio files of Frédéric Chopin's works", "Audio files of Ludwig van Beethoven's works",
    "Audio files of Wolfgang Amadeus Mozart's works", "Audio files of Johann Sebastian Bach's works",
    "Audio files of Antonio Vivaldi's works", "Audio files of Erik Satie's works",
    "Audio files of Claude Debussy's works", "Audio files of Pyotr Ilyich Tchaikovsky's works",
]
MIN_SECS, MAX_SECS = 90, 15 * 60
FILM = re.compile(r"\b(film|movie|bollywood|lollywood|soundtrack|ost)\b", re.I)


def api(**params):
    params.update(format="json", formatversion="2")
    url = API + "?" + urllib.parse.urlencode(params)
    for i in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:  # noqa: BLE001 - Commons is busy now and then
            if i == 4:
                raise
            time.sleep(3 * (i + 1))


def files_in(category, depth=1):
    """File titles in [category] and (to [depth]) its subcategories."""
    out, cont = [], {}
    while True:
        d = api(action="query", list="categorymembers", cmtitle="Category:" + category,
                cmtype="file|subcat", cmlimit="500", **cont)
        for m in d.get("query", {}).get("categorymembers", []):
            if m["ns"] == 6:
                out.append(m["title"])
            elif m["ns"] == 14 and depth > 0:
                out += files_in(m["title"].split(":", 1)[1], depth - 1)
        if "continue" not in d:
            return out
        cont = {"cmcontinue": d["continue"]["cmcontinue"]}


def files_found(query):
    """Audio file titles a Commons search finds for [query]."""
    d = api(action="query", list="search", srsearch=f"{query} filetype:audio", srnamespace="6", srlimit="50")
    return [m["title"] for m in d.get("query", {}).get("search", [])]


# Searches add the South Asian recordings that sit outside those categories.
DESI_SEARCHES = ["qawwali", "ghazal", "raga", "raag", "sitar", "shehnai", "sarangi", "bansuri", "sarod",
                 "santoor", "tabla", "hindustani", "carnatic", "veena", "sufi kalam", "naat", "thumri", "bhajan"]


def plain(text):
    return html.unescape(re.sub(r"<[^>]+>", "", text or "")).strip()


def allowed(licence):
    """Public domain, CC0 or CC BY only."""
    l = licence.lower()
    if re.search(r"\b(sa|nc|nd)\b|gfdl|fair use", l):
        return False
    return "public domain" in l or l.startswith("pd") or "cc0" in l or re.match(r"cc[- ]by\b", l) is not None


def details(titles):
    """[{title, url, licence, artist, name}] for the usable audio files among [titles]."""
    out = []
    for i in range(0, len(titles), 50):
        d = api(action="query", titles="|".join(titles[i:i + 50]), prop="imageinfo",
                iiprop="url|mime|size|extmetadata",
                iiextmetadatafilter="LicenseShortName|Artist|ObjectName|Categories")
        for p in d.get("query", {}).get("pages", []):
            info = (p.get("imageinfo") or [{}])[0]
            if not str(info.get("mime", "")).startswith("audio/") or info.get("size", 0) > 80_000_000:
                continue
            meta = info.get("extmetadata", {})
            licence = plain(meta.get("LicenseShortName", {}).get("value"))
            name = plain(meta.get("ObjectName", {}).get("value")) or os.path.splitext(p["title"].split(":", 1)[1])[0]
            if not allowed(licence) or FILM.search(name + " " + meta.get("Categories", {}).get("value", "")):
                continue
            out.append({"title": p["title"], "url": info["url"], "licence": licence,
                        "artist": plain(meta.get("Artist", {}).get("value"))[:80], "name": name})
    return out


def latin(text):
    """The card's font draws Latin letters only; anything else is left out."""
    text = "".join(ch for ch in text.replace("_", " ") if ord(ch) < 0x250)
    return re.sub(r"\s+", " ", text).strip()


def font(size, bold=True):
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                 "/usr/share/fonts/opentype/inter/Inter-Bold.otf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def wrap(d, text, f, width):
    lines, line = [], ""
    for word in text.split():
        test = (line + " " + word).strip()
        if d.textlength(test, font=f) <= width or not line:
            line = test
        else:
            lines.append(line)
            line = word
    return lines + ([line] if line else [])


def card(song, path, logo):
    w, h = 1280, 720
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(0, w):
            t = (x / w + y / h) / 2
            px[x, y] = (int(46 + (12 - 46) * t), int(16 + (74 - 16) * t), int(101 + (110 - 101) * t))
    d = ImageDraw.Draw(im)
    if os.path.exists(logo):
        lg = Image.open(logo).convert("RGBA").resize((150, 150))
        im.paste(lg, (70, 60), lg)
    d.text((240, 95), "SPARK MUSIC", font=font(52), fill=(255, 255, 255))
    d.text((240, 160), "Free music, day and night", font=font(26, False), fill=(204, 251, 241))
    d.text((70, 300), "NOW PLAYING", font=font(28), fill=(250, 204, 21))
    lines = wrap(d, latin(song["name"]) or "Music", font(60), 1140)[:3]
    y = 345
    for line in lines:
        d.text((70, y), line, font=font(60), fill=(255, 255, 255))
        y += 72
    if latin(song["artist"]):
        d.text((70, y + 10), latin(song["artist"])[:70], font=font(32, False), fill=(224, 231, 255))
    d.text((70, 650), f"{song['licence']} · Wikimedia Commons", font=font(22, False), fill=(199, 210, 254))
    im.save(path)


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def slug(title):
    return re.sub(r"[^a-z0-9]+", "-", title.split(":", 1)[1].rsplit(".", 1)[0].lower()).strip("-")[:50] or "song"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="folder for the new MP4s")
    ap.add_argument("--limit", type=int, default=60, help="songs on the channel")
    ap.add_argument("--have", default="", help="file listing the MP4s already on the release")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    have = set(open(args.have).read().split()) if args.have and os.path.exists(args.have) else set()
    old = {}
    if os.path.exists(SCHEDULE):
        old = {v["url"]: v["secs"] for v in json.load(open(SCHEDULE)).get("videos", [])}

    picked, seen = [], set()
    sources = [("category", c, 12, 0.6) for c in DESI] + [("search", q, 8, 0.6) for q in DESI_SEARCHES] + \
              [("category", c, 6, 1.0) for c in CLASSICAL]
    for kind, cat, per_category, share in sources:
        if len(picked) >= args.limit * share:
            continue
        try:
            songs = details((files_in(cat) if kind == "category" else files_found(cat))[:300])
        except Exception as e:  # noqa: BLE001
            print(f"  {cat}: {e}", file=sys.stderr)
            continue
        fresh = [s for s in songs if s["title"] not in seen][:per_category]
        print(f"{cat}: {len(songs)} usable, taking {len(fresh)}")
        for s in fresh:
            seen.add(s["title"])
            picked.append(s)
    print(f"Picked {len(picked)} songs")

    logo = os.path.join(ROOT, "docs", "channel", "logos", "spark-music-square.png")
    videos = []
    for s in picked:
        if len(videos) >= args.limit:
            break
        name = "sur-" + slug(s["title"]) + ".mp4"
        url = MEDIA + name
        if name in have and old.get(url):
            secs = old[url]
        else:
            src = os.path.join(args.out, "src")
            try:
                req = urllib.request.Request(s["url"], headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=120) as r, open(src, "wb") as f:
                    f.write(r.read())
            except Exception as e:  # noqa: BLE001
                print(f"  skip {s['title']}: {e}", file=sys.stderr)
                continue
            secs = duration(src)
            if not MIN_SECS <= secs <= MAX_SECS:
                continue
            png = os.path.join(args.out, "card.png")
            card(s, png, logo)
            out = os.path.join(args.out, name)
            ok = subprocess.run([
                "ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-loop", "1", "-framerate", "2", "-i", png, "-i", src,
                "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast", "-crf", "28",
                "-r", "2", "-g", "20", "-pix_fmt", "yuv420p", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100", "-shortest", "-movflags", "+faststart", out,
            ]).returncode == 0
            if not ok:
                continue
            secs = duration(out)
        title = latin(s["name"]) or "Music"
        if latin(s["artist"]):
            title += " · " + latin(s["artist"])[:40]
        videos.append({"id": slug(s["title"])[:30] + str(len(videos)), "title": title[:90], "url": url,
                       "secs": int(secs), "kind": "programme", "licence": s["licence"], "source": s["url"]})
        print(f"  {int(secs // 60)}:{int(secs % 60):02d}  {title}")
    if len(videos) < min(5, args.limit):
        sys.exit("Too few songs; keeping the old schedule.")

    schedule = {
        "name": "Spark Music",
        "logo": "https://tv.bulkbazaar.ca/channel/logos/spark-music.png",
        "logoCorner": "tr",
        "active": True,
        "tz": "America/Toronto",
        "ticker": ("Spark Music · Free music, day and night · Classical, qawwali, ghazal and more, all free to use "
                   "(public domain and Creative Commons, from Wikimedia Commons) · Channel 3 on NextGen Cable"),
        "tickerOn": True,
        "videos": videos,
        "slots": [],
        "loop": [v["id"] for v in videos],
        "built": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
    }
    with open(SCHEDULE, "w", encoding="utf-8") as f:
        json.dump(schedule, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Wrote docs/channel/sur-schedule.json: {len(videos)} songs, {sum(v['secs'] for v in videos) / 3600:.1f} hours")


if __name__ == "__main__":
    main()
