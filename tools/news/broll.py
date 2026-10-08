"""Free scene clips ("b-roll") for Bazaar TV News stories (owner asked 2026-10-08 for video in the news).

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
VERSION = 2   # bump to rebuild the clip library
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


def build(out, per_topic=3):
    os.makedirs(out, exist_ok=True)
    index, seen = [], set()
    for topic, terms in TOPICS.items():
        got = 0
        for term in terms:
            if got >= per_topic: break
            try: found = search(term)
            except Exception as e: print("search failed", term, e); continue
            for c in found:
                if got >= per_topic: break
                if c["title"] in seen or not c["url"] or c["size"] > 400e6: continue
                seen.add(c["title"])
                name = f"broll-{topic}-{hashlib.md5(c['title'].encode()).hexdigest()[:8]}.mp4"
                src = os.path.join(out, "src" + os.path.splitext(c["url"])[1])
                try:
                    with open(src, "wb") as f: f.write(get(c["url"], 300))
                    d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                                              "csv=p=0", src], capture_output=True, text=True).stdout or 0)
                    if d < 6: continue
                    ss = max(0.0, min(d - 10, d * 0.3))
                    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{ss:.1f}", "-i", src, "-t", "10",
                                    "-vf", "scale=640:360:force_original_aspect_ratio=increase,crop=640:360,fps=25,format=yuv420p",
                                    "-an", "-c:v", "libx264", "-crf", "24", "-preset", "veryfast",
                                    os.path.join(out, name)], check=True, timeout=600)
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


if __name__ == "__main__":
    if sys.argv[1:2] == ["build"]: build(sys.argv[2] if len(sys.argv) > 2 else "out")
