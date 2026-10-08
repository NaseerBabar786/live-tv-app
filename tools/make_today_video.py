#!/usr/bin/env python3
"""
"Today on channel 1" (owner, 2026-10-08): channel 1 runs in half hours, a programme to :25 and :55 and then a
5-minute break: 60 seconds of ads, then this 4-minute video listing the whole day's programmes and news times
(docs/channel/test-schedule.json, slots at :26 and :56). Made each morning by .github/workflows/build-trailers.yml
after the day's lists are picked, and put on the channel-media pre-release under a fixed name (today.mp4).

The times come from tools/today_guide.mjs, which uses the same schedule rules as the TVs and the website.
Channel 1 is an Urdu channel: the headings and programme names are in Urdu (Noto Nastaliq Urdu); the show
titles stay as the TV channels write them. Music: a free-licence recording, credited on screen (tools/music).

Run: python3 tools/make_today_video.py out/today.mp4 [YYYY-MM-DD]
Needs node, Pillow with raqm, numpy and ffmpeg.
"""
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "music"))
from library import SR, bed, credit, save  # noqa: E402

W, H = 1280, 720
SECS = 240
PAGES = 8  # 3 hours a page, 30 seconds each
UR = os.path.join(HERE, "fonts", "NotoNastaliqUrdu.ttf")
LATIN = [("/usr/share/fonts/opentype/inter/Inter-Regular.otf", "/usr/share/fonts/opentype/inter/Inter-Bold.otf"),
         ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")]
REGULAR, BOLD = next(p for p in LATIN if os.path.exists(p[0]))
LOGO = os.path.join(HERE, "..", "docs", "channel", "logos", "bazaar-tv-square.png")

NEWS = {"news-headlines": "خبریں: اہم سرخیاں", "news-full": "تفصیلی خبریں"}
NAMES = {"drama": "ڈرامہ", "cooking": "کھانا پکائیں", "comedy": "مزاحیہ", "music": "نئے گانے", "trailers": "نئی فلموں کے ٹریلر"}


def font(path, size):
    f = ImageFont.truetype(path, size)
    if path == UR:
        f.set_variation_by_axes([700])
    return f


def urdu(d, x_right, y, text, f, fill):
    """Urdu text with its right edge at [x_right], its drawn top at [y]."""
    x0, y0, x1, y1 = d.textbbox((0, 0), text, font=f, direction="rtl", language="ur")
    d.text((x_right - x1, y - y0), text, font=f, fill=fill, direction="rtl", language="ur")


def fit(d, text, f, width):
    if d.textlength(text, font=f) <= width:
        return text
    while len(text) > 4 and d.textlength(text + "…", font=f) > width:
        text = text[:-1]
    return text.rstrip() + "…"


def show_name(title):
    """A short name from a YouTube title: the show and episode, without dates, sponsors and cast."""
    t = re.sub(r"^(?:new|full)\s+episode\s+\d+\s*[-|:]\s*", "", title, flags=re.I)
    m = re.search(r"episode\s*(\d+)|\bep\.?\s*(\d+)", title, re.I)
    name = re.split(r"\s+(?:[-|\[(]|episode\b|ep\b\.?)\s*|\s+by\s+|\s*\|\s*", t, maxsplit=1, flags=re.I)[0].strip(" -|")
    if m and not re.match(r"^(?:new|full)\s+episode", title, re.I):
        name += f" · Episode {m.group(1) or m.group(2)}"
    return name


def label_for(block_file, vid):
    try:
        d = json.load(open(os.path.join(HERE, "..", "docs", "channel", block_file), encoding="utf-8"))
    except OSError:
        return ""
    for v in d.get("videos", []) + d.get("spares", []):
        if v.get("id") == vid:
            return v.get("label", "")
    return ""


def rows_for(date):
    out = subprocess.run(["node", os.path.join(HERE, "today_guide.mjs")] + ([date] if date else []),
                         check=True, capture_output=True, text=True).stdout
    g = json.loads(out)
    rows = []
    for r in g["rows"]:
        hh, mm = map(int, r["at"].split(":"))
        when = datetime.time(hh, mm).strftime("%I:%M %p").lstrip("0")
        if r["kind"] == "news":
            rows.append(dict(hour=hh, when=when, urdu=NEWS.get(r["block"], "خبریں"), title="", news=True))
            continue
        kind = re.sub(r"-\d+$", "", r["block"])
        title = ""
        if kind in ("drama", "cooking"):
            title = show_name(r["title"])
        elif kind == "comedy":
            vid = r.get("id", "")[len(r["block"]) + 1:]
            title = label_for("block-comedy.json", vid) or show_name(r["title"])
            m = re.search(r"episode\s*(\d+)", r["title"], re.I)
            if m and "Episode" not in title:
                title += f" · Episode {m.group(1)}"
        name = NAMES.get(kind, r.get("name", ""))
        if r.get("resumed"):
            name += " (جاری)"
        rows.append(dict(hour=hh, when=when, urdu=name, title=title, news=False))
    return g, rows


def page(g, rows, n):
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):  # deep blue to purple, like the channel's idents
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(14 + 30 * t), int(22 + 6 * t), int(58 + 20 * t)))
    if os.path.exists(LOGO):
        lg = Image.open(LOGO).convert("RGBA").resize((86, 86))
        im.paste(lg, (48, 30), lg)
    urdu(d, W - 52, 34, "آج کے پروگرام", font(UR, 44), "#ffd84d")
    day = datetime.date.fromisoformat(g["date"])
    d.text((150, 44), day.strftime("%A %-d %B"), font=font(BOLD, 30), fill="white")
    first, last = n * 3, n * 3 + 3
    span = f"{datetime.time(first).strftime('%I %p').lstrip('0')} – " + \
           ("midnight" if last == 24 else datetime.time(last).strftime('%I %p').lstrip('0'))
    d.text((150, 84), f"{span}  ·  Toronto time  ·  page {n + 1} of {PAGES}", font=font(REGULAR, 22), fill="#c9d3ff")
    d.line([(48, 138), (W - 48, 138)], fill="#ffd84d", width=2)
    mine = [r for r in rows if first <= r["hour"] < last]
    y = 158
    step = min(58, (H - 225) // max(1, len(mine)))
    for r in mine:
        colour = "#ffd84d" if r["news"] else "white"
        d.text((60, y + 8), r["when"], font=font(BOLD, 26), fill=colour)
        urdu(d, W - 60, y + 4, r["urdu"], font(UR, 23), colour)
        if r["title"]:
            d.text((230, y + 12), fit(d, r["title"], font(REGULAR, 24), 640), font=font(REGULAR, 24), fill="#dfe5ff")
        y += step
    if not mine:
        urdu(d, W - 60, 200, "اس وقت کوئی پروگرام نہیں", font(UR, 30), "white")
    d.text((48, H - 44), "News every hour  ·  Full news at 12, 3, 6 and 9  ·  " + credit("calm"),
           font=font(REGULAR, 18), fill="#aab4e0")
    return im


def main():
    out = sys.argv[1]
    date = sys.argv[2] if len(sys.argv) > 2 else None
    g, rows = rows_for(date)
    tmp = tempfile.mkdtemp()
    lst = []
    for n in range(PAGES):
        p = os.path.join(tmp, f"p{n}.png")
        page(g, rows, n).save(p)
        lst.append(f"file '{p}'\nduration {SECS // PAGES}\n")
    lst.append(f"file '{p}'\n")  # the concat demuxer needs the last picture twice
    open(os.path.join(tmp, "list.txt"), "w").write("".join(lst))
    music = os.path.join(tmp, "music.wav")
    save(music, bed("calm", SECS, fade_in=1.0, fade_out=3.0) * 0.6)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", os.path.join(tmp, "list.txt"),
                    "-i", music, "-vf", "fps=25,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "26",
                    "-c:a", "aac", "-b:a", "128k", "-ar", str(SR), "-t", str(SECS), "-movflags", "+faststart", out], check=True)
    print(f"{out}: {len(rows)} programmes and news times for {g['date']}")


if __name__ == "__main__":
    main()
