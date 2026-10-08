"""Three SAMPLE weather segments for Bazaar TV News, for the owner to choose from (2026-10-08).

    python3 tools/news/weather_ideas.py out/ [--reader anchor-1f]
      -> out/weather-idea-1.mp4  Weather centre: presenter beside live cards (now, next 12 hours, 7 days)
         out/weather-idea-2.mp4  Map tour: Canada map then Pakistan map, city temperatures pop in
         out/weather-idea-3.mp4  Day planner: sunrise/sunset arc, wind compass, UV gauge, then the week's temperature graph

One presenter reads the whole segment in her (or his) own voice. Data: Open-Meteo (CC BY 4.0), maps: Natural Earth (public domain) and CARTO/OpenStreetMap tiles, all credited on screen.
"""
import json, math, os, subprocess, sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_news as N
from make_news import W, H, FPS, SR, text, font, deg, WMO, fetch, lower_bar

TEAL, GOLD, LIGHT, DIM = N.TEAL, N.GOLD, N.LIGHT, N.DIM
NAVY = (8, 16, 40, 235)
PK = [("اسلام آباد", 33.69, 73.05), ("لاہور", 31.55, 74.34), ("کراچی", 24.86, 67.01),
      ("پشاور", 34.01, 71.58), ("کوئٹہ", 30.18, 66.98), ("ملتان", 30.20, 71.47)]
CA = N.CITIES
DAYS = N.WEEKDAYS  # Monday first


# ---------- data ----------
def toronto():
    u = ("https://api.open-meteo.com/v1/forecast?latitude=43.65&longitude=-79.38"
         "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code"
         "&hourly=temperature_2m,precipitation_probability,weather_code"
         "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max"
         "&timezone=America%2FToronto&forecast_days=7")
    return json.loads(fetch(u, 30))


def many(cities):
    lat = ",".join(str(c[1]) for c in cities); lon = ",".join(str(c[2]) for c in cities)
    d = json.loads(fetch(f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
                         "&current=temperature_2m,weather_code&timezone=auto", 30))
    return [(c, round(x["current"]["temperature_2m"]), x["current"]["weather_code"]) for c, x in zip(cities, d)]


# ---------- drawing ----------
def ease(x):
    x = min(1.0, max(0.0, x)); return 1 - (1 - x) ** 3


def icon(d, code, cx, cy, s, t=0.0):
    """Simple weather symbols drawn by hand: sun, sun+cloud, cloud, rain, snow, thunder."""
    def sun(x, y, r):
        for k in range(8):
            a = k * math.pi / 4 + t * 0.6
            d.line([x + math.cos(a) * r * 1.25, y + math.sin(a) * r * 1.25, x + math.cos(a) * r * 1.65,
                    y + math.sin(a) * r * 1.65], fill=(255, 200, 40), width=max(2, int(r / 6)))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 205, 50))

    def cloud(x, y, w, col=(225, 232, 245)):
        h = w * 0.42
        d.ellipse([x - w * 0.5, y - h * 0.2, x - w * 0.05, y + h * 0.5], fill=col)
        d.ellipse([x - w * 0.28, y - h * 0.65, x + w * 0.22, y + h * 0.4], fill=col)
        d.ellipse([x, y - h * 0.35, x + w * 0.5, y + h * 0.5], fill=col)
        d.rectangle([x - w * 0.3, y + h * 0.05, x + w * 0.3, y + h * 0.5], fill=col)

    if code in (0, 1): sun(cx, cy, s * 0.32); return
    if code == 2: sun(cx - s * 0.15, cy - s * 0.15, s * 0.24); cloud(cx + s * 0.08, cy + s * 0.05, s * 0.75); return
    grey = (180, 190, 210) if code >= 51 else (225, 232, 245)
    cloud(cx, cy - s * 0.08, s * 0.85, grey)
    if 51 <= code <= 67 or 80 <= code <= 82:
        for k in range(3):
            x = cx - s * 0.22 + k * s * 0.22; ph = (t * 1.6 + k * 0.33) % 1
            y = cy + s * 0.18 + ph * s * 0.2
            d.line([x, y, x - s * 0.05, y + s * 0.12], fill=(90, 170, 255), width=max(2, int(s / 18)))
    elif 71 <= code <= 77 or code in (85, 86):
        for k in range(3):
            x = cx - s * 0.22 + k * s * 0.22; y = cy + s * 0.25 + ((t + k * 0.3) % 1) * s * 0.12
            d.ellipse([x - s * 0.04, y - s * 0.04, x + s * 0.04, y + s * 0.04], fill="white")
    elif code >= 95:
        d.polygon([(cx, cy + s * 0.1), (cx - s * 0.1, cy + s * 0.32), (cx, cy + s * 0.3), (cx - s * 0.06, cy + s * 0.5),
                   (cx + s * 0.12, cy + s * 0.22), (cx + s * 0.02, cy + s * 0.24)], fill=(255, 210, 40))


def bigtemp(d, x, y, v, size, anchor="mm", fill="white"):
    d.text((x, y), f"{v}°", font=font(True, size), fill=fill, anchor=anchor)


def header(d, title, sub=None):
    d.rounded_rectangle([W - 470, 40, W - 60, 92], 10, fill=TEAL)
    text(d, W - 265, 66, title, 28, "white", "m")
    if sub: text(d, W - 490, 66, sub, 24, LIGHT)


def credit(d, s):
    d.text((70, 585), s, font=font(False, 15), fill=DIM, anchor="lm")


# ---------- presenter window ----------
def presenter_filter(idx, box, crop):
    """ffmpeg filter for the presenter clip input [idx] placed in box=(x,y,w,h); crop=(cx,cy,cw,ch) on a 1280x720 frame."""
    x, y, w, h = box; cx, cy, cw, ch = crop
    return (f"[{idx}:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},crop={cw}:{ch}:{cx}:{cy},"
            f"scale={w}:{h},fps={FPS},setsar=1[p]"), x, y


# ---------- assemble ----------
def render(out, scenes, voice, presenter, box, crop, work, name):
    """scenes: [(narration, draw(d, t_in_scene, secs))]. Speaks each line, times each scene to its line,
    draws every frame over the moving background with the presenter in [box], and muxes the voice."""
    lines, durs = [], []
    for i, (say, _) in enumerate(scenes):
        a = N.speak(say, voice, os.path.join(work, f"{name}-v{i}"), False)
        lines.append(a); durs.append(len(a) / SR + 0.8)
    total = sum(durs) + 1.0
    track = np.zeros(int(SR * total) + SR, np.float32); t = 0.4
    for a, dsec in zip(lines, durs):
        k = int(t * SR); track[k:k + len(a)] += a; t += dsec
    N.write_wav(os.path.join(work, f"{name}.wav"), track[:int(SR * total)])
    bg = os.path.join(work, "bg.mp4")
    if not os.path.exists(bg): N.background(bg)
    pf, px, py = presenter_filter(2, box, crop)
    gfx = os.path.join(work, f"{name}-gfx.mov")
    p = subprocess.Popen(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba",
                          "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "qtrle", gfx], stdin=subprocess.PIPE)
    starts = np.cumsum([0.4] + durs)
    for f in range(int(total * FPS)):
        tt = f / FPS
        k = max(0, min(len(scenes) - 1, int(np.searchsorted(starts, tt, side="right")) - 1))
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        scenes[k][1](d, tt - starts[k], durs[k] if k < len(durs) else 1)
        if box:
            x, y, w, h = box
            d.rectangle([x - 4, y - 4, x + w + 3, y + h + 3], outline=TEAL, width=4)
            d.rectangle([x, y, x + w - 1, y + h - 1], fill=(0, 0, 0, 0))
        lower_bar(d, "موسم • بازار ٹی وی")
        p.stdin.write(im.tobytes())
    p.stdin.close(); p.wait()
    mp4 = os.path.join(out, f"{name}.mp4")
    N.run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-stream_loop", "-1", "-i", bg, "-i", gfx,
          "-stream_loop", "-1", "-i", presenter, "-i", os.path.join(work, f"{name}.wav"),
          "-filter_complex", f"{pf};[0:v][p]overlay={px}:{py}[a];[a][1:v]overlay=0:0,format=yuv420p[v]",
          "-map", "[v]", "-map", "3:a", "-t", f"{total:.2f}", "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast",
          "-crf", "22", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", mp4)
    print("made", mp4, f"{total:.0f} s")


# ---------- idea 1: weather centre ----------
def idea1(out, voice, presenter, work):
    w = toronto(); c = w["current"]; hr = w["hourly"]; dy = w["daily"]
    now_i = next(i for i, s in enumerate(hr["time"]) if s >= c["time"][:13])
    temps = [round(x) for x in hr["temperature_2m"][now_i:now_i + 12]]
    rain = [x or 0 for x in hr["precipitation_probability"][now_i:now_i + 12]]
    hcode = hr["weather_code"][now_i:now_i + 12]; hours = [int(s[11:13]) for s in hr["time"][now_i:now_i + 12]]
    import datetime as dt
    wd = [DAYS[dt.date.fromisoformat(s).weekday()] for s in dy["time"]]
    hi = [round(x) for x in dy["temperature_2m_max"]]; lo = [round(x) for x in dy["temperature_2m_min"]]
    warm, cold = int(np.argmax(hi)), int(np.argmin(lo))
    R = W - 60; L = 580

    def now_card(d, t, secs):
        header(d, "ٹورنٹو • ابھی")
        a = ease(t / 0.8)
        d.rounded_rectangle([L, 120, R, 570], 18, fill=NAVY)
        icon(d, c["weather_code"], L + 150, 260, 190 * a, t)
        bigtemp(d, R - 170, 250, round(c["temperature_2m"]), int(120 * a + 1))
        text(d, R - 40, 360, WMO.get(c["weather_code"], ""), 34, GOLD)
        for j, (lab, val) in enumerate([("محسوس", f"{round(c['apparent_temperature'])}°"),
                                        ("ہوا", f"{round(c['wind_speed_10m'])} km/h"),
                                        ("نمی", f"{c['relative_humidity_2m']}%")]):
            if t < 1.2 + j * 0.6: continue
            x0 = R - 30 - j * 205
            d.rounded_rectangle([x0 - 190, 420, x0, 540], 12, fill=(20, 40, 80, 240))
            text(d, x0 - 95, 450, lab, 24, (190, 205, 230), "m")
            d.text((x0 - 95, 505), val, font=font(True, 34), fill="white", anchor="mm")
        credit(d, "Open-Meteo.com (CC BY 4.0)")

    def hours_card(d, t, secs):
        header(d, "اگلے ۱۲ گھنٹے")
        d.rounded_rectangle([L, 120, R, 570], 18, fill=NAVY)
        lo_t, hi_t = min(temps) - 2, max(temps) + 2; cw = (R - L - 40) / 12
        for i in range(12):
            a = ease((t - i * 0.12) / 0.6)
            if a <= 0: continue
            x = R - 20 - (i + 0.5) * cw
            y = 470 - (temps[i] - lo_t) / max(1, hi_t - lo_t) * 200
            d.rounded_rectangle([x - cw * 0.3, 470 - (470 - y) * a, x + cw * 0.3, 470], 6, fill=(40, 120, 200, 255))
            d.text((x, y * a + 470 * (1 - a) - 22), f"{temps[i]}°", font=font(True, 20), fill="white", anchor="mm")
            icon(d, hcode[i], x, 175, 46, t)
            d.text((x, 225), f"{rain[i]}%", font=font(False, 15), fill=(120, 190, 255), anchor="mm")
            d.text((x, 500), f"{hours[i]:02d}:00", font=font(False, 15), fill=LIGHT, anchor="mm")
        text(d, R - 30, 545, "بارش کا امکان نیلے رنگ میں", 20, DIM)
        credit(d, "Open-Meteo.com (CC BY 4.0)")

    def week_card(d, t, secs):
        header(d, "اگلے سات دن")
        cw = (R - L) / 7
        for i in range(7):
            a = ease((t - i * 0.18) / 0.5)
            if a <= 0: continue
            x1 = R - i * cw; x0 = x1 - cw + 8; yo = (1 - a) * 60
            col = (60, 40, 20, 245) if i == warm else (20, 40, 80, 245) if i != cold else (15, 50, 90, 245)
            d.rounded_rectangle([x0, 130 + yo, x1, 560 + yo], 12, fill=col)
            xm = (x0 + x1) / 2
            text(d, xm, 165 + yo, "آج" if i == 0 else wd[i], 24, "white", "m")
            icon(d, dy["weather_code"][i], xm, 260 + yo, 70, t)
            bigtemp(d, xm, 360 + yo, hi[i], 34)
            bigtemp(d, xm, 420 + yo, lo[i], 26, fill=(150, 180, 220))
            d.text((xm, 480 + yo), f"{dy['precipitation_probability_max'][i] or 0}%", font=font(False, 18),
                   fill=(120, 190, 255), anchor="mm")
        credit(d, "Open-Meteo.com (CC BY 4.0)")

    scenes = [
        (f"السلام علیکم، بازار ٹی وی کے موسم مرکز میں خوش آمدید۔ ٹورنٹو میں اس وقت درجہ حرارت {deg(round(c['temperature_2m']))} ڈگری ہے، "
         f"لیکن محسوس {deg(round(c['apparent_temperature']))} ڈگری ہو رہا ہے، اور موسم {WMO.get(c['weather_code'], 'ملا جلا')} ہے۔ "
         f"ہوا کی رفتار {round(c['wind_speed_10m'])} کلومیٹر فی گھنٹہ اور نمی {c['relative_humidity_2m']} فیصد ہے۔", now_card),
        (f"اگلے بارہ گھنٹوں میں درجہ حرارت {deg(min(temps))} سے {deg(max(temps))} ڈگری کے درمیان رہے گا، "
         f"اور بارش کا امکان زیادہ سے زیادہ {max(rain)} فیصد ہے۔", hours_card),
        (f"اور اب اگلے سات دن۔ سب سے گرم دن {wd[warm]} ہوگا، {deg(hi[warm])} ڈگری کے ساتھ، "
         f"اور سب سے ٹھنڈی رات {wd[cold]} کو، {deg(lo[cold])} ڈگری۔ یہ تھا موسم کا حال، بازار ٹی وی کے ساتھ۔", week_card),
    ]
    render(out, scenes, voice, presenter, (60, 120, 480, 450), (400, 40, 480, 450 * 480 // 480), work, "weather-idea-1")


# ---------- idea 2: map tour ----------
def country_shapes(names):
    g = json.loads(fetch("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
                         "ne_50m_admin_0_countries.geojson", 60))
    out = {}
    for f in g["features"]:
        n = f["properties"].get("ADMIN")
        if n in names:
            geom = f["geometry"]
            polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
            out[n] = [p[0] for p in polys]
    return out


def make_proj(bbox, area):
    lon0, lat0, lon1, lat1 = bbox; x0, y0, x1, y1 = area
    k = math.cos(math.radians((lat0 + lat1) / 2))
    sx = (x1 - x0) / ((lon1 - lon0) * k); sy = (y1 - y0) / (lat1 - lat0); s = min(sx, sy)
    ox = x0 + ((x1 - x0) - (lon1 - lon0) * k * s) / 2; oy = y0 + ((y1 - y0) - (lat1 - lat0) * s) / 2
    return lambda lon, lat: (ox + (lon - lon0) * k * s, oy + (lat1 - lat) * s)


def idea2(out, voice, presenter, work):
    shapes = country_shapes({"Canada", "Pakistan", "United States of America", "India", "Afghanistan", "Iran", "China"})
    ca, pk = many(CA), many(PK)
    mx0, my0, mx1, my1 = 40, 100, 830, 590          # map window
    lx0, lx1 = 850, W - 40                           # city list on the right

    def map_scene(focus, bbox, others, cities, title):
        proj = make_proj(bbox, (mx0 + 20, my0 + 20, mx1 - 20, my1 - 20))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0)); md = ImageDraw.Draw(layer)
        md.rounded_rectangle([mx0, my0, mx1, my1], 16, fill=(10, 30, 60, 245))
        for n in others:
            for ring in shapes.get(n, []): md.polygon([proj(*p) for p in ring], fill=(28, 50, 80), outline=(60, 90, 130))
        for ring in shapes.get(focus, []): md.polygon([proj(*p) for p in ring], fill=(30, 95, 85), outline=(120, 220, 200))
        mask = Image.new("L", (W, H), 0); ImageDraw.Draw(mask).rounded_rectangle([mx0, my0, mx1, my1], 16, fill=255)
        clipped = Image.new("RGBA", (W, H), (0, 0, 0, 0)); clipped.paste(layer, (0, 0), mask)
        rh = (my1 - my0 - 20) / len(cities)

        def draw(d, t, secs):
            d._image.alpha_composite(clipped)
            header(d, title)
            d.rounded_rectangle([lx0, my0, lx1, my1], 16, fill=NAVY)
            for i, ((name, lat, lon), temp, code) in enumerate(cities):
                a = ease((t - 0.6 - i * 0.6) / 0.5)
                if a <= 0: continue
                x, y = proj(lon, lat)
                on = 0.6 + i * 0.6 <= t < 1.2 + (i + 1) * 0.6   # the newest city pulses on the map
                r = 7 + (4 * abs(math.sin(t * 6)) if on else 0)
                d.ellipse([x - r, y - r, x + r, y + r], fill=GOLD, outline="white")
                nw = N.line_len(d, N.tokens(name), N.fonts(20))
                text(d, x - 12 if lon < (bbox[0] + bbox[2]) / 2 else x + 12 + nw, y, name, 20, "white")
                y0 = my0 + 10 + i * rh; xo = (1 - a) * 80
                d.rounded_rectangle([lx0 + 10 + xo, y0 + 4, lx1 - 10 + xo, y0 + rh - 4], 10,
                                    fill=(30, 70, 120, 255) if on else (20, 40, 80, 240))
                text(d, lx1 - 26 + xo, y0 + rh / 2, name, 26, "white")
                icon(d, code, lx0 + 130 + xo, y0 + rh / 2, min(56, rh * 0.8), t)
                d.text((lx0 + 30 + xo, y0 + rh / 2), f"{temp}°", font=font(True, 32), fill="white", anchor="lm")
            credit(d, "Open-Meteo.com (CC BY 4.0) · Natural Earth")
        return draw

    scenes = [
        ("آئیے نقشے پر موسم دیکھتے ہیں۔ کینیڈا میں اس وقت " + "، ".join(f"{c[0]} {deg(t)}" for c, t, _ in ca) + " ڈگری ہے۔",
         map_scene("Canada", (-141, 41, -52, 70), ["United States of America"], ca, "کینیڈا • ابھی")),
        ("اور اب پاکستان۔ " + "، ".join(f"{c[0]} میں {deg(t)}" for c, t, _ in pk) + " ڈگری۔ یہ تھا نقشے پر موسم، بازار ٹی وی کے ساتھ۔",
         map_scene("Pakistan", (60.5, 23.5, 78.5, 37.3), ["India", "Afghanistan", "Iran", "China"], pk, "پاکستان • ابھی")),
    ]
    render(out, scenes, voice, presenter, (60, 410, 220, 156), (240, 20, 800, 568), work, "weather-idea-2")


# ---------- idea 3: day planner + week graph ----------
def idea3(out, voice, presenter, work):
    u = ("https://api.open-meteo.com/v1/forecast?latitude=43.65&longitude=-79.38"
         "&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code"
         "&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,weather_code"
         "&timezone=America%2FToronto&forecast_days=7")
    w = json.loads(fetch(u, 30)); c = w["current"]; dy = w["daily"]
    import datetime as dt
    wd = [DAYS[dt.date.fromisoformat(s).weekday()] for s in dy["time"]]
    hi = [round(x) for x in dy["temperature_2m_max"]]; lo = [round(x) for x in dy["temperature_2m_min"]]
    rise, sset = dy["sunrise"][0][11:16], dy["sunset"][0][11:16]
    mins = lambda hm: int(hm[:2]) * 60 + int(hm[3:])
    now_m = mins(c["time"][11:16]); day_frac = min(1, max(0, (now_m - mins(rise)) / max(1, mins(sset) - mins(rise))))
    uv = round(dy["uv_index_max"][0] or 0); wdir = c["wind_direction_10m"]; wspd = round(c["wind_speed_10m"])
    gust = round(c["wind_gusts_10m"])
    DIRS = ["شمال", "شمال مشرق", "مشرق", "جنوب مشرق", "جنوب", "جنوب مغرب", "مغرب", "شمال مغرب"]
    wname = DIRS[int((wdir + 22.5) % 360 // 45)]
    uvname = "کم" if uv < 3 else "درمیانہ" if uv < 6 else "زیادہ" if uv < 8 else "بہت زیادہ"

    def planner(d, t, secs):
        header(d, "آج کا دن • ٹورنٹو")
        cards = [(870, 100, W - 40, 590), (300, 100, 855, 340), (300, 350, 855, 590)]
        # sunrise / sunset arc with the sun moving to now
        x0, y0, x1, y1 = cards[0]; d.rounded_rectangle(cards[0], 16, fill=NAVY)
        text(d, x1 - 20, y0 + 34, "طلوع اور غروب آفتاب", 26, "white")
        cx, cy, r = (x0 + x1) / 2, y0 + 330, 130
        d.arc([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=(90, 110, 150), width=4)
        a = ease(t / 2.5) * day_frac; ang = math.pi * (1 - a)
        sx, sy = cx + r * math.cos(ang), cy - r * math.sin(ang)
        icon(d, 0, sx, sy, 70, t)
        d.line([x0 + 20, cy, x1 - 20, cy], fill=(90, 110, 150), width=2)
        d.text((cx - r, cy + 30), rise, font=font(True, 26), fill=GOLD, anchor="mm")
        d.text((cx + r, cy + 30), sset, font=font(True, 26), fill=(255, 140, 80), anchor="mm")
        text(d, cx - r + 30, cy + 75, "طلوع", 20, LIGHT, "m"); text(d, cx + r + 30, cy + 75, "غروب", 20, LIGHT, "m")
        # wind compass
        if t > 1.0:
            x0, y0, x1, y1 = cards[1]; d.rounded_rectangle(cards[1], 16, fill=NAVY)
            text(d, x1 - 20, y0 + 30, "ہوا", 24, "white")
            cx, cy, r = x0 + 90, y0 + 135, 70
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(90, 110, 150), width=3)
            for k, lab in enumerate("NESW"):
                aa = math.radians(k * 90 - 90)
                d.text((cx + (r - 14) * math.cos(aa), cy + (r - 14) * math.sin(aa)), lab, font=font(True, 14), fill=DIM, anchor="mm")
            aa = math.radians(wdir + 180 - 90 + 8 * math.sin(t * 2))   # arrow points where the wind blows to
            d.line([cx - 50 * math.cos(aa), cy - 50 * math.sin(aa), cx + 50 * math.cos(aa), cy + 50 * math.sin(aa)], fill=GOLD, width=5)
            hx, hy = cx + 50 * math.cos(aa), cy + 50 * math.sin(aa)
            d.polygon([(hx + 14 * math.cos(aa), hy + 14 * math.sin(aa)), (hx + 10 * math.cos(aa + 2.2), hy + 10 * math.sin(aa + 2.2)),
                       (hx + 10 * math.cos(aa - 2.2), hy + 10 * math.sin(aa - 2.2))], fill=GOLD)
            d.text((x1 - 20, y0 + 110), f"{wspd} km/h", font=font(True, 30), fill="white", anchor="rm")
            text(d, x1 - 20, y0 + 160, wname + " سے", 22, LIGHT)
            d.text((x1 - 20, y0 + 205), f"gusts {gust}", font=font(False, 18), fill=DIM, anchor="rm")
        # UV gauge
        if t > 2.0:
            x0, y0, x1, y1 = cards[2]; d.rounded_rectangle(cards[2], 16, fill=NAVY)
            text(d, x1 - 20, y0 + 30, "الٹرا وائلٹ", 24, "white")
            gx0, gx1, gy = x0 + 25, x1 - 25, y0 + 130
            cols = [(60, 170, 80), (230, 200, 40), (240, 130, 40), (220, 50, 50), (150, 70, 200)]
            for k, col in enumerate(cols):
                d.rectangle([gx0 + (gx1 - gx0) * k / 5, gy, gx0 + (gx1 - gx0) * (k + 1) / 5, gy + 22], fill=col)
            px = gx0 + (gx1 - gx0) * min(uv, 11) / 11 * ease((t - 2.0) / 1.0)
            d.polygon([(px, gy - 4), (px - 10, gy - 20), (px + 10, gy - 20)], fill="white")
            d.text((x0 + 60, gy + 80), str(uv), font=font(True, 48), fill="white", anchor="mm")
            text(d, x1 - 20, gy + 80, uvname, 28, GOLD)
        credit(d, "Open-Meteo.com (CC BY 4.0)")

    def graph(d, t, secs):
        header(d, "ہفتے کا رجحان")
        d.rounded_rectangle([300, 100, W - 40, 590], 16, fill=NAVY)
        x0, x1, y0, y1 = 370, W - 90, 190, 500
        lo_v, hi_v = min(lo) - 3, max(hi) + 3
        Y = lambda v: y1 - (v - lo_v) / max(1, hi_v - lo_v) * (y1 - y0)
        X = lambda i: x1 - i * (x1 - x0) / 6
        a = ease(t / 3.0) * 6
        for series, col in ((hi, (255, 150, 60)), (lo, (90, 170, 255))):
            pts = [(X(i), Y(series[i])) for i in range(7)]
            n = int(a); part = a - n
            line = pts[:n + 1] + ([(pts[n][0] + (pts[n + 1][0] - pts[n][0]) * part,
                                     pts[n][1] + (pts[n + 1][1] - pts[n][1]) * part)] if n < 6 else [])
            if len(line) > 1: d.line(line, fill=col, width=5, joint="curve")
            for i in range(min(7, n + 1)):
                x, y = pts[i]; d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=col)
                d.text((x, y - 22), f"{series[i]}°", font=font(True, 20), fill="white", anchor="mm")
        for i in range(7):
            text(d, X(i), 535, "آج" if i == 0 else wd[i], 22, LIGHT, "m")
            icon(d, dy["weather_code"][i], X(i), 140, 34, t)
        credit(d, "Open-Meteo.com (CC BY 4.0)")

    warm = int(np.argmax(hi))
    scenes = [
        (f"آج ٹورنٹو میں سورج {rise} پر طلوع ہوا اور {sset} پر غروب ہوگا۔ ہوا {wname} سے {wspd} کلومیٹر فی گھنٹہ کی رفتار سے چل رہی ہے، "
         f"اور جھونکے {gust} تک جا سکتے ہیں۔ الٹرا وائلٹ انڈیکس {uv} ہے، یعنی {uvname}۔", planner),
        (f"اور یہ ہے اس ہفتے کا رجحان۔ نارنجی لکیر دن کا زیادہ سے زیادہ اور نیلی لکیر رات کا کم سے کم درجہ حرارت ہے۔ "
         f"سب سے گرم دن {wd[warm]} ہوگا، {deg(hi[warm])} ڈگری۔ یہ تھا موسم کا حال، بازار ٹی وی کے ساتھ۔", graph),
    ]
    render(out, scenes, voice, presenter, (60, 100, 210, 490), (500, 20, 280, 653), work, "weather-idea-3")


def main():
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    rid = sys.argv[sys.argv.index("--reader") + 1] if "--reader" in sys.argv else "anchor-1f"
    people = {p["id"]: p for p in json.load(open(os.path.join(N.HERE, "presenters", "presenters.json")))["moving"]["people"]}
    voice = N.VOICE_B if people.get(rid, {}).get("voice") == N.VOICE_B else N.VOICE_A
    presenter = os.path.join(N.HERE, "presenters", "clips", f"{rid}.mp4")
    work = os.path.join(out, "work-weather"); os.makedirs(work, exist_ok=True)
    for f in (idea1, idea2, idea3):
        try: f(out, voice, presenter, work)
        except Exception as e:
            import traceback; traceback.print_exc(); print("idea failed", f.__name__, e)


if __name__ == "__main__":
    main()
