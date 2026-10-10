"""Builds the Azan recordings Iqra Quran (and NextGen Cable's Iqra Quran section, and the PC app) play at
prayer time: docs/quran/azan/<id>.mp3 plus docs/quran/azan/azan.json (served at tv.bulkbazaar.ca/quran/azan/).

Only freely licensed recordings from Wikimedia Commons are used, and only when the file page's licence is
public domain, CC0, CC BY or CC BY-SA (checked here every run); the apps show each one's credit.
Each recording is turned into a small mono MP3 at one loudness, so every muezzin plays at the same volume.

    python3 tools/build_azan.py          # needs ffmpeg and internet (runs in build-azan.yml)
"""
import json, os, re, subprocess, sys, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "docs", "quran", "azan")
API = "https://commons.wikimedia.org/w/api.php"
UA = "IqraQuranAzanBuilder/1.0 (https://tv.bulkbazaar.ca; Bulk Bazaar Inc.)"

# id, Commons file, English name, Urdu name, whether it is a Fajr Azan (with "As-salatu khayrun min an-nawm").
VOICES = [
    ("makkah", "File:Adhan, Great Mosque of Mecca - Jan 21, 2013.webm", "Makkah, Masjid al-Haram", "مکہ، مسجد الحرام", False),
    ("makkah-maghrib", "File:Maghrib Adhan at the Masjid al Haram, Mecca - 25 Feb, 2012.webm", "Makkah, Maghrib", "مکہ، مغرب", False),
    ("melodic", "File:Beautiful adhan.ogg", "Soft and melodic", "نرم اور خوش الحان", False),
    ("classic", "File:Azan.ogg", "Classic", "روایتی", False),
    ("aaqib", "File:The Adhan - Muslim Call to Prayer.mp3", "Aaqib Azeez", "عاقب عزیز", False),
    ("short", "File:Adhan wiki.oga", "Short and plain", "مختصر اور سادہ", False),
]
OK_LICENCES = re.compile(r"^(public domain|pd\b|cc0|cc[- ]by(-sa)?[- ]\d)", re.I)


def get(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def info(title):
    pages = get({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|extmetadata|size"})["query"]["pages"]
    page = next(iter(pages.values()))
    if "imageinfo" not in page:
        return None
    ii = page["imageinfo"][0]
    meta = ii.get("extmetadata", {})
    strip = lambda s: re.sub(r"<[^>]+>", "", (s or "")).strip()
    return {
        "url": ii["url"],
        "page": ii.get("descriptionurl", ""),
        "licence": strip(meta.get("LicenseShortName", {}).get("value")),
        "artist": strip(meta.get("Artist", {}).get("value")),
    }


def fajr_candidates():
    """Any Fajr Azan in Commons' Adhan category (listed in the log, and used when its licence is free)."""
    found = []
    cont = {}
    while True:
        r = get({"action": "query", "list": "categorymembers", "cmtitle": "Category:Adhan", "cmtype": "file",
                 "cmlimit": "500", **cont})
        for m in r["query"]["categorymembers"]:
            print("  in Category:Adhan:", m["title"])
            if re.search(r"fajr|fajar|subh", m["title"], re.I):
                found.append(m["title"])
        if "continue" not in r:
            return found
        cont = r["continue"]


def convert(url, dest):
    tmp = dest + ".part.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-user_agent", UA, "-i", url, "-vn", "-ac", "1", "-ar", "44100",
                    "-af", "silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-b:a", "96k", tmp], check=True, timeout=900)
    os.replace(tmp, dest)
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dest],
                         capture_output=True, text=True, check=True).stdout
    return round(float(out.strip()))


def main():
    os.makedirs(OUT, exist_ok=True)
    voices = list(VOICES)
    for i, title in enumerate(fajr_candidates()):
        voices.append((f"fajr-{i + 1}", title, f"Fajr Azan {i + 1}", f"فجر کی اذان {i + 1}", True))
    listed = []
    for vid, title, en, ur, fajr in voices:
        meta = info(title)
        if not meta:
            print(f"skip {vid}: {title} not found")
            continue
        if not OK_LICENCES.match(meta["licence"]):
            print(f"skip {vid}: licence '{meta['licence']}' is not free enough")
            continue
        dest = os.path.join(OUT, f"{vid}.mp3")
        try:
            seconds = convert(meta["url"], dest)
        except Exception as e:  # one broken file never stops the rest
            print(f"skip {vid}: {e}")
            continue
        if seconds < 15:
            print(f"skip {vid}: only {seconds} s")
            os.remove(dest)
            continue
        listed.append({
            "id": vid, "en": en, "ur": ur, "fajr": fajr, "file": f"{vid}.mp3", "seconds": seconds,
            "credit": f"{meta['artist'] or 'Wikimedia Commons'}, {meta['licence']}, via Wikimedia Commons",
            "source": meta["page"],
        })
        print(f"ok {vid}: {seconds} s, {meta['licence']}, {meta['artist']}")
    if not listed:
        sys.exit("No Azan recording could be made.")
    keep = {v["file"] for v in listed}
    for f in os.listdir(OUT):
        if f.endswith(".mp3") and f not in keep:
            os.remove(os.path.join(OUT, f))
    with open(os.path.join(OUT, "azan.json"), "w", encoding="utf-8") as f:
        json.dump({"voices": listed}, f, ensure_ascii=False, indent=1)
    print(f"azan.json: {len(listed)} voices")


if __name__ == "__main__":
    main()
