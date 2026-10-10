#!/usr/bin/env python3
"""
Finds which YouTube videos carry another broadcaster's logo burned into the picture.

YouTube keeps three stills from inside every video (at a quarter, half and three quarters:
i.ytimg.com/vi/<id>/hq1.jpg, hq2.jpg, hq3.jpg). A logo stamped on the video sits in exactly the same
place in all three while the picture around it changes. So in each corner we count the pixels that
are an edge in all three stills and do not change between them; a corner with enough of them holds a
logo. A video whose whole picture stands still (a song over one photo) can't be judged and counts as
having a logo.

The owner asked (2026-10-10) for programmes with no other channel's logo or branding:
  * docs/channel/logo-check.json keeps every video's result (checked once, kept for later builds);
  * tools/build_youtube_channels.py keeps only logo-free videos on the channels marked "clean";
  * docs/channel/ytc.html shows our Spark logo on a video marked clean (other videos hide ours).

Run: python3 tools/logo_check.py [--files docs/channel/yt-*.json] [--sheet out.jpg] [--limit N]
Needs Pillow (pip install pillow).
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import glob
import io
import json
import os
import sys
import urllib.request

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "docs", "channel", "logo-check.json")
STILL = "https://i.ytimg.com/vi/{id}/hq{n}.jpg"
CORNER_W, CORNER_H = 0.26, 0.24  # each corner box, as a share of the picture
EDGE = 40       # how strong an edge must be (0-255)
STEADY = 18     # how little a pixel may change between the stills (0-255)
LOGO = 0.006    # share of a corner box that must be a steady edge for it to count as a logo
STILL_VIDEO = 6    # average change between the stills (0-255): less means the picture stands still
PICK = 1        # which pair of stills decides (sorted by agreement, 0-2; tuned on 137 videos 2026-10-10)
MARGIN = 10     # in from the bars, in thousandths of the picture
RECHECK_DAYS = 120  # a video's result is kept this long


def load_cache():
    if os.path.exists(CACHE):
        return json.load(open(CACHE, encoding="utf-8"))
    return {"about": "Which YouTube videos carry another channel's logo (tools/logo_check.py). logo: true = "
                     "a logo was seen (or the picture stands still), false = clean.", "videos": {}}


def save_cache(cache):
    cache["checked"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=0, sort_keys=True)
        f.write("\n")


def stills(vid):
    out = []
    for n in (1, 2, 3):
        req = urllib.request.Request(STILL.format(id=vid, n=n), headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            out.append(Image.open(io.BytesIO(r.read())).convert("L"))
    return out


def judge(frames):
    """(logo: bool, corners: list, scores: dict) for three greyscale stills of one video."""
    # Black bars (a wide film in a 4:3 still) are cut off first; they never change and have no edges anyway.
    lit = frames[0]
    for f in frames[1:]:
        lit = ImageChops.lighter(lit, f)
    box = lit.point(lambda p: 255 if p > 24 else 0).getbbox()
    if not box or box[2] - box[0] < 120 or box[3] - box[1] < 80:
        return True, [], {"why": "dark"}
    # A little in from the bars, so the soft border between bar and picture isn't taken for a logo.
    mx, my = (box[2] - box[0]) * MARGIN // 1000 + 1, (box[3] - box[1]) * MARGIN // 1000 + 1
    box = (box[0] + mx, box[1] + my, box[2] - mx, box[3] - my)
    frames = [f.crop(box) for f in frames]
    w, h = frames[0].size
    edges = []
    for f in frames:
        e = f.filter(ImageFilter.FIND_EDGES).point(lambda p: 255 if p > EDGE else 0)
        # (The filter marks the picture's own outer border as an edge; that line is wiped.)
        ImageDraw.Draw(e).rectangle((0, 0, w - 1, h - 1), outline=0, width=2)
        edges.append(e)
    # Some channels show their logo only part of the time, so each pair of stills is looked at too:
    # marks = pixels that are an edge in both stills of a pair and hardly change between them.
    pairs = []
    for a, b in ((0, 1), (1, 2), (0, 2)):
        steady = ImageChops.difference(frames[a], frames[b]).point(lambda p: 255 if p < STEADY else 0)
        pairs.append(ImageChops.darker(ImageChops.darker(edges[a], edges[b]), steady))
    change = ImageChops.lighter(ImageChops.difference(frames[0], frames[1]), ImageChops.difference(frames[1], frames[2]))
    moved = ImageStat.Stat(change).mean[0]
    all3 = ImageChops.darker(pairs[0], pairs[1])
    whole = sum(1 for p in all3.getdata() if p) / (w * h)
    if moved < STILL_VIDEO or whole > 0.06:
        return True, [], {"why": "still", "moved": round(moved, 1), "whole": round(whole, 3)}
    cw, ch = int(w * CORNER_W), int(h * CORNER_H)
    boxes = {"tl": (0, 0, cw, ch), "tr": (w - cw, 0, w, ch), "bl": (0, h - ch, cw, h), "br": (w - cw, h - ch, w, h)}
    scores = {}
    for name, b in boxes.items():
        area = (b[2] - b[0]) * (b[3] - b[1])
        # The pair that agrees least decides, unless all three agree: a logo seen in two stills of three counts.
        best = sorted(sum(1 for p in m.crop(b).getdata() if p) / area for m in pairs)
        scores[name] = round(best[PICK], 4)
    found = [c for c, s in scores.items() if s >= LOGO]
    return bool(found), found, scores


def check(ids, cache=None, limit=None):
    """Checks the videos not checked lately; returns the cache's video results."""
    cache = cache or load_cache()
    known = cache["videos"]
    today = dt.date.today()
    todo = [v for v in dict.fromkeys(ids)
            if v not in known or (today - dt.date.fromisoformat(known[v]["day"])).days > RECHECK_DAYS]
    if limit:
        todo = todo[:limit]

    def one(vid):
        try:
            logo, corners, scores = judge(stills(vid))
            return vid, {"logo": logo, "corners": corners, "scores": scores, "day": today.isoformat()}
        except Exception as e:  # noqa: BLE001
            print(f"  {vid}: {e}", file=sys.stderr)
            return vid, None

    with cf.ThreadPoolExecutor(12) as pool:
        for vid, res in pool.map(one, todo):
            if res:
                known[vid] = res
    print(f"Logo check: {len(todo)} checked, {len(known)} known")
    return known


def sheet(results, labels, path, per=3):
    """A contact sheet: a few videos of each uploader with what was found, to tune the check by eye."""
    rows = {}
    for vid, label in labels.items():
        if vid in results and len(rows.setdefault(label, [])) < per:
            rows[label].append(vid)
    tw, th = 240, 180
    img = Image.new("RGB", (tw * per + 200, th * len(rows)), "white")
    d = ImageDraw.Draw(img)
    for r, (label, vids) in enumerate(sorted(rows.items())):
        d.text((4, r * th + 4), label[:28], fill="black")
        for c, vid in enumerate(vids):
            try:
                req = urllib.request.Request(STILL.format(id=vid, n=2), headers={"User-Agent": "Mozilla/5.0"})
                t = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=20).read())).convert("RGB").resize((tw, th))
            except Exception:  # noqa: BLE001
                continue
            x, y = 200 + c * tw, r * th
            img.paste(t, (x, y))
            res = results[vid]
            d.rectangle((x, y, x + tw - 1, y + 14), fill="red" if res["logo"] else "green")
            d.text((x + 3, y + 2), ("LOGO " + ",".join(res["corners"]) if res["logo"] else "clean") + " " +
                   " ".join(f"{k}{v}" for k, v in res["scores"].items()), fill="white")
    img.save(path, quality=80)
    print(f"Wrote {path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--files", nargs="*", default=sorted(glob.glob(os.path.join(ROOT, "docs", "channel", "yt-*.json"))))
    ap.add_argument("--limit", type=int)
    ap.add_argument("--sheet")
    ap.add_argument("--sample", type=int, help="only this many videos of each uploader (to tune the check)")
    a = ap.parse_args()
    labels, per = {}, {}
    for path in a.files:
        for v in json.load(open(path, encoding="utf-8")).get("videos", []):
            label = v.get("label", "?")
            per[label] = per.get(label, 0) + 1
            if not a.sample or per[label] <= a.sample:
                labels[v["id"]] = label
    cache = load_cache()
    results = check(list(labels), cache, a.limit)
    save_cache(cache)
    by = {}
    for vid, label in labels.items():
        if vid in results:
            by.setdefault(label, [0, 0])[0 if results[vid]["logo"] else 1] += 1
    for label, (logo, clean) in sorted(by.items(), key=lambda x: -x[1][1]):
        print(f"  {label}: {clean} clean, {logo} with a logo")
    if a.sheet:
        sheet(results, labels, a.sheet)


if __name__ == "__main__":
    main()
