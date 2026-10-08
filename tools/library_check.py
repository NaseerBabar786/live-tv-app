#!/usr/bin/env python3
"""
Checks every Library programme before viewers see it, and adds its length and a short description
(owner, 2026-10-08). The owner opened an English film ("Beyond the Trek") that showed one picture the
whole time with the sound playing. Rule for the whole Library: such videos never go on the list, and every
title shows how long it is and a line about it.

For each YouTube programme in the given playlists, once (results kept in docs/library-info.json):
  - its watch page gives the length and description,
  - its storyboard (the 100 small pictures YouTube shows when you scrub through a video) tells a real
    video from a still picture: when hardly any of the pictures differ from the one before, it's a still.
    Without a storyboard, YouTube's three frame pictures (1.jpg, 2.jpg, 3.jpg) are compared instead.
Then each playlist is rewritten: stills, and programmes taken off after viewers' reports
(docs/library-removed.json), are dropped; the others get mins="95" and desc="..." on their #EXTINF line.

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
INFO = os.path.join(ROOT, "docs", "library-info.json")
REMOVED = os.path.join(ROOT, "docs", "library-removed.json")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")
YT = re.compile(r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([\w-]{11})")
MAX_NEW = int(os.environ.get("LIBRARY_CHECK_MAX", "2500"))  # new videos looked at per run; the rest next morning
CHANGE = 10       # mean difference (0-255) between two storyboard pictures that counts as a new picture
STILL_CHANGES = 3  # a video whose 100 pictures change at most this often is a still
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


def frames(sheet, width, height, cols, rows, count):
    img = Image.open(io.BytesIO(sheet)).convert("L")
    out = []
    for n in range(min(count, cols * rows)):
        x, y = (n % cols) * width, (n // cols) * height
        if y + height <= img.height and x + width <= img.width:
            out.append(img.crop((x, y, x + width, y + height)))
    return out


def diff(a, b):
    return ImageStat.Stat(ImageChops.difference(a, b)).mean[0]


def picture_check(vid, spec):
    """(still?, how many times the picture changed, how many pictures) or None when it can't tell."""
    if Image is None:
        return None
    pics = []
    if spec:
        # base|w#h#count#cols#rows#interval#name#sigh|...  Level 0 = 100 pictures over the whole video, one sheet.
        parts = spec.split("|")
        try:
            w, h, count, cols, rows, _, name, sigh = parts[1].split("#")[:8]
            url = parts[0].replace("$L", "0").replace("$N", name) + "&sigh=" + urllib.parse.quote(sigh, safe="$")
            pics = frames(get(url, binary=True), int(w), int(h), int(cols), int(rows), int(count))
        except Exception as e:  # noqa: BLE001
            print(f"  {vid}: storyboard failed ({e})", file=sys.stderr)
    if len(pics) < 10:
        try:
            pics = [Image.open(io.BytesIO(get(f"https://i.ytimg.com/vi/{vid}/{n}.jpg", binary=True))).convert("L")
                    for n in (1, 2, 3)]
        except Exception:  # noqa: BLE001
            return None
        changes = sum(diff(a, b) > CHANGE for a, b in zip(pics, pics[1:]))
        return changes == 0, changes, len(pics)
    # Black pictures at the very start or end don't count either way.
    lit = [p for p in pics if ImageStat.Stat(p).mean[0] > 12]
    changes = sum(diff(a, b) > CHANGE for a, b in zip(lit, lit[1:]))
    return (len(lit) >= 10 and changes <= STILL_CHANGES), changes, len(lit)


def look(vid):
    """What we know about one YouTube video: mins, desc, still (True/False/None)."""
    info = {"checked": dt.date.today().isoformat()}
    spec = None
    try:
        page = get(f"https://www.youtube.com/watch?v={vid}&hl=en")
        m = re.search(r'"lengthSeconds":"(\d+)"', page)
        if m:
            info["mins"] = round(int(m.group(1)) / 60)
        m = re.search(r'"shortDescription":"((?:[^"\\]|\\.)*)"', page)
        if m:
            desc = describe(json.loads(f'"{m.group(1)}"'))
            if desc:
                info["desc"] = desc
        m = re.search(r'"playerStoryboardSpecRenderer":\{"spec":"((?:[^"\\]|\\.)*)"', page)
        if m:
            spec = json.loads(f'"{m.group(1)}"')
    except Exception as e:  # noqa: BLE001
        print(f"  {vid}: watch page failed ({e})", file=sys.stderr)
    seen = picture_check(vid, spec)
    if seen:
        info["still"], info["changes"], info["pictures"] = seen
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


def rewrite(path, info, removed):
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()
    out, dropped, extinf = [], [], None
    for line in lines:
        if line.startswith("#EXTINF"):
            extinf = line
            continue
        if extinf is None:
            out.append(line)
            continue
        m = YT.search(line)
        known = info.get(m.group(1) if m else line.strip(), {})
        name = extinf.rsplit(",", 1)[-1]
        if line.strip() in removed or (m and m.group(1) in removed) or known.get("still"):
            dropped.append(f"{name} ({line.strip()}): {'still picture' if known.get('still') else 'reported'}")
            extinf = None
            continue
        extinf = re.sub(r'\s(?:mins|desc)="[^"]*"', "", extinf)
        extra = (f' mins="{known["mins"]}"' if known.get("mins") else "") + \
                (f' desc="{html.unescape(known["desc"])}"' if known.get("desc") else "")
        out.append(re.sub(r"^(#EXTINF:\s*-?\d+)", lambda g: g.group(1) + extra, extinf, count=1))
        out.append(line)
        extinf = None
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"{os.path.basename(path)}: {len(dropped)} taken off")
    for d in dropped[:40]:
        print(f"    off: {d}")


def main(args):
    if args and args[0] == "--probe":
        for vid in args[1:]:
            print(vid, json.dumps((look_other(vid) if vid.startswith("http") else look(vid))[1], ensure_ascii=False))
        return
    info = load(INFO, {})
    removed = set(load(REMOVED, {}).get("items", {}))
    ids, others = [], []
    for path in args:
        with open(path, encoding="utf-8") as f:
            text = f.read()
        ids += [m.group(1) for m in YT.finditer(text)]
        others += [u for u in re.findall(r"^(https?://\S+)$", text, re.M)
                   if not YT.search(u) and ("vimeo.com/" in u or "images-assets.nasa.gov/video/" in u)]
    todo = [v for v in dict.fromkeys(ids) if v not in info][:MAX_NEW]
    with ThreadPoolExecutor(8) as pool:
        for url, found in pool.map(look_other, [u for u in dict.fromkeys(others) if u not in info]):
            info[url] = found
        for n, (vid, found) in enumerate(pool.map(look, todo), 1):
            info[vid] = found
            if found.get("still"):
                print(f"  still picture: {vid} ({found.get('changes')} changes in {found.get('pictures')} pictures)")
            if n % 250 == 0:
                print(f"  looked at {n} of {len(todo)}")
    print(f"Looked at {len(todo)} new videos; {sum(1 for v in info.values() if v.get('still'))} stills known, "
          f"{sum(1 for v in info.values() if v.get('mins'))} with a length, "
          f"{sum(1 for v in info.values() if v.get('desc'))} with a description")
    with open(INFO, "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        f.write("\n")
    for path in args:
        rewrite(path, info, removed)


if __name__ == "__main__":
    main(sys.argv[1:])
