"""Free scene clips ("b-roll") for Spark TV News stories (owner asked 2026-10-08 for video in the news).

We may not use other broadcasters' footage, so stories get a general clip of their topic (a parliament, a
cricket ground, a city, a cinema...) from Wikimedia Commons, only public domain, CC0 or CC BY (no SA/NC),
credited under the clip. `build` (run on GitHub Actions; the sandbox can't reach Commons) makes 640x360,
silent, 10 s clips and uploads them with news-broll.json to the news-broll release; make_news.py picks one
per story by topic.

    python3 tools/news/broll.py build out/      -> out/broll-*.mp4 + out/news-broll.json
"""
import hashlib, html, json, os, re, subprocess, sys, urllib.parse, urllib.request

REL = "https://github.com/NaseerBabar786/live-tv-app/releases/download/news-broll/"
UA = {"User-Agent": "BazaarTV-News/1.0 (https://tv.bulkbazaar.ca; news b-roll)"}
# topic -> Commons searches. Topics are matched to stories by section and by words in the headline.
TOPICS = {
    "pakistan": ["Islamabad", "Lahore city", "Karachi city", "Faisal Mosque"],
    "parliament-pk": ["Parliament Islamabad", "Pakistan flag"],
    "india": ["New Delhi", "Mumbai city", "India Gate", "Kolkata street"],
    "world": ["globe", "Earth ISS", "skyline timelapse", "airport airplane"],
    "canada": ["Toronto skyline", "Parliament Hill Ottawa", "Vancouver city", "Montreal city"],
    "court": ["courthouse", "gavel", "court building"],
    "election": ["ballot box", "ballot"],
    "weather-rain": ["rain drops", "rain timelapse", "clouds timelapse", "rain street"],
    "cricket": ["cricket match", "cricket stadium", "cricket batting"],
    "football": ["football match stadium", "soccer match"],
    "sports": ["stadium", "athletics", "running track"],
    "film": ["projector", "cinema hall", "film reel", "clapperboard", "movie theater"],
    "money": ["banknotes", "coins", "stock ticker", "market bazaar"],
    "health": ["hospital corridor", "stethoscope", "ambulance"],
}
# Urdu words in a headline -> topic (first match wins); otherwise the story's section.
WORDS = [
    (("کرکٹ", "ٹیسٹ میچ", "ون ڈے", "ٹی ٹوئنٹی", "بابر اعظم", "پی سی بی", "ورلڈ کپ"), "cricket"),
    (("فٹبال", "فٹ بال"), "football"),
    (("عدالت", "جج", "مقدمہ", "سپریم کورٹ", "ہائی کورٹ"), "court"),
    (("انتخابات", "الیکشن", "ووٹ", "پولنگ"), "election"),
    (("بارش", "سیلاب", "طوفان", "موسم"), "weather-rain"),
    (("ہسپتال", "صحت", "بیماری", "وائرس", "ڈاکٹر"), "health"),
    (("ڈالر", "روپے", "معیشت", "مہنگائی", "سٹاک", "بجٹ", "قیمت"), "money"),
    (("اسمبلی", "پارلیمنٹ", "سینیٹ"), "parliament-pk"),
]
SECTION_TOPIC = {"pakistan": "pakistan", "india": "india", "world": "world", "canada": "canada",
                 "sports": "sports", "film": "film"}
# Scenery only: no other broadcasters' footage, no real people or real events that could be mistaken for the story.
BLOCK = re.compile(r"news|bbc|cnn|cnbc|abc |nbc|fox|al jazeera|voa|reuters|cramer|interview|press conf|speech|address|"
                   r"president|minister|candidate|senator|governor|mayor|king |queen|prince|trump|biden|bush|obama|trudeau|"
                   r"modi|khan|sharif|bhutto|shoot|bomb|attack|kill|dead|death|war|army|military|soldier|navy|riot|"
                   r"protest|funeral|crash|fire|terror|police|arrest|covid|corona|nara|\(1[89]\d\d\)|film \d{3,}", re.I)
VERSION = 4   # bump to rebuild the clip library
OK_LICENCE = re.compile(r"^(cc0|public domain|pd|cc by( \d\.\d)?|cc-by( \d\.\d)?)$", re.I)


def get(url, timeout=60):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def search(term, limit=12):
    q = urllib.parse.urlencode({"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
                                "gsrsearch": "filetype:video " + " ".join(f"intitle:{w}" for w in term.split()), "gsrlimit": limit, "prop": "imageinfo",
                                "iiprop": "url|extmetadata|size|mediatype"})
    pages = json.loads(get("https://commons.wikimedia.org/w/api.php?" + q)).get("query", {}).get("pages", {})
    out = []
    for p in pages.values():
        ii = (p.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata", {})
        lic = (md.get("LicenseShortName", {}).get("value") or "").strip()
        desc = re.sub(r"<[^>]+>", " ", html.unescape(md.get("ImageDescription", {}).get("value") or ""))
        if not OK_LICENCE.match(lic) or BLOCK.search(p["title"]) or BLOCK.search(desc[:400]): continue
        artist = re.sub(r"<[^>]+>", "", html.unescape(md.get("Artist", {}).get("value") or "")).strip()
        if not artist or "unknown" in artist.lower(): artist = "Wikimedia Commons contributor"
        dur = float(ii.get("duration") or 0)
        out.append({"title": p["title"], "url": ii.get("url"), "licence": lic, "artist": artist[:60],
                    "page": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(p["title"].replace(" ", "_")),
                    "size": ii.get("size", 0)})
    return out


# Hand-picked by looking at contact sheets (news-broll-candidates.yml): neutral scenery only, nothing that
# shows a real person or event the story could be mistaken for. Topics with no good free clip simply get none.
CURATED = {
    "cricket": ["File:WACA 2012 India vs Sri Lanka ODI.webm",
                "File:2011-03-30 - India v Pakistan.ogv"],
    "india": ["File:Street in Mumbai (video) 01.webm", "File:Street in Mumbai (video) 02.webm", "File:Street in Mumbai (video) 03.webm",
              "File:Mumbai Local Train.webm", "File:The changing colours of Mumbai CST railway station.webm", "File:Toward northern mumbai from window of taxi 2022 Dec.webm"],
    "canada": ["File:Toronto Skyline.webm", "File:Toronto Skyline2.webm", "File:Google Timelapse- Toronto, Canada.webm",
               "File:Snowstorm in Quebec City.webm", "File:Old Québec City Tours , Canada (UNESCO’s World Heritage ).webm"],
    "world": ["File:BlackMarble 2016 rotating globe at night.webm", "File:Earth 360 animation.webm",
              "File:City Timelapse - Free video.webm", "File:City timelapse video.webm"],
    "weather-rain": ["File:Rain in Kenwood - September 30 2023 - Sarah Stierch.webm", "File:Rain in Sonoma - December 2025 - Sarah Stierch.webm",
                     "File:Rain drops - Japan -2016 July 20.webm", "File:Timelapse of Clouds over Bellevue Canyon.webm",
                     "File:Wolken Zeitraffer - Clouds Timelapse 4K HD 24FPS.webm"],
    "sports": ["File:UNC chapel hill kenan football stadium aerial.webm", "File:Golakganj Stadium.webm"],
    "film": ["File:Cinemeccanica projector Victoria 9 running.webm", "File:DGB (large feed reels) - Cinema projector.webm",
             "File:Reels and Lights (2012).webm", "File:Reversal film projector..webm"],
    "health": ["File:Helicopter landing at King’s College Hospital Helipad (2025-07-08).webm"],
    "court": ["File:Gov.gsa.historic.denver.ogv",
              "File:Gov.gsa.historic.portland.1.ogv"],
}


def lookup(titles):
    """Commons file info (url, licence, artist) for exact titles; prefix matches let a cut-off title still resolve."""
    q = urllib.parse.urlencode({"action": "query", "format": "json", "titles": "|".join(titles), "prop": "imageinfo",
                                "iiprop": "url|extmetadata|size"})
    out = []
    for p in json.loads(get("https://commons.wikimedia.org/w/api.php?" + q)).get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata", {})
        if not ii.get("url"): print("missing", p.get("title")); continue
        lic = (md.get("LicenseShortName", {}).get("value") or "").strip()
        if not OK_LICENCE.match(lic): print("licence not ok", p["title"], lic); continue
        artist = re.sub(r"<[^>]+>", "", html.unescape(md.get("Artist", {}).get("value") or "")).strip()
        if not artist or "unknown" in artist.lower() or "http" in artist: artist = "Wikimedia Commons contributor"
        out.append({"title": p["title"], "url": ii["url"], "licence": lic, "artist": artist[:60], "size": ii.get("size", 0),
                    "page": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(p["title"].replace(" ", "_"))})
    return out


def build(out):
    os.makedirs(out, exist_ok=True)
    index = []
    for topic, titles in CURATED.items():
        got = 0
        for c in lookup(titles):
            if c["size"] > 600e6: continue
            name = f"broll-{topic}-{hashlib.md5(c['title'].encode()).hexdigest()[:8]}.mp4"
            src = os.path.join(out, "src" + os.path.splitext(c["url"])[1])
            try:
                with open(src, "wb") as f: f.write(get(c["url"], 600))
                d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                                          "csv=p=0", src], capture_output=True, text=True).stdout or 0)
                if d < 6: continue
                ss = max(0.0, min(d - 10, d * 0.3))
                subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{ss:.1f}", "-i", src, "-t", "10",
                                "-vf", "scale=640:360:force_original_aspect_ratio=increase,crop=640:360,fps=25,format=yuv420p",
                                "-an", "-c:v", "libx264", "-crf", "24", "-preset", "veryfast",
                                os.path.join(out, name)], check=True, timeout=900)
                subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", "5", "-i", os.path.join(out, name),
                                "-frames:v", "1", os.path.join(out, name[:-4] + ".jpg")])
                index.append({"file": name, "topic": topic, **{k: c[k] for k in ("title", "licence", "artist", "page")}})
                got += 1; print("clip", topic, c["title"], c["licence"])
            except Exception as e:
                print("clip failed", c["title"], e)
            finally:
                if os.path.exists(src): os.remove(src)
        print(topic, got)
    json.dump({"version": VERSION, "clips": index}, open(os.path.join(out, "news-broll.json"), "w"), indent=1, ensure_ascii=False)


_INDEX = None
def pick(story, work):
    """A local clip path + credit for this story, or None (no clips yet or download failed)."""
    global _INDEX
    try:
        if _INDEX is None: _INDEX = json.loads(get(REL + "news-broll.json", 30)).get("clips", [])
        text = story.get("headline", "") + " " + story.get("title", "")
        topic = next((t for words, t in WORDS if any(w in text for w in words)), None)
        if story.get("section") == "film": topic = "film"
        pool = [c for c in _INDEX if c["topic"] == topic] or [c for c in _INDEX if c["topic"] == SECTION_TOPIC.get(story.get("section"))]
        if not pool: return None
        c = pool[int(hashlib.md5(text.encode()).hexdigest(), 16) % len(pool)]
        path = os.path.join(work, c["file"])
        if not os.path.exists(path):
            with open(path, "wb") as f: f.write(get(REL + c["file"], 60))
        return path, f"Video: {c['artist']} · {c['licence']} · Wikimedia Commons"
    except Exception as e:
        print("broll:", e); return None



def candidates(out, queries):
    """Contact sheets for hand-picking: out/cand-<n>.jpg (numbered thumbnails) + out/candidates.txt."""
    from PIL import Image, ImageDraw, ImageFont
    os.makedirs(out, exist_ok=True)
    lines, n = [], 0
    for qi, term in enumerate(queries):
        q = urllib.parse.urlencode({"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
                                    "gsrsearch": "filetype:video " + term, "gsrlimit": 24, "prop": "imageinfo",
                                    "iiprop": "url|extmetadata|size", "iiurlwidth": 320})
        try: pages = json.loads(get("https://commons.wikimedia.org/w/api.php?" + q)).get("query", {}).get("pages", {})
        except Exception as e: print("failed", term, e); continue
        tiles = []
        for p in sorted(pages.values(), key=lambda p: p.get("index", 0)):
            ii = (p.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata", {})
            lic = (md.get("LicenseShortName", {}).get("value") or "").strip()
            if not OK_LICENCE.match(lic): continue
            n += 1
            lines.append(f"{n}\t{term}\t{lic}\t{p['title']}")
            try:
                im = Image.open(__import__("io").BytesIO(get(ii["thumburl"], 30))).convert("RGB")
                im.thumbnail((320, 180))
            except Exception: im = Image.new("RGB", (320, 180), "gray")
            tiles.append((n, im))
        if not tiles: continue
        cols = 4; rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 330, rows * 190 + 40), "white"); d = ImageDraw.Draw(sheet)
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        d.text((10, 8), term, fill="black", font=f)
        for i, (num, im) in enumerate(tiles):
            x, y = (i % cols) * 330 + 5, (i // cols) * 190 + 40
            sheet.paste(im, (x, y)); d.rectangle((x, y, x + 60, y + 30), fill="yellow"); d.text((x + 6, y + 3), str(num), fill="black", font=f)
        sheet.save(os.path.join(out, f"cand-{qi:02d}.jpg"), quality=80)
    open(os.path.join(out, "candidates.txt"), "w").write("\n".join(lines) + "\n")

if __name__ == "__main__":
    if sys.argv[1:2] == ["build"]: build(sys.argv[2] if len(sys.argv) > 2 else "out")
    if sys.argv[1:2] == ["candidates"]: candidates(sys.argv[2], sys.argv[3:])
