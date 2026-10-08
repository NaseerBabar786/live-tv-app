#!/usr/bin/env python3
"""
Checks every Library programme before viewers see it, and adds its length and a short description
(owner, 2026-10-08). The owner opened an English film ("Beyond the Trek") that showed one picture the
whole time with the sound playing. Rule for the whole Library: a video that doesn't meet the Library's
standard never goes on the list, and every title shows how long it is and a line about it.

For each YouTube programme in the given playlists, once (kept in docs/library-info/<list>.json):
  - its description (YouTube's watch-page data) and length (a YouTube search for it),
  - whether it is a real video: YouTube's three frame pictures (a quarter, half and three quarters of
    the way through) are compared; all the same, or all black, means one still picture with sound.
Then each playlist is rewritten without:
  - still pictures,
  - wrong fits: trailers, teasers, promos, clips, songs, reactions, interviews, Shorts and the like, and
    films, telefilms and drama episodes far too short to be one (FIT_MINUTES),
  - programmes viewers say don't play (more "No" than "Yes" to the app's "Did it play properly?"),
    and programmes taken off by hand (docs/library-removed.json),
and the others get mins="95" and desc="..." on their #EXTINF line. Blocked videos (YouTube error 150,
removed, private) are taken off by the pre-air check (tools/preair_check.py) that runs after this.

Needs Pillow for the picture check (pip install pillow); without it only lengths and descriptions are added.
Run: python3 tools/library_check.py docs/Dramas.m3u docs/Free.m3u
     python3 tools/library_check.py --probe VIDEO_ID ...   (prints what it finds, changes nothing)
"""
import datetime as dt
import html
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INFO_DIR = os.path.join(ROOT, "docs", "library-info")
REMOVED = os.path.join(ROOT, "docs", "library-removed.json")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")
YT = re.compile(r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([\w-]{11})")
MAX_NEW = int(os.environ.get("LIBRARY_CHECK_MAX", "8000"))  # new videos looked at per run; the rest next morning
CHANGE = 10  # mean difference (0-255) between two frame pictures that counts as a different picture
# Not what the Library is for (titles are checked; Kids may have songs and rhymes).
WRONG_FIT = re.compile(r"\b(?:official )?(?:trailer|teaser|promo|first look|sneak peek|#shorts|shorts|reaction|"
                       r"behind the scenes|bts|making of|interview|press conference|review|recap|highlights?|"
                       r"best scenes?|scene \d+|clip)\b", re.I)
SONG = re.compile(r"\b(?:song|songs|ost|title track|audio jukebox|jukebox|lyrical|music video)\b", re.I)
# The least a programme in a section can last, in minutes (when its length is known).
FIT_MINUTES = {"Movies": 60, "Telefilms": 40, "Series": 15}
DESC_CHARS = 180
JUNK = re.compile(r"https?://|www\.|#\w|@\w|subscribe|follow us|like,? share|instagram|facebook|twitter|tiktok|"
                  r"copyright|©|all rights|download|watch (?:more|all|now)|click|playlist|channel|"
                  r"^\W*$|^(?:cast|director|producer|written|music|starring|genre|language)\b", re.I)

try:
    from PIL import Image, ImageChops, ImageStat
except ImportError:  # the picture check is skipped
    Image = None


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9",
                                               "Cookie": "CONSENT=YES+1; SOCS=CAI"})
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "replace")


def describe(text):
    """The first plain sentence or two of a YouTube description, without links, hashtags and credits."""
    keep = []
    for line in (text or "").splitlines():
        line = line.strip(" -–—•*|")
        if "|" in line and " - " in line:  # "Catchy line | Film Name | Full Movie - The real description"
            line = line.split(" - ", 1)[1]
        if len(line) < 20 or JUNK.search(line) or sum(c.isalpha() for c in line) < len(line) * 0.6:
            continue
        keep.append(line)
        if sum(len(k) for k in keep) >= DESC_CHARS:
            break
    out = " ".join(keep)
    if len(out) > DESC_CHARS:
        cut = out[:DESC_CHARS]
        end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
        out = cut[:end + 1] if end > 60 else cut.rsplit(" ", 1)[0] + "…"
    return out.replace('"', "'").strip()


def picture_check(vid):
    """(still?, how many of the three frame pictures differ from the one before) or None when it can't tell.

    YouTube makes three pictures from every video, a quarter, half and three quarters of the way through
    (1.jpg, 2.jpg, 3.jpg). In a real film they differ; in a "film" that is one picture with sound they're the same.
    (Its storyboard and watch page would tell more, but YouTube asks servers to sign in for those.)"""
    if Image is None:
        return None
    try:
        pics = [Image.open(io.BytesIO(get(f"https://i.ytimg.com/vi/{vid}/{n}.jpg", binary=True))).convert("L")
                for n in (1, 2, 3)]
    except Exception:  # noqa: BLE001
        return None
    changes = sum(ImageStat.Stat(ImageChops.difference(a, b)).mean[0] > CHANGE for a, b in zip(pics, pics[1:]))
    dark = all(ImageStat.Stat(p).mean[0] < 8 for p in pics)  # a black screen the whole way
    return changes == 0 or dark, changes


def innertube(endpoint, body):
    req = urllib.request.Request(f"https://www.youtube.com/youtubei/v1/{endpoint}?prettyPrint=false",
                                 data=json.dumps({**body, "context": {"client": {
                                     "clientName": "WEB", "clientVersion": "2.20250101.00.00", "hl": "en", "gl": "CA"}}}).encode(),
                                 headers={"User-Agent": UA, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def look(vid):
    """What we know about one YouTube video: mins, desc, still (True/False), checked."""
    info = {"checked": dt.date.today().isoformat()}
    try:  # the description, from the watch page's data (this part works without signing in)
        m = re.search(r'"attributedDescription":\{"content":"((?:[^"\\]|\\.)*)"', innertube("next", {"videoId": vid}))
        desc = describe(json.loads(f'"{m.group(1)}"')) if m else ""
        if desc:
            info["desc"] = desc
    except Exception as e:  # noqa: BLE001
        print(f"  {vid}: details failed ({e})", file=sys.stderr)
    try:  # the length, from a search for the video (search results show it)
        page = innertube("search", {"query": vid})
        at = page.find(f'"videoId":"{vid}"')
        m = re.search(r'"lengthText":\{.*?"simpleText":"([\d:]+)"', page[at:at + 8000]) if at >= 0 else None
        if m:
            secs = 0
            for part in m.group(1).split(":"):
                secs = secs * 60 + int(part)
            info["mins"] = max(1, round(secs / 60))
    except Exception as e:  # noqa: BLE001
        print(f"  {vid}: length failed ({e})", file=sys.stderr)
    seen = picture_check(vid)
    if seen:
        info["still"], info["changes"] = seen
    return vid, info


def look_other(url):
    """Length and description of a Vimeo film or a NASA video (Free.m3u); never a still check."""
    info = {"checked": dt.date.today().isoformat()}
    try:
        if "vimeo.com/" in url:
            j = json.loads(get("https://vimeo.com/api/oembed.json?url=" + urllib.parse.quote(url, safe="")))
            if j.get("duration"):
                info["mins"] = max(1, round(j["duration"] / 60))
            desc = describe(html.unescape(re.sub(r"<[^>]+>", "\n", j.get("description") or "")))
        else:
            nasa_id = urllib.parse.unquote(url.split("/video/", 1)[1].split("/", 1)[0])
            j = json.loads(get("https://images-api.nasa.gov/search?nasa_id=" + urllib.parse.quote(nasa_id)))
            data = j["collection"]["items"][0]["data"][0]
            desc = describe(data.get("description_508") or data.get("description") or "")
        if desc:
            info["desc"] = desc
    except Exception as e:  # noqa: BLE001
        print(f"  {url}: no details ({e})", file=sys.stderr)
    return url, info


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


ATTR = re.compile(r'([\w-]+)="([^"]*)"')


def why_off(attrs, name, known, url, vid, removed):
    """Why a programme doesn't belong in the Library, or None when it does."""
    if url in removed or (vid and vid in removed):
        return "reported / taken off by hand"
    if known.get("still"):
        return "one still picture"
    section = attrs.get("tvg-genre", "")
    full = re.search(r"full (?:episode|movie|film)", name, re.I)
    if not full and (WRONG_FIT.search(name) or (section != "Kids" and SONG.search(name))):
        return "not a full programme (trailer, clip, song...)"
    mins = known.get("mins") or (int(attrs["mins"]) if attrs.get("mins", "").isdigit() else None)
    least = FIT_MINUTES.get("Telefilms" if attrs.get("group-title") == "Telefilms" else section)
    if vid and mins and least and mins < least and attrs.get("group-title") != "Short films":
        return f"too short ({mins} min) for {section}"
    return None


def rewrite(path, info, removed, taken):
    """Rewrites one playlist; what's taken off goes into [taken] (language, section, name, why)."""
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()
    out, extinf = [], None
    for line in lines:
        if line.startswith("#EXTINF"):
            extinf = line
            continue
        if extinf is None or not line.strip() or line.startswith("#"):
            out.append(line)
            continue
        url = line.strip()
        m = YT.search(url)
        vid = m.group(1) if m else None
        known = info.get(vid or url, {})
        head, _, name = extinf.partition('",')
        attrs = dict(ATTR.findall(head + '"'))
        why = why_off(attrs, name, known, url, vid, removed)
        if why:
            taken.append((attrs.get("tvg-language", "English"), attrs.get("tvg-genre", "Other"), name, why, url))
            extinf = None
            continue
        mins = known.get("mins") or attrs.get("mins")
        desc = known.get("desc") or attrs.get("desc")
        extinf = re.sub(r'\s(?:mins|desc)="[^"]*"', "", extinf)
        extra = (f' mins="{mins}"' if mins else "") + (f' desc="{html.unescape(desc)}"' if desc else "")
        out.append(re.sub(r"^(#EXTINF:\s*-?\d+)", lambda g: g.group(1) + extra, extinf, count=1))
        out.append(line)
        extinf = None
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")


REPORTS = ("https://firestore.googleapis.com/v1/projects/live-tv-b2164/databases/(default)/documents/reports"
           "?pageSize=300&key=AIzaSyAukJcRHwIV_W3TKtr3_5XiVJZe-7491KE")


def reported():
    """Programmes viewers say don't play: more "No" than "Yes" answers to "Did it play properly?"
    (Cable TV's Library, LibraryReports.kt). {link or YouTube id: "N said no, M said yes"}."""
    votes, token = {}, ""
    try:
        while True:
            page = json.loads(get(REPORTS + (f"&pageToken={urllib.parse.quote(token)}" if token else "")))
            for doc in page.get("documents", []):
                f = doc.get("fields", {})
                if f.get("kind", {}).get("stringValue") != "library":
                    continue
                url = f.get("url", {}).get("stringValue", "")
                m = YT.search(url)
                key = m.group(1) if m else url
                no, yes = votes.get(key, (0, 0))
                votes[key] = (no, yes + 1) if f.get("ok", {}).get("booleanValue") else (no + 1, yes)
            token = page.get("nextPageToken")
            if not token:
                break
    except Exception as e:  # noqa: BLE001
        print(f"::warning::Viewers' reports could not be read ({e}); are the Firestore rules for 'reports' published?")
    out = {k: f"{no} said it doesn't play, {yes} said it does" for k, (no, yes) in votes.items() if no > yes}
    print(f"Viewers' reports: {len(votes)} programmes answered, {len(out)} taken off")
    return out


def main(args):
    if args and args[0] == "--probe":
        for vid in args[1:]:
            print(vid, json.dumps((look_other(vid) if vid.startswith("http") else look(vid))[1], ensure_ascii=False))
        return
    removed = set(load(REMOVED, {}).get("items", {})) | set(reported())
    os.makedirs(INFO_DIR, exist_ok=True)
    taken = []
    for path in args:
        info_path = os.path.join(INFO_DIR, os.path.splitext(os.path.basename(path))[0] + ".json")
        old = load(info_path, {})
        with open(path, encoding="utf-8") as f:
            text = f.read()
        ids = list(dict.fromkeys(m.group(1) for m in YT.finditer(text)))
        others = [u for u in dict.fromkeys(re.findall(r"^(https?://\S+)$", text, re.M))
                  if not YT.search(u) and ("vimeo.com/" in u or "images-assets.nasa.gov/video/" in u)]
        # Only what's on the list now is kept, so the file doesn't grow for ever.
        info = {k: old[k] for k in ids + others if k in old}
        todo = [v for v in ids if v not in info][:MAX_NEW]
        with ThreadPoolExecutor(12) as pool:
            for url, found in pool.map(look_other, [u for u in others if u not in info]):
                info[url] = found
            for n, (vid, found) in enumerate(pool.map(look, todo), 1):
                info[vid] = found
                if n % 500 == 0:
                    print(f"  looked at {n} of {len(todo)}", flush=True)
        print(f"{os.path.basename(path)}: looked at {len(todo)} new videos; of {len(info)}: "
              f"{sum(1 for v in info.values() if v.get('mins'))} with a length, "
              f"{sum(1 for v in info.values() if v.get('desc'))} with a description, "
              f"{sum(1 for v in info.values() if 'still' in v)} picture-checked, "
              f"{sum(1 for v in info.values() if v.get('still'))} still pictures")
        with open(info_path, "w", encoding="utf-8") as f:
            json.dump(info, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            f.write("\n")
        before = len(taken)
        rewrite(path, info, removed, taken)
        print(f"{os.path.basename(path)}: {len(taken) - before} taken off")
    counts = {}
    for lang, section, _, why, _ in taken:
        counts.setdefault((lang, section), {}).setdefault(why.split(" (")[0], 0)
        counts[(lang, section)][why.split(" (")[0]] += 1
    for (lang, section), whys in sorted(counts.items()):
        print(f"  {lang} {section}: {sum(whys.values())} off ({', '.join(f'{n} {w}' for w, n in whys.items())})")
    for lang, section, name, why, url in taken[:300]:
        print(f"    off: {lang} {section} | {name} | {why} | {url}")


if __name__ == "__main__":
    main(sys.argv[1:])
