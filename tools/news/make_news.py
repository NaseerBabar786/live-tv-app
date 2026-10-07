"""Makes the Bazaar TV News bulletins (1280x720 MP4) from public news headlines.

Usage: python3 tools/news/make_news.py <out dir> [--kind headlines|full|auto] [--hour H]
                                       [--stories file.json] [--offline]

Two bulletins, each always EXACTLY the same length so the channel schedule never has to change:
  headlines  3 minutes  (news-headlines.mp4), every hour
  full      10 minutes  (news-full.mp4), every three hours (00, 03, 06 ... Toronto time)
--kind auto (the default) makes the one due at the next full hour in Toronto.

How it works:
  1. reads the newest headlines from public RSS feeds (CBC, Global News, CityNews,
     BBC, Al Jazeera, UN News),
  2. writes our OWN short news-reader script from them (GitHub Models, free with the workflow's
     token; if that fails, a plain "<source> reports: <headline>" line), always naming the source,
  3. reads it with Microsoft Edge's free Canadian neural voices (edge-tts),
  4. draws our own news graphics (no pictures or video from other broadcasters), adds music made
     here, and Toronto + Canada weather from Open-Meteo (CC BY 4.0) in the full report.
The top corners and the bottom strip stay free for the app's channel number, logo and ticker.
--offline skips the internet (silent voice, sample stories) to check the layout.
Needs ffmpeg, numpy, Pillow and (online) edge-tts.
"""
import asyncio, datetime as dt, email.utils, html, json, math, os, re, subprocess, sys, time
import urllib.request, wave
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, SR = 1280, 720, 25, 44100
TZ = ZoneInfo("America/Toronto")
HERE = os.path.dirname(os.path.abspath(__file__))
LENGTH = {"headlines": 180, "full": 600}
NAME = {"headlines": "HEADLINES", "full": "THE FULL REPORT"}
VOICE_A, VOICE_B, RATE = "en-CA-ClaraNeural", "en-CA-LiamNeural", "+4%"
UA = {"User-Agent": "Mozilla/5.0 (compatible; BazaarTV-News/1.0; +https://tv.bulkbazaar.ca)"}
NOTES = []  # what worked and what failed, saved in news-<kind>.json for checking

FEEDS = {
    "canada": [
        ("CBC News", "https://www.cbc.ca/cmlink/rss-canada"),
        ("Global News", "https://globalnews.ca/canada/feed/"),
        ("CityNews", "https://toronto.citynews.ca/feed/"),
        ("Global News", "https://globalnews.ca/politics/feed/"),
    ],
    "world": [
        ("BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml"),
        ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
        ("UN News", "https://news.un.org/feed/subscribe/en/news/all/rss.xml"),
        ("Global News", "https://globalnews.ca/world/feed/"),
        ("CBC News", "https://www.cbc.ca/cmlink/rss-world"),
    ],
}
# How many stories each bulletin tries to fit (the fitting step drops the last ones if too long).
WANT = {"headlines": {"canada": 6, "world": 6}, "full": {"canada": 12, "world": 12}}
CITIES = [("Toronto", 43.65, -79.38), ("Vancouver", 49.28, -123.12), ("Calgary", 51.05, -114.07),
          ("Montreal", 45.50, -73.57), ("Ottawa", 45.42, -75.70), ("Halifax", 44.65, -63.58)]

def font(bold, size):
    names = ["DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"] if bold else ["DejaVuSans.ttf", "LiberationSans-Regular.ttf"]
    for root in ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/truetype/liberation",
                 "/usr/share/fonts/truetype/liberation2"]:
        for n in names:
            p = os.path.join(root, n)
            if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)

def brand_font(size):
    return ImageFont.truetype(os.path.join(HERE, "..", "fonts", "Poppins-BlackItalic.ttf"), size)

def run(*cmd):
    subprocess.run(cmd, check=True)

def fetch(url, timeout=15):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

# ---------- news ----------
def clean(s):
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    return re.sub(r"\s+", " ", s).strip()

def parse_feed(data, source):
    root = ET.fromstring(data)
    out = []
    items = root.iter("item")
    atom = "{http://www.w3.org/2005/Atom}"
    found = list(items) or list(root.iter(atom + "entry"))
    for it in found:
        g = lambda tag: (it.findtext(tag) or it.findtext(atom + tag) or "")
        title, desc = clean(g("title")), clean(g("description") or g("summary"))
        when = None
        for tag in ("pubDate", "published", "updated"):
            v = g(tag)
            if not v: continue
            try:
                when = email.utils.parsedate_to_datetime(v)
            except Exception:
                try: when = dt.datetime.fromisoformat(v.replace("Z", "+00:00"))
                except Exception: pass
            if when: break
        if re.search(r"media advisory|will make an announcement|to make an announcement|^statement by", title, re.I):
            continue
        if title and len(title) > 15:
            out.append({"title": title, "desc": desc, "source": source,
                        "when": when.timestamp() if when else None})
    return out

def words(s):
    return {w for w in re.findall(r"[a-z]{4,}", s.lower())}

def same_story(a, b):
    x, y = words(a["title"]), words(b["title"])
    return bool(x and y) and len(x & y) / min(len(x), len(y)) >= 0.5

def gather(kind):
    now = time.time()
    picked = {}
    seen = []
    for section, feeds in FEEDS.items():
        lists = []
        for source, url in feeds:
            try:
                items = parse_feed(fetch(url), source)
                # Fresh stories only (last 18 hours) when the feed gives dates.
                items = [s for s in items if not s["when"] or now - s["when"] < 18 * 3600]
                print(f"{source} {url}: {len(items)} stories"); NOTES.append(f"{url}: {len(items)}")
                lists.append(items)
            except Exception as e:
                print("feed failed", url, e); NOTES.append(f"{url}: failed {e}")
        # Take stories in turn from each feed, so one source doesn't fill the bulletin.
        out, i = [], 0
        while len(out) < WANT[kind][section] + 3 and any(i < len(l) for l in lists):
            for l in lists:
                if i < len(l) and not any(same_story(l[i], s) for s in seen):
                    out.append(dict(l[i], section=section)); seen.append(l[i])
            i += 1
        picked[section] = out
    return picked

PROMPT = """You write scripts for a short TV news bulletin on Bazaar TV, a free Canadian channel.
For each story below, write in your OWN words (do not copy sentences):
- "headline": an on-screen headline of at most 9 words,
- "read": what the news reader says: {length}. Start by naming the source, e.g. "CBC News reports that ..." or "According to BBC News, ...".
Rules: use only the facts in the given text, no opinions, guesses or added details; calm, neutral, plain English;
write numbers as a reader would say them; no emojis, no markdown.
Reply with JSON only: {{"stories": [{{"headline": "...", "read": "..."}}, ...]}} in the same order, one entry per story.

Stories:
{stories}"""

def write_script(stories, kind):
    """Our own wording, a few stories per request (each request stays small for the free limits)."""
    plain(stories, kind)
    for i in range(0, len(stories), 6):
        ai_script(stories[i:i + 6], kind)
    NOTES.append(f"AI wording: {sum(bool(s.get('ai')) for s in stories)} of {len(stories)}")

def plain(stories, kind):
    """The plain attributed line each story keeps when the AI wording fails."""
    for s in stories:
        first = re.split(r"(?<=[.!?])\s+", s["desc"])[0] if s["desc"] else ""
        if len(first.split()) > 35: first = " ".join(first.split()[:35]) + "."
        s["headline"] = s["title"]
        s["read"] = f"{s['source']} reports: {s['title'].rstrip('.')}." + (f" {first}" if kind == "full" and first else "")

def ai_script(stories, kind):
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token or not stories or "GitHub Models failed" in " ".join(NOTES): return
    length = "one sentence of 20 to 30 words" if kind == "headlines" else "two or three sentences, 45 to 70 words"
    body = "\n".join(f"{i + 1}. [{s['source']}] {s['title']} -- {s['desc'][:600]}" for i, s in enumerate(stories))
    req = {"model": os.environ.get("NEWS_MODEL", "openai/gpt-4.1-mini"), "temperature": 0.3,
           "response_format": {"type": "json_object"},
           "messages": [{"role": "user", "content": PROMPT.format(length=length, stories=body)}]}
    text = ""
    for attempt in range(3):
        try:
            r = urllib.request.Request("https://models.github.ai/inference/chat/completions",
                                       data=json.dumps(req).encode(), method="POST",
                                       headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                                "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
                                                "User-Agent": "BazaarTV-News/1.0"})
            with urllib.request.urlopen(r, timeout=120) as resp:
                raw = resp.read().decode(errors="replace")
                text = f"{resp.status} {resp.geturl()} {raw}"
            text = json.loads(raw)["choices"][0]["message"]["content"] or ""
            text = re.sub(r"^```(json)?|```$", "", text.strip()).strip()
            got = json.loads(text)["stories"]
            if len(got) != len(stories): raise ValueError(f"{len(got)} stories back for {len(stories)}")
            for s, g in zip(stories, got):
                h, rd = clean(g.get("headline", "")), clean(g.get("read", ""))
                if 3 <= len(h.split()) <= 14 and 8 <= len(rd.split()) <= 110:
                    s["headline"], s["read"], s["ai"] = h, rd, True
            return
        except Exception as e:
            detail = e.read().decode(errors="replace")[:300] if hasattr(e, "read") else repr(text[:300])
            print("GitHub Models failed", attempt, e, detail)
            NOTES.append(f"AI try {attempt}: {e} {detail}")
            if attempt == 2: NOTES.append("GitHub Models failed")
            time.sleep(10 * (attempt + 1))

# ---------- weather (Open-Meteo, CC BY 4.0) ----------
WMO = {0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "cloudy", 45: "foggy", 48: "foggy",
       51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
       61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
       71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains", 80: "showers", 81: "showers",
       82: "heavy showers", 85: "snow showers", 86: "heavy snow showers", 95: "thunderstorms",
       96: "thunderstorms with hail", 99: "thunderstorms with hail"}

def weather():
    lat = ",".join(str(c[1]) for c in CITIES); lon = ",".join(str(c[2]) for c in CITIES)
    url = (f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
           "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code"
           "&timezone=America%2FToronto&forecast_days=2")
    data = json.loads(fetch(url))
    if isinstance(data, dict): data = [data]
    out = []
    for (name, *_), d in zip(CITIES, data):
        out.append({"city": name, "now": round(d["current"]["temperature_2m"]), "code": d["current"]["weather_code"],
                    "hi": [round(x) for x in d["daily"]["temperature_2m_max"]],
                    "lo": [round(x) for x in d["daily"]["temperature_2m_min"]],
                    "dcode": d["daily"]["weather_code"]})
    return out

def deg(n):
    return f"minus {abs(n)}" if n < 0 else str(n)

def weather_words(w, short):
    t = w[0]
    s = f"In Toronto right now it's {deg(t['now'])} degrees and {WMO.get(t['code'], 'mixed')}."
    if short: return s
    s += (f" Today's high is {deg(t['hi'][0])}, with a low of {deg(t['lo'][0])}."
          f" Tomorrow, {WMO.get(t['dcode'][1], 'mixed')}, with a high of {deg(t['hi'][1])}.")
    s += " Across the country right now: " + ", ".join(f"{c['city']} {deg(c['now'])}" for c in w[1:]) + "."
    return "Now the weather. " + s

# ---------- voice ----------
def write_wav(path, samples):
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())

def read_wav(path):
    with wave.open(path, "rb") as f:
        return np.frombuffer(f.readframes(f.getnframes()), dtype="<i2").astype(np.float32) / 32767

async def _tts(text, voice, path):
    import edge_tts
    await edge_tts.Communicate(text, voice, rate=RATE).save(path)

def speak(text, voice, base, offline):
    wav = base + ".wav"
    if offline:
        write_wav(wav, np.zeros(int(SR * (0.5 + len(text) * 0.062)), np.float32))
        return read_wav(wav)
    for attempt in range(5):
        try:
            asyncio.run(_tts(text, voice, base + ".mp3"))
            if os.path.getsize(base + ".mp3") > 1000: break
        except Exception as e:
            print("voice retry", attempt, e)
        time.sleep(5 * (attempt + 1))
    else:
        raise SystemExit("Voice failed for: " + text)
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", base + ".mp3", "-ac", "1", "-ar", str(SR), wav)
    return read_wav(wav)

# ---------- music (made here, free to use) ----------
def tone(f, n, decay=0.0):
    t = np.arange(n) / SR
    w = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.15 * np.sin(6 * np.pi * f * t)
    return w * (np.exp(-t * decay) if decay else 1)

def sting(secs=6.0):
    """A bright news opening: rising notes, a low hit on each beat, a held chord."""
    n = int(SR * secs); out = np.zeros(n, np.float32); beat = 0.42
    notes = [293.66, 369.99, 440.0, 587.33, 739.99, 880.0]
    for i, f in enumerate(notes):
        a = int(i * beat / 2 * SR); out[a:a + int(SR * 0.9)] += 0.5 * tone(f, min(int(SR * 0.9), n - a), 4)
    for k in range(int(secs / beat)):
        a = int(k * beat * SR); m = min(int(SR * 0.5), n - a)
        t = np.arange(m) / SR
        out[a:a + m] += (0.9 if k % 4 == 0 else 0.45) * np.sin(2 * np.pi * (70 - 30 * t) * t) * np.exp(-t * 9)
    a = int(SR * 2.6)
    for f in (293.66, 369.99, 440.0, 587.33):
        out[a:] += 0.22 * tone(f, n - a, 0.6)
    fade = int(SR * 0.8); out[-fade:] *= np.linspace(1, 0, fade)
    return out / max(1e-6, np.abs(out).max())

def bed(secs):
    """A quiet pulsing bed under the reader (loops cleanly every 8 bars)."""
    n = int(SR * secs); t = np.arange(n) / SR; out = np.zeros(n, np.float32)
    chords = [[146.83, 220.0, 293.66], [130.81, 196.0, 261.63], [116.54, 174.61, 233.08], [130.81, 196.0, 261.63]]
    bar = 2.0
    for k in range(int(secs // bar) + 1):
        a, b = int(k * bar * SR), min(n, int((k + 1) * bar * SR))
        if a >= b: continue
        tt = t[a:b] - k * bar
        pulse = 0.6 + 0.4 * (np.cos(2 * np.pi * tt * 2) > 0.3)
        for f in chords[k % 4]:
            out[a:b] += pulse * np.sin(2 * np.pi * f * tt) / 3
        out[a:b] += 0.5 * np.sin(2 * np.pi * chords[k % 4][0] / 2 * tt) * np.exp(-tt * 3)
    # smooth the bar joins
    out = np.convolve(out, np.ones(64) / 64, mode="same")
    return out / max(1e-6, np.abs(out).max())

# ---------- graphics ----------
RED, BLUE, TEAL, GOLD = (210, 30, 45), (25, 110, 220), (20, 150, 140), (245, 190, 40)
SECTION = {"canada": ("CANADA", RED), "world": ("WORLD", BLUE), "weather": ("WEATHER", TEAL)}

def background(path, secs=8):
    """A slowly moving dark blue studio background that loops every [secs] seconds."""
    w, h = 640, 360
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    base = np.stack([np.full((h, w), 8), 14 + 20 * y / h, 38 + 40 * y / h], -1)
    p = subprocess.Popen(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                          "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-", "-vf", f"scale={W}:{H}:flags=bicubic",
                          "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", path],
                         stdin=subprocess.PIPE)
    frames = secs * FPS
    for i in range(frames):
        a = 2 * np.pi * i / frames
        img = base.copy()
        for cx, cy, r, col, ph in [(0.25, 0.4, 170, (30, 70, 160), 0), (0.75, 0.6, 200, (120, 20, 50), 2),
                                   (0.5, 0.2, 140, (20, 110, 150), 4)]:
            px = w * (cx + 0.12 * math.cos(a + ph)); py = h * (cy + 0.1 * math.sin(a + ph))
            g = np.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * r * r))[..., None]
            img += g * np.array(col, np.float32) * 0.8
        # faint moving lines, like a world grid
        lines = (np.abs(((x + i * w / frames) % 40) - 20) < 0.6) | (np.abs((y % 40) - 20) < 0.6)
        img[lines] += 10
        p.stdin.write(np.clip(img, 0, 255).astype(np.uint8).tobytes())
    p.stdin.close(); p.wait()

def wrap(d, text, f, width, max_lines):
    out, line = [], ""
    for wd in text.split():
        t = (line + " " + wd).strip()
        if d.textlength(t, font=f) <= width: line = t
        else:
            if line: out.append(line)
            line = wd
    if line: out.append(line)
    if len(out) > max_lines:
        out = out[:max_lines]
        while d.textlength(out[-1] + "…", font=f) > width and " " in out[-1]:
            out[-1] = out[-1].rsplit(" ", 1)[0]
        out[-1] += "…"
    return out

def lower_bar(d, label):
    # y 606-654: free bottom strip below it stays clear for the app's ticker.
    d.rectangle([70, 606, 370, 654], fill=RED)
    d.text((88, 611), "BAZAAR TV NEWS", font=brand_font(28), fill="white")
    d.rectangle([370, 606, 1210, 654], fill=(245, 245, 248))
    d.text((392, 617), label, font=font(True, 24), fill=(20, 25, 45))

def card(path, label, section, headline, body, source, count):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    name, col = SECTION[section]
    d.rounded_rectangle([70, 108, 1210, 590], 18, fill=(8, 16, 40, 225))
    d.rectangle([70, 126, 80, 572], fill=col)
    pill = font(True, 24)
    pw = d.textlength(name, font=pill) + 36
    d.rounded_rectangle([110, 132, 110 + pw, 172], 8, fill=col)
    d.text((128, 137), name, font=pill, fill="white")
    if count: d.text((1180 - d.textlength(count, font=font(False, 22)), 140), count, font=font(False, 22), fill=(170, 185, 215))
    size = 50
    while True:
        hf = font(True, size); lines = wrap(d, headline, hf, 1060, 3)
        if len(lines) <= 2 or size <= 40: break
        size -= 4
    y = 192
    for ln in lines:
        d.text((110, y), ln, font=hf, fill="white"); y += int(size * 1.2)
    y += 14
    bf = font(False, 28)
    for ln in wrap(d, body, bf, 1060, max(1, (548 - y) // 38)):
        d.text((110, y), ln, font=bf, fill=(205, 215, 235)); y += 38
    if source: d.text((110, 552), source, font=font(False, 21), fill=(140, 165, 205))
    lower_bar(d, label)
    im.save(path)

def title_card(path, kind, when, sub):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([170, 190, 1110, 530], 22, fill=(8, 16, 40, 230))
    bf = brand_font(96)
    t = "BAZAAR TV NEWS"
    d.text(((W - d.textlength(t, font=bf)) / 2, 215), t, font=bf, fill="white")
    d.rectangle([340, 352, 940, 358], fill=RED)
    f = font(True, 46); t = NAME[kind]
    d.text(((W - d.textlength(t, font=f)) / 2, 380), t, font=f, fill=GOLD)
    f = font(False, 30)
    d.text(((W - d.textlength(when, font=f)) / 2, 450), when, font=f, fill=(210, 220, 240))
    if sub:
        f = font(False, 20)
        for i, ln in enumerate(wrap(d, sub, f, 1080, 3)):
            d.text(((W - d.textlength(ln, font=f)) / 2, 552 + i * 26), ln, font=f, fill=(180, 195, 225))
    im.save(path)

def weather_card(path, label, w):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([70, 108, 1210, 590], 18, fill=(8, 16, 40, 225))
    d.rectangle([70, 126, 80, 572], fill=TEAL)
    d.rounded_rectangle([110, 132, 290, 172], 8, fill=TEAL)
    d.text((128, 137), "WEATHER", font=font(True, 24), fill="white")
    t = w[0]
    d.text((110, 195), "Toronto", font=font(True, 44), fill="white")
    d.text((110, 250), f"{t['now']}°", font=font(True, 120), fill="white")
    d.text((370, 268), WMO.get(t["code"], "").capitalize(), font=font(True, 38), fill=GOLD)
    d.text((370, 322), f"Today  high {t['hi'][0]}°  low {t['lo'][0]}°", font=font(False, 30), fill=(205, 215, 235))
    d.text((370, 362), f"Tomorrow  {WMO.get(t['dcode'][1], '').capitalize()}, high {t['hi'][1]}°",
           font=font(False, 30), fill=(205, 215, 235))
    x = 110
    for c in w[1:]:
        d.rounded_rectangle([x, 440, x + 196, 530], 12, fill=(20, 40, 80, 235))
        d.text((x + 14, 450), c["city"], font=font(False, 24), fill=(190, 205, 230))
        d.text((x + 14, 480), f"{c['now']}°", font=font(True, 38), fill="white")
        x += 212
    d.text((110, 552), "Weather data: Open-Meteo.com (CC BY 4.0)", font=font(False, 21), fill=(140, 165, 205))
    lower_bar(d, label)
    im.save(path)

# ---------- making it ----------
def slot_hour(kind_arg, hour_arg):
    now = dt.datetime.now(TZ)
    if hour_arg is not None:
        slot = now.replace(hour=hour_arg, minute=0, second=0, microsecond=0)
    else:
        slot = (now + dt.timedelta(minutes=59)).replace(minute=0, second=0, microsecond=0)
    kind = kind_arg if kind_arg != "auto" else ("full" if slot.hour % 3 == 0 else "headlines")
    return kind, slot

def say_hour(slot):
    h = slot.hour % 12 or 12
    if slot.hour == 0: return "midnight"
    if slot.hour == 12: return "noon"
    return f"{h} o'clock"

def greeting(h):
    if 5 <= h < 12: return "Good morning"
    if 12 <= h < 18: return "Good afternoon"
    return "Good evening"

def clock(slot):
    return slot.strftime("%-I %p").replace("AM", "a.m.").replace("PM", "p.m.") + " ET"

def main():
    args = sys.argv[1:]
    if not args: raise SystemExit(__doc__)
    out = args[0]; offline = "--offline" in args
    opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
    kind, slot = slot_hour(opt("--kind", "auto"), int(opt("--hour")) if opt("--hour") else None)
    total = LENGTH[kind]
    work = os.path.join(out, "work-" + kind); os.makedirs(work, exist_ok=True)
    print("making", kind, "for", slot.isoformat())

    if opt("--stories"):
        picked = json.load(open(opt("--stories")))
    else:
        picked = gather(kind)
    stories = [s for sec in ("canada", "world") for s in picked.get(sec, [])]
    if len(stories) < 3: raise SystemExit("Too few stories found; keeping the last bulletin.")
    if not offline: write_script(stories, kind)
    if offline:
        wx = json.load(open(opt("--weather"))) if opt("--weather") else None
    else:
        try:
            wx = weather()
        except Exception as e:
            print("weather failed", e); wx = None; NOTES.append(f"weather failed: {e}")

    label = f"{NAME[kind]}  ·  {clock(slot)}  ·  {slot.strftime('%A, %B %-d')}"
    sources = sorted({s["source"] for s in stories})
    nxt = slot + dt.timedelta(hours=1)
    next_full = slot + dt.timedelta(hours=3 - slot.hour % 3)
    up_next = f"Next: {'the full report' if nxt.hour % 3 == 0 else 'headlines'} at {clock(nxt)}"

    # Segments: (kind, text, voice, picture maker)
    head = (f"{greeting(slot.hour)}. It's {say_hour(slot)} in Toronto, and this is Bazaar TV News"
            + (", with the full report." if kind == "full" else ". Here are the headlines."))
    tail = ("That's the news for now. Headlines every hour, and the full report every three hours, "
            "right here on Bazaar TV.")
    weather_seg = None
    if wx:
        weather_seg = weather_words(wx, kind == "headlines")

    def plan(n_canada, n_world):
        segs = []
        can = [s for s in stories if s["section"] == "canada"][:n_canada]
        wor = [s for s in stories if s["section"] == "world"][:n_world]
        for i, s in enumerate(can):
            lead = ("First, news from across Canada. " if kind == "full" else "In Canada. ") if i == 0 else ""
            segs.append(("story", lead + s["read"], VOICE_A, s))
        for i, s in enumerate(wor):
            lead = ("Now, news from around the world. " if kind == "full" else "Around the world. ") if i == 0 else ""
            segs.append(("story", lead + s["read"], VOICE_B, s))
        if weather_seg: segs.append(("weather", weather_seg, VOICE_A, None))
        return segs

    # Speak every possible line once, then drop stories from the end until it fits.
    cache = {}
    def voice(text, v):
        key = (text, v)
        if key not in cache:
            cache[key] = speak(text, v, os.path.join(work, f"v{len(cache):02d}"), offline)
        return cache[key]
    STING, GAP, END_MIN = 6.0, 0.7, 8.0
    nc = min(WANT[kind]["canada"], sum(s["section"] == "canada" for s in stories))
    nw = min(WANT[kind]["world"], sum(s["section"] == "world" for s in stories))
    while True:
        segs = [("open", head, VOICE_A, None)] + plan(nc, nw) + [("close", tail, VOICE_A, None)]
        used = STING + sum(len(voice(t, v)) / SR + GAP for _, t, v, _ in segs)
        if used + END_MIN <= total or nc + nw <= 2: break
        if nw >= nc and nw > 1: nw -= 1
        else: nc -= 1
    print(f"{nc} Canada + {nw} world stories, {used:.0f} s of {total} s")

    # Pictures and sound, one block per segment.
    background(os.path.join(work, "bg.mp4"))
    shown = [s for _, _, _, s in segs if s]
    cards, voice_track = [], np.zeros(int(SR * total) + SR, np.float32)
    when = f"{clock(slot)}  ·  {slot.strftime('%A, %B %-d, %Y')}"
    title_card(os.path.join(work, "c-title.png"), kind, when, "")
    cards.append(("c-title.png", STING))
    t = STING; n = 0
    for i, (sk, text, v, s) in enumerate(segs):
        audio = voice(text, v)
        a = int(t * SR); voice_track[a:a + len(audio)] += audio[:len(voice_track) - a]
        dur = len(audio) / SR + GAP
        pic = f"c-{i:02d}.png"
        if sk == "story":
            n += 1
            card(os.path.join(work, pic), label, s["section"], s["headline"], s["read"], "Source: " + s["source"],
                 f"{n} of {len(shown)}")
        elif sk == "weather":
            weather_card(os.path.join(work, pic), label, wx)
        elif sk == "open":
            pic = "c-title.png"
        else:
            title_card(os.path.join(work, pic), kind, up_next,
                       f"Full report every three hours, next at {clock(next_full)}")
        cards.append((pic, dur)); t += dur
    end_secs = total - t
    credits = ("Stories based on reporting by " + ", ".join(sources) +
               (". Weather: Open-Meteo.com" if wx else "") + (". Written with AI help" if any(st.get("ai") for st in shown) else "") + ". Read by an AI voice.")
    title_card(os.path.join(work, "c-end.png"), kind, up_next, credits)
    cards.append(("c-end.png", end_secs))

    music = np.zeros_like(voice_track)
    st = sting(STING); music[:len(st)] += 0.9 * st
    b = bed(total); music[int(STING * SR) - SR:int(STING * SR) - SR + len(b)] += 0.10 * b[:len(music) - int(STING * SR) + SR]
    e0 = int(t * SR); m_end = bed(end_secs + 1)
    ramp = np.minimum(1, np.arange(len(m_end)) / (SR * 1.5))
    music[e0:e0 + len(m_end)] += 0.25 * ramp * m_end[:len(music) - e0]
    fade = int(SR * 2); music[int(total * SR) - fade:int(total * SR)] *= np.linspace(1, 0, fade)
    mix = voice_track + music
    mix = mix[:int(total * SR)] / max(1.0, np.abs(mix).max() / 0.95)
    write_wav(os.path.join(work, "sound.wav"), mix)

    with open(os.path.join(work, "cards.txt"), "w") as f:
        for pic, dur in cards:
            f.write(f"file '{pic}'\nduration {dur:.3f}\n")
        f.write(f"file '{cards[-1][0]}'\n")
    mp4 = os.path.join(out, f"news-{kind}.mp4")
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-stream_loop", "-1", "-i", os.path.join(work, "bg.mp4"),
        "-f", "concat", "-safe", "0", "-i", os.path.join(work, "cards.txt"), "-i", os.path.join(work, "sound.wav"),
        "-filter_complex", f"[1:v]fps={FPS},format=rgba[c];[0:v][c]overlay=0:0:format=auto,format=yuv420p[v]",
        "-map", "[v]", "-map", "2:a", "-t", str(total), "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "24", "-g", str(FPS * 2), "-c:a", "aac", "-b:a", "128k", "-ar", str(SR), "-movflags", "+faststart", mp4)
    got = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4],
                               capture_output=True, text=True, check=True).stdout)
    if abs(got - total) > 1.0: raise SystemExit(f"{mp4} is {got:.1f} s, wanted {total} s")
    info = {"kind": kind, "secs": total, "slot": slot.isoformat(), "made": dt.datetime.now(dt.timezone.utc).isoformat(),
            "sources": sources, "weather": bool(wx), "notes": NOTES,
            "stories": [{"section": s["section"], "headline": s["headline"], "source": s["source"],
                         "ai": bool(s.get("ai"))} for s in shown]}
    json.dump(info, open(os.path.join(out, f"news-{kind}.json"), "w"), indent=1)
    print("made", mp4, f"{got:.1f} s")

if __name__ == "__main__":
    main()
