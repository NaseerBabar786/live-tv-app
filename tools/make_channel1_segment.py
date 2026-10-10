#!/usr/bin/env python3
"""
Channel 1's 5-minute segment (the owner's rule, 2026-10-08): it plays at :25 and :55 every hour, between
the halves of the programmes (tools/build_channel1_set.py books it). 300 seconds:

    0:00  "break" ident                     5 s
    0:05  ads: NextGen Cable Ad 7               60 s
    1:05  Today on channel 1               60 s   every programme of the 8-hour set and its three times today
    2:05  weather                          60 s   Toronto, Lahore, Karachi, Delhi, Mumbai: now, today's high and low
    3:05  ads: Ad 8, Advertise here, Ad 9  60 s
    4:05  NextGen Cable tips                    47 s
    4:52  "coming up" ident                 8 s

Made every hour by .github/workflows/build-channel1-segment.yml, so the weather is fresh, and put on the
channel-media pre-release under a fixed name (segment.mp4). Channel 1 is an Urdu channel, and every writing
on it shows Urdu (Noto Nastaliq Urdu) and English together (owner, 2026-10-09). Weather: Open-Meteo (free, no key). Music under the pages: a
free-licence recording, credited on screen (tools/music).

Run: python3 tools/make_channel1_segment.py out/segment.mp4 [YYYY-MM-DD]
Needs node, Pillow with raqm, numpy and ffmpeg.
"""
import datetime as dt
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, "music"))
from library import SR, bed, credit, save  # noqa: E402

W, H = 1280, 720
UR = os.path.join(HERE, "fonts", "NotoNastaliqUrdu.ttf")
LATIN = [("/usr/share/fonts/opentype/inter/Inter-Regular.otf", "/usr/share/fonts/opentype/inter/Inter-Bold.otf"),
         ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")]
REGULAR, BOLD = next(p for p in LATIN if os.path.exists(p[0]))
LOGO = os.path.join(ROOT, "docs", "channel", "logos", "spark-tv-square.png")
MEDIA = os.path.join(ROOT, "docs", "media")
CLIPS = os.path.join(ROOT, "docs", "channel", "media")
CITIES = [("ٹورنٹو", "Toronto", 43.65, -79.38, "America/Toronto"), ("لاہور", "Lahore", 31.55, 74.34, "Asia/Karachi"),
          ("کراچی", "Karachi", 24.86, 67.01, "Asia/Karachi"), ("دہلی", "Delhi", 28.61, 77.21, "Asia/Kolkata"),
          ("ممبئی", "Mumbai", 19.08, 72.88, "Asia/Kolkata")]
# WMO weather codes (Open-Meteo) in Urdu and English.
SKY = [((0,), "صاف آسمان، دھوپ", "Clear, sunny"), ((1, 2), "کہیں کہیں بادل", "Some clouds"), ((3,), "بادل", "Cloudy"),
       ((45, 48), "دھند", "Fog"), ((51, 53, 55, 56, 57), "ہلکی بوندا باندی", "Light drizzle"), ((61, 63, 80, 81), "بارش", "Rain"),
       ((65, 82), "تیز بارش", "Heavy rain"), ((66, 67), "ٹھنڈی بارش", "Freezing rain"),
       ((71, 73, 75, 77, 85, 86), "برف باری", "Snow"), ((95, 96, 99), "گرج چمک کے ساتھ بارش", "Thunderstorms")]


def font(path, size):
    f = ImageFont.truetype(path, size)
    if path == UR:
        f.set_variation_by_axes([700])
    return f


def urdu(d, x_right, y, text, f, fill):
    x0, y0, x1, y1 = d.textbbox((0, 0), text, font=f, direction="rtl", language="ur")
    d.text((x_right - x1, y - y0), text, font=f, fill=fill, direction="rtl", language="ur")


def fit(d, text, f, width):
    if d.textlength(text, font=f) <= width:
        return text
    while len(text) > 4 and d.textlength(text + "…", font=f) > width:
        text = text[:-1]
    return text.rstrip() + "…"


def background(heading, sub):
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(14 + 30 * t), int(22 + 6 * t), int(58 + 20 * t)))
    if os.path.exists(LOGO):
        lg = Image.open(LOGO).convert("RGBA").resize((86, 86))
        im.paste(lg, (48, 30), lg)
    urdu(d, W - 52, 34, heading, font(UR, 44), "#ffd84d")
    d.text((150, 52), sub, font=font(BOLD, 28), fill="white")
    d.line([(48, 138), (W - 48, 138)], fill="#ffd84d", width=2)
    d.text((48, H - 40), "Spark TV · channel 1 on NextGen Cable  ·  " + credit("calm"), font=font(REGULAR, 17), fill="#aab4e0")
    return im, d


def clock(hhmm):
    h, m = map(int, hhmm.split(":"))
    return dt.time(h, m).strftime("%I:%M %p").lstrip("0").replace(":00 ", " ").lower()


def today_page(day):
    s = json.load(open(os.path.join(ROOT, "docs", "channel", "channel1-set.json"), encoding="utf-8"))
    out = subprocess.run(["node", os.path.join(HERE, "today_guide.mjs"), day.isoformat()], check=True,
                         capture_output=True, text=True).stdout
    times = {}
    for r in json.loads(out)["rows"]:
        if r.get("id") and not r.get("resumed"):
            times.setdefault(r["id"], []).append(r["at"])
    im, d = background("آج چینل 1 پر", "Today on channel 1  ·  " + day.strftime("%A %-d %B"))
    y = 150
    for h in s["hours"]:
        progs = h["programmes"]
        if not progs:
            continue
        at = "  ·  ".join(clock(t) for t in times.get(progs[0]["id"], [])[:3])
        urdu(d, W - 60, y + 2, " اور ".join(p["urdu"] for p in progs), font(UR, 24), "white")
        d.text((60, y + 6), at, font=font(BOLD, 24), fill="#ffd84d")
        d.text((60, y + 36), fit(d, " + ".join(p["title"] for p in progs), font(REGULAR, 18), 760), font=font(REGULAR, 18), fill="#c9d3ff")
        y += 56
    # The six full-news times in Latin figures, so none of them reads as a single "12, 4, 8".
    urdu(d, W - 60, y + 2, "تفصیلی خبریں  ·  باقی ہر گھنٹے اہم سرخیاں", font(UR, 22), "#9fe3ff")
    d.text((60, y + 8), "Full news: 12 am · 4 am · 8 am · 12 pm · 4 pm · 8 pm", font=font(BOLD, 22), fill="#9fe3ff")
    return im


def forecast(url, tries=3):
    """Open-Meteo's answer; it sometimes drops one city's request, so each is asked up to three times."""
    for n in range(tries):
        try:
            return json.load(urllib.request.urlopen(url, timeout=20))
        except Exception:  # noqa: BLE001
            if n == tries - 1:
                raise
            time.sleep(3 * (n + 1))


def weather_page():
    """The weather page, or None when no city's weather could be fetched."""
    im, d = background("موسم", "Weather now  ·  today's high and low")
    y, got = 170, 0
    for ur, name, lat, lon, tz in CITIES:
        sky, sky_en, now, hi, lo, local = "", "", "–", "–", "–", ""
        try:
            url = (f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,weather_code"
                   f"&daily=temperature_2m_max,temperature_2m_min&timezone={tz}&forecast_days=1")
            w = forecast(url)
            code = w["current"]["weather_code"]
            sky, sky_en = next(((t, e) for codes, t, e in SKY if code in codes), ("", ""))
            now = f"{round(w['current']['temperature_2m'])}°"
            hi, lo = round(w["daily"]["temperature_2m_max"][0]), round(w["daily"]["temperature_2m_min"][0])
            local = dt.datetime.fromisoformat(w["current"]["time"]).strftime("%I:%M %p").lstrip("0").lower()
            got += 1
        except Exception as e:  # noqa: BLE001
            print(f"weather {name}: {e}", file=sys.stderr)
        urdu(d, W - 60, y, ur, font(UR, 30), "white")
        urdu(d, W - 260, y + 4, sky, font(UR, 24), "#c9d3ff")
        d.text((60, y + 2), now, font=font(BOLD, 44), fill="#ffd84d")
        d.text((180, y + 6), f"{hi}° / {lo}°", font=font(BOLD, 26), fill="white")
        d.text((180, y + 40), f"{name}  ·  {local}" + (f"  ·  {sky_en}" if sky_en else ""), font=font(REGULAR, 18), fill="#aab4e0")
        y += 92
    return im if got else None


def tips_page():
    im, d = background("نیکسٹ جین کیبل", "NextGen Cable tips")
    lines = [("مفت پیکج: تمام چینل، ون پلس لسٹ میں", "Free package: every channel, in 1+List", "white"),
             ("گولڈ: ہر فیچر، ہر لے آؤٹ، گیمز اور موسم", "Gold: every feature, every layout, games and weather", "#ffd84d"),
             ("ہمارے دوسرے چینل: ڈرامے، فلمیں، موسیقی، کھیل، کھانا", "Our other channels: dramas, films, music, sports, cooking", "white"),
             ("اپنا اشتہار دیں: واٹس ایپ پر رابطہ کریں", "Advertise with us: message us on WhatsApp", "#9fe3ff")]
    y = 160
    for text, english, colour in lines:
        urdu(d, W - 70, y, text, font(UR, 30), colour)
        d.text((W - 70, y + 80), english, font=font(REGULAR, 22), fill=colour, anchor="ra")
        y += 112
    d.text((70, H - 110), "WhatsApp 437 602 6500  ·  tv.bulkbazaar.ca", font=font(BOLD, 30), fill="white")
    return im


def still(im, secs, path, tmp):
    png = os.path.join(tmp, os.path.basename(path) + ".png")
    im.save(png)
    music = os.path.join(tmp, os.path.basename(path) + ".wav")
    save(music, bed("calm", secs, fade_in=0.8, fade_out=1.2) * 0.6)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", str(secs), "-i", png, "-i", music,
                    "-vf", f"fps=25,fade=t=in:st=0:d=0.4,fade=t=out:st={secs - 0.4}:d=0.4,format=yuv420p", "-t", str(secs),
                    "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-c:a", "aac", "-ar", str(SR), path], check=True)
    return path


def main():
    out = sys.argv[1]
    day = dt.date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else dt.date.today()
    tmp = tempfile.mkdtemp()
    parts = [os.path.join(CLIPS, "ident-break.mp4"), os.path.join(MEDIA, "cable-tv-video-ad-7.mp4"),
             still(today_page(day), 60, os.path.join(tmp, "today.mp4"), tmp),
             # No weather to show (the service didn't answer): the tips stay up a minute longer instead.
             still(weather_page() or tips_page(), 60, os.path.join(tmp, "weather.mp4"), tmp),
             os.path.join(CLIPS, "ad-break-c.mp4"),
             still(tips_page(), 47, os.path.join(tmp, "tips.mp4"), tmp),
             os.path.join(CLIPS, "ident-coming-up.mp4")]
    inputs, chains = [], []
    for i, p in enumerate(parts):
        inputs += ["-i", p]
        chains.append(f"[{i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,"
                      f"fps=25,setsar=1,format=yuv420p[v{i}];[{i}:a]aresample={SR},aformat=channel_layouts=stereo[a{i}]")
    joined = "".join(f"[v{i}][a{i}]" for i in range(len(parts)))
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex",
                    ";".join(chains) + f";{joined}concat=n={len(parts)}:v=1:a=1[v][a]", "-map", "[v]", "-map", "[a]",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-c:a", "aac", "-b:a", "128k",
                    "-movflags", "+faststart", "-t", "300", out], check=True)
    print(f"{out}: channel 1's 5-minute segment for {day}")


if __name__ == "__main__":
    main()
