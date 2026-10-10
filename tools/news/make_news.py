"""Makes the Spark TV News bulletins in URDU (1280x720 MP4) from public news headlines.

Usage: python3 tools/news/make_news.py <out dir> [--kind headlines|full|auto|probe] [--hour H]
                                       [--stories file.json] [--weather file.json] [--offline]
                                       [--set next|current|<ISO time>] [--room day|night] [--gather]

Two bulletins, each always EXACTLY the same length so the channel schedule never has to change:
  headlines  3 minutes  (news-headlines.mp4), every hour
  full      10 minutes  (news-full.mp4), every three hours (00, 03, 06 ... Toronto time)
--kind auto (the default) makes the one due at the next full hour in Toronto;
--kind probe only checks every feed and the translator and writes news-probe.json.

Owner's plan for channel 1 (2026-10-08): the channel runs one 8-hour set three times a day (12 am, 8 am, 4 pm
Toronto). Each set gets ONE fresh headlines and ONE fresh full report, made just before the set and replayed
through it (full at the set's start and 4 hours in, headlines every other hour). --set makes that bulletin: no
clock time is read or shown, so it stays right at every replay. --room day|night makes the copy for the day
(06:00-17:59) or night newsroom (news-<kind>-<room>.mp4); --gather only saves the stories (stories-<kind>.json),
so all copies of a set read the same news.

The headlines follow the owner's running order (2026-10-10): 1-2 breaking stories (the ones most sources carry)
with a second sentence, 2-3 developments with what someone said in the source's report, local news (Toronto,
Pakistan's cities) with a map of where it happened, one uplifting story, then sports and showbiz in brief.

Spark TV is an Urdu/Hindi channel (owner, 2026-10-07), so everything spoken is Urdu; everything written on
screen shows Urdu and English together (owner, 2026-10-09: every headline gets an English line):
  1. Pakistan and world news from Urdu news feeds (BBC Urdu, DW Urdu, Independent Urdu, Express), Canada news from Canadian English feeds (Global News, CityNews) put into Urdu with
     Google's free translate address; every story names its source,
  2. read with Microsoft Edge's free Urdu neural voices (edge-tts, ur-PK Uzma and Asad),
  3. our own news graphics in Urdu (Noto Nastaliq), no pictures or video from other broadcasters,
     music made here, Toronto + Canada weather from Open-Meteo (CC BY 4.0).
The top corners and the bottom strip stay free for the app's channel number, logo and ticker.
--offline skips the internet (silent voice, sample stories) to check the layout.
Needs ffmpeg, numpy, Pillow (with raqm/fribidi for Urdu text) and (online) edge-tts.
"""
import asyncio, datetime as dt, email.utils, html, json, math, os, re, shutil, subprocess, sys, time
import urllib.parse, urllib.request, wave
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, SR = 1280, 720, 25, 44100
TZ = ZoneInfo("America/Toronto")
HERE = os.path.dirname(os.path.abspath(__file__))
URDU_FONT = os.path.join(HERE, "..", "stories", "fonts", "NotoNastaliqUrdu-700.ttf")
LENGTH = {"headlines": 180, "full": 600}
NAME = {"headlines": "خبروں کی سرخیاں", "full": "تفصیلی خبرنامہ"}
NAME_EN = {"headlines": "News headlines", "full": "Full news"}
BRAND = "اسپارک ٹی وی نیوز"
BRAND_EN = "SPARK TV NEWS"
# The English line in the lower bar (set per bulletin in main()); channel 1 writes Urdu and English (owner, 2026-10-09).
LABEL_EN = BRAND_EN
VOICE_A, VOICE_B, RATE = "ur-PK-UzmaNeural", "ur-PK-AsadNeural", "+0%"
UA = {"User-Agent": "Mozilla/5.0 (compatible; BazaarTV-News/1.0; +https://tv.bulkbazaar.ca)"}
NOTES = []  # what worked and what failed, saved in news-<kind>.json for checking

# (source name in Urdu, feed). Urdu feeds give Pakistan + world; English Canadian feeds are translated.
URDU_FEEDS = [
    ("بی بی سی اردو", "https://feeds.bbci.co.uk/urdu/rss.xml"),
    ("ڈی ڈبلیو اردو", "https://rss.dw.com/rdf/rss-urdu-all"),
    ("انڈپینڈنٹ اردو", "https://www.independenturdu.com/rss.xml"),
    ("ایکسپریس", "https://www.express.pk/feed/"),
]
CANADA_FEEDS = [
    ("گلوبل نیوز", "https://globalnews.ca/canada/feed/"),
    ("سٹی نیوز", "https://toronto.citynews.ca/feed/"),
    ("سی بی سی نیوز", "https://www.cbc.ca/cmlink/rss-canada"),
]
# India (owner asked 2026-10-08): official Hindi services, translated Hindi -> Urdu like the Canadian news.
INDIA_FEEDS = [
    ("بی بی سی ہندی", "https://feeds.bbci.co.uk/hindi/rss.xml"),
    ("ڈی ڈبلیو ہندی", "https://rss.dw.com/rdf/rss-hin-all"),
]
# Sports (owner asked 2026-10-08), cricket first: official English feeds, translated to Urdu.
SPORTS_FEEDS = [
    ("ای ایس پی این کرک انفو", "https://www.espncricinfo.com/rss/content/story/feeds/0.xml"),
    ("بی بی سی سپورٹ", "https://feeds.bbci.co.uk/sport/cricket/rss.xml"),
    ("بی بی سی سپورٹ", "https://feeds.bbci.co.uk/sport/rss.xml"),
]
# Film and showbiz (owner asked 2026-10-08): Lollywood/Bollywood in Urdu, Hollywood (Variety) + BBC entertainment, translated when needed.
FILM_FEEDS = [
    ("ایکسپریس شوبز", "https://www.express.pk/showbiz/feed/"),
    ("ایکسپریس شوبز", "https://www.express.pk/entertainment/feed/"),
    ("ورائٹی", "https://variety.com/feed/"),   # Hollywood (owner asked 2026-10-08)
    ("بی بی سی", "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml"),
]
PAKISTAN_WORDS = ("پاکستان", "اسلام آباد", "لاہور", "کراچی", "پشاور", "کوئٹہ", "پنجاب", "سندھ", "خیبر", "بلوچستان",
                  "کشمیر", "شہباز", "عمران خان", "تحریک انصاف", "پی ٹی آئی", "مسلم لیگ", "پیپلز پارٹی", "بلاول",
                  "مریم نواز", "نواز شریف", "آرمی چیف", "عاصم منیر", "سپریم کورٹ", "راولپنڈی", "ملتان", "فیصل آباد",
                  "گلگت", "سٹیٹ بینک", "کرکٹ بورڈ", "پی سی بی")
# How many stories each bulletin tries to fit (the fitting step drops the last ones if too long).
WANT = {"headlines": {"pakistan": 4, "india": 3, "world": 4, "canada": 3, "sports": 2, "film": 3},
        "full": {"pakistan": 8, "india": 6, "world": 8, "canada": 6, "sports": 5, "film": 6}}
ORDER = ("canada", "pakistan", "india", "world", "film", "sports")   # owner 2026-10-08
# Spare stories per section: used when the wanted ones are short, so the bulletin fills its slot.
EXTRA = 6
# The end card stays at most this long; any time still left is filled with our own Cable TV promos
# (docs/media/app-promos.json), so the channel never sits on a still slide (owner, 2026-10-07).
END_MAX = 12.0
CITIES = [("ٹورنٹو", 43.65, -79.38), ("وینکوور", 49.28, -123.12), ("کیلگری", 51.05, -114.07),
          ("مونٹریال", 45.50, -73.57), ("اوٹاوا", 45.42, -75.70), ("ہیلی فیکس", 44.65, -63.58)]
CITY_EN = {"ٹورنٹو": "Toronto", "وینکوور": "Vancouver", "کیلگری": "Calgary", "مونٹریال": "Montreal", "اوٹاوا": "Ottawa",
           "ہیلی فیکس": "Halifax", "اسلام آباد": "Islamabad", "لاہور": "Lahore", "کراچی": "Karachi", "پشاور": "Peshawar",
           "کوئٹہ": "Quetta", "ملتان": "Multan"}
SOURCE_EN = {"بی بی سی اردو": "BBC Urdu", "ڈی ڈبلیو اردو": "DW Urdu", "انڈپینڈنٹ اردو": "Independent Urdu", "ایکسپریس": "Express",
             "گلوبل نیوز": "Global News", "سٹی نیوز": "CityNews", "سی بی سی نیوز": "CBC News", "بی بی سی ہندی": "BBC Hindi",
             "ڈی ڈبلیو ہندی": "DW Hindi", "ای ایس پی این کرک انفو": "ESPNcricinfo", "بی بی سی سپورٹ": "BBC Sport",
             "ایکسپریس شوبز": "Express Showbiz", "ورائٹی": "Variety", "بی بی سی": "BBC"}

def ufont(size):
    return ImageFont.truetype(URDU_FONT, size, layout_engine=ImageFont.Layout.RAQM)

def font(bold, size):
    names = ["DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"] if bold else ["DejaVuSans.ttf", "LiberationSans-Regular.ttf"]
    for root in ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/truetype/liberation",
                 "/usr/share/fonts/truetype/liberation2"]:
        for n in names:
            p = os.path.join(root, n)
            if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)

def run(*cmd):
    subprocess.run(cmd, check=True)

def fetch(url, timeout=15):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    if data[:2] == b"\x1f\x8b":  # some feeds send gzip even when not asked
        import gzip
        data = gzip.decompress(data)
    return data.lstrip(b"\xef\xbb\xbf \r\n\t")

# ---------- news ----------
def clean(s):
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    return re.sub(r"\s+", " ", s).strip()

def local(tag):
    return tag.rsplit("}", 1)[-1]

def parse_feed(data, source):
    """Items of an RSS, RSS 1.0 (RDF) or Atom feed, whatever namespaces it uses."""
    root = ET.fromstring(data)
    out = []
    for it in root.iter():
        if local(it.tag) not in ("item", "entry"): continue
        kids = {}
        for c in it:
            kids.setdefault(local(c.tag), (c.text or "").strip())
        title, desc = clean(kids.get("title")), clean(kids.get("description") or kids.get("summary"))
        when = None
        for tag in ("pubDate", "published", "updated", "date"):
            v = kids.get(tag)
            if not v: continue
            try:
                when = email.utils.parsedate_to_datetime(v)
            except Exception:
                try: when = dt.datetime.fromisoformat(v.replace("Z", "+00:00"))
                except Exception: pass
            if when: break
        if title and len(title) > 12:
            out.append({"title": title, "desc": desc, "source": source,
                        "when": when.timestamp() if when and when.tzinfo else None})
    return out

def words(s):
    return {w for w in re.findall(r"\w{3,}", s.lower())}

def same_story(a, b):
    x, y = words(a["title"]), words(b["title"])
    return bool(x and y) and len(x & y) / min(len(x), len(y)) >= 0.5

def translate(text, src="en", to="ur"):
    """English (or Hindi: src="hi") to Urdu with Google's free translate address (no key); to="en" for the English line."""
    url = (f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={src}&tl={to}&dt=t&q="
           + urllib.parse.quote(text))
    data = json.loads(fetch(url))
    return clean("".join(part[0] for part in data[0] if part and part[0]))

def read_feeds(feeds):
    now, lists = time.time(), []
    for source, url in feeds:
        try:
            items = parse_feed(fetch(url), source)
            # Fresh stories only (last 18 hours) when the feed gives dates.
            items = [s for s in items if not s["when"] or now - s["when"] < 18 * 3600]
            print(f"{url}: {len(items)} stories"); NOTES.append(f"{url}: {len(items)}")
            lists.append(items)
        except Exception as e:
            print("feed failed", url, e); NOTES.append(f"{url}: failed {e}")
    return lists

def take_turns(lists, want, seen, section=None):
    """Stories in turn from each feed, so one source doesn't fill the bulletin."""
    out, i = [], 0
    while len(out) < want and any(i < len(l) for l in lists):
        for l in lists:
            if i >= len(l): continue
            dup = next((s for s in seen if same_story(l[i], s)), None)
            if dup is not None:
                # The same story from another source: it counts as one of the big stories (headlines' Breaking).
                dup["cover"] = dup.get("cover", 1) + 1
                continue
            s = l[i]
            if section: s["section"] = section
            out.append(s); seen.append(s)
        i += 1
    return out

def gather(kind):
    want = WANT[kind]
    seen = []
    urdu = take_turns(read_feeds(URDU_FEEDS), 3 * (want["pakistan"] + want["world"]) + 2 * EXTRA, seen)
    for s in urdu:
        s["section"] = "pakistan" if any(w in s["title"] + " " + s["desc"][:200] for w in PAKISTAN_WORDS) else "world"
    picked = {sec: [s for s in urdu if s["section"] == sec][:want[sec] + EXTRA] for sec in ("pakistan", "world")}
    # Every headline also gets its English line on screen (owner, 2026-10-09).
    for s in picked["pakistan"] + picked["world"]:
        try:
            s["en"] = translate(s["title"], "ur", "en")
        except Exception as e:
            NOTES.append(f"English line failed: {e}")
    for sec, feeds, lang in (("india", INDIA_FEEDS, "hi"), ("canada", CANADA_FEEDS, "en"), ("sports", SPORTS_FEEDS, "en"), ("film", FILM_FEEDS, "auto")):
        done = []
        for s in take_turns(read_feeds(feeds), want[sec] + EXTRA, seen, sec):
            try:
                orig = s["title"]
                s["en"] = orig if lang == "en" else translate(orig, lang, "en")
                s["title"] = translate(orig, lang)
                first = re.split(r"(?<=[.!?।])\s+", s["desc"])[0] if s["desc"] else ""
                s["desc"] = translate(first, lang) if first else ""
                done.append(s)
            except Exception as e:
                NOTES.append(f"translate failed ({sec}): {e}")
                break
        picked[sec] = done
    NOTES.append("stories: " + ", ".join(f"{k} {len(v)}" for k, v in picked.items()))
    return picked

# ---------- the headlines' running order (owner, 2026-10-10) ----------
# 1-2 breaking stories first (the ones most sources carry), each with a second sentence; then 2-3 developments,
# each with what someone said in the source's own report (an official's or expert's words, never made up); then
# local news (Toronto and Pakistan's cities) with a map of where it happened; then one uplifting story; then
# sports and showbiz in brief, and the weather. Anchor-led, as before.
TIER = {"breaking": ("اہم ترین خبر", "Breaking", (205, 25, 40)),
        "develop": ("تازہ پیش رفت", "Developing", (30, 100, 200)),
        "local": ("مقامی خبریں", "Local news", (20, 130, 70)),
        "good": ("اچھی خبر", "Good news", (215, 140, 20)),
        "brief": ("مختصر خبریں", "In brief", (125, 60, 190))}
TIER_LEAD = {"breaking": "سب سے پہلے اہم ترین خبریں۔ ", "develop": "اب دیکھتے ہیں تازہ پیش رفت۔ ", "local": "اب مقامی خبریں۔ ",
             "good": "اور اب ایک اچھی خبر۔ ", "brief": "اب مختصر خبریں۔ "}
QUOTE = re.compile(r"[“\"«][^”\"»]{12,}[”\"»]|نے کہا|کا کہنا ہے|کہنا تھا|نے بتایا|said|says|told")
GOOD = re.compile(r"جیت|اعزاز|ریکارڈ|خوشخبری|کامیاب|تقریب|میلہ|بچا لیا|رضاکار|عطیہ|گولڈ میڈل|ایوارڈ|celebrat|rescue|award|"
                  r"record|volunteer|donat|wins?\b|won\b|graduat|festival|reunite|saved|honou?r", re.I)
BAD = re.compile(r"ہلاک|قتل|حملہ|زخمی|دھماکہ|جاں بحق|موت|جنگ|killed|dead|death|attack|shooting|war\b|crash", re.I)
# Where local stories happened, for their map: (Urdu name, English name, latitude, longitude).
PLACES = [("ٹورنٹو", "Toronto", 43.65, -79.38), ("مسی ساگا", "Mississauga", 43.59, -79.64), ("برامپٹن", "Brampton", 43.73, -79.76),
          ("اوٹاوا", "Ottawa", 45.42, -75.70), ("مونٹریال", "Montreal", 45.50, -73.57), ("وینکوور", "Vancouver", 49.28, -123.12),
          ("کیلگری", "Calgary", 51.05, -114.07), ("اونٹاریو", "Ontario", 44.5, -79.5),
          ("کراچی", "Karachi", 24.86, 67.01), ("لاہور", "Lahore", 31.55, 74.34), ("اسلام آباد", "Islamabad", 33.68, 73.05),
          ("راولپنڈی", "Rawalpindi", 33.60, 73.04), ("پشاور", "Peshawar", 34.01, 71.58), ("کوئٹہ", "Quetta", 30.18, 66.99),
          ("ملتان", "Multan", 30.20, 71.47), ("فیصل آباد", "Faisalabad", 31.42, 73.08), ("حیدرآباد", "Hyderabad", 25.40, 68.37),
          ("سیالکوٹ", "Sialkot", 32.49, 74.53), ("گوجرانوالہ", "Gujranwala", 32.16, 74.19), ("گلگت", "Gilgit", 35.92, 74.31)]


def place_of(s):
    text = f"{s.get('title', '')} {s.get('desc', '')} {s.get('en', '')}"
    return next((p for p in PLACES if p[0] in text or re.search(rf"\b{p[1]}\b", text)), None)


def quote_of(s):
    """The sentence of the source's report in which someone is quoted, or ""."""
    for sent in re.split(r"(?<=[۔.!?؟])\s+", s.get("desc") or ""):
        if QUOTE.search(sent) and not same_story({"title": sent}, {"title": s["title"]}):
            return " ".join(sent.split()[:45])
    return ""


def headline_order(stories):
    """The stories in the headlines' order, each with its "tier"."""
    left = list(stories)
    def take(rule, n, tier):
        got = [s for s in left if rule(s)][:n]
        for s in got:
            s["tier"] = tier; left.remove(s)
        return got
    big = sorted([s for s in left if s["section"] in ("pakistan", "world", "canada", "india")],
                 key=lambda s: -s.get("cover", 1))
    breaking = [s for s in big if s.get("cover", 1) >= 2][:2] or big[:1] + [s for s in big[1:] if s["section"] != big[0]["section"]][:1]
    for s in breaking:
        s["tier"] = "breaking"; left.remove(s)
    # Picked scarcest first (good news, then local), then shown in the bulletin's order.
    good = take(lambda s: s["section"] not in ("sports", "film") and GOOD.search(f"{s['title']} {s.get('desc', '')} {s.get('en', '')}") and
                not BAD.search(f"{s['title']} {s.get('desc', '')} {s.get('en', '')}"), 1, "good")
    local = take(lambda s: s["section"] in ("canada", "pakistan") and place_of(s), 2, "local")
    develop = take(lambda s: s["section"] in ("pakistan", "world", "india", "canada") and quote_of(s), 3, "develop")
    if len(develop) < 2:
        develop += take(lambda s: s["section"] in ("pakistan", "world", "india"), 2 - len(develop), "develop")
    brief = take(lambda s: s["section"] == "sports", 1, "brief") + take(lambda s: s["section"] == "film", 1, "brief")
    return breaking + develop + local + good + brief


def first_sentence(text, max_words=40):
    first = re.split(r"(?<=[۔.!?؟])\s+", text)[0] if text else ""
    w = first.split()
    return " ".join(w[:max_words]) + ("۔" if len(w) > max_words else "")

def end(text):
    text = text.strip().rstrip(".۔")
    return text if text.endswith(("؟", "!", "?")) else text + "۔"

def script(stories, kind):
    """What the reader says: the source first, then the headline (and in the full report, one more sentence)."""
    for s in stories:
        s["headline"] = s["title"].rstrip("۔.")
        s["headline_en"] = (s.get("en") or "").strip()
        more = first_sentence(s["desc"]) if kind == "full" or s.get("tier") == "breaking" else ""
        if s.get("tier") == "develop": more = quote_of(s)
        if more and same_story({"title": more}, {"title": s["title"]}): more = ""
        s["read"] = f"{s['source']} کے مطابق، {end(s['title'])}" + (f" {end(more)}" if more else "")

# ---------- weather (Open-Meteo, CC BY 4.0) ----------
WMO_EN = {0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog", 51: "Light drizzle",
          53: "Drizzle", 55: "Heavy drizzle", 56: "Drizzle", 57: "Drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
          66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow",
          80: "Rain showers", 81: "Rain showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers",
          95: "Thunderstorms", 96: "Hail", 99: "Hail"}
WMO = {0: "صاف", 1: "زیادہ تر صاف", 2: "جزوی طور پر ابر آلود", 3: "ابر آلود", 45: "دھند", 48: "دھند",
       51: "ہلکی بوندا باندی", 53: "بوندا باندی", 55: "تیز بوندا باندی", 56: "بوندا باندی", 57: "بوندا باندی",
       61: "ہلکی بارش", 63: "بارش", 65: "تیز بارش", 66: "ٹھنڈی بارش", 67: "ٹھنڈی بارش",
       71: "ہلکی برف باری", 73: "برف باری", 75: "شدید برف باری", 77: "برف باری", 80: "بارش کی بوچھاڑ",
       81: "بارش کی بوچھاڑ", 82: "تیز بوچھاڑ", 85: "برفانی بوچھاڑ", 86: "برفانی بوچھاڑ",
       95: "گرج چمک کے ساتھ بارش", 96: "ژالہ باری", 99: "ژالہ باری"}

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
    return f"منفی {abs(n)}" if n < 0 else str(n)

def weather_words(w, short, day=None):
    t = w[0]
    if day is not None:   # a set's bulletin is replayed for 8 hours: the day's forecast, no "right now"
        i = min(1, max(0, (day.date() - dt.datetime.now(TZ).date()).days))   # the set's own day (a 12 am set is made the evening before)
        s = (f"ٹورنٹو میں آج موسم {WMO.get(t['dcode'][i], 'ملا جلا')} رہے گا، زیادہ سے زیادہ درجہ حرارت "
             f"{deg(t['hi'][i])} اور کم سے کم {deg(t['lo'][i])} ڈگری۔")
        return ("اور اب موسم۔ " if short else "اب موسم کا حال۔ ") + s
    s = f"ٹورنٹو میں اس وقت درجہ حرارت {deg(t['now'])} ڈگری سینٹی گریڈ ہے اور موسم {WMO.get(t['code'], 'ملا جلا')} ہے۔"
    if short: return "اور اب موسم۔ " + s
    s += (f" آج زیادہ سے زیادہ درجہ حرارت {deg(t['hi'][0])} اور کم سے کم {deg(t['lo'][0])} ڈگری رہے گا۔"
          f" کل موسم {WMO.get(t['dcode'][1], 'ملا جلا')} رہنے کا امکان ہے، اور زیادہ سے زیادہ درجہ حرارت {deg(t['hi'][1])} ڈگری ہوگا۔")
    s += " کینیڈا کے دوسرے شہروں میں اس وقت درجہ حرارت: " + "، ".join(f"{c['city']} {deg(c['now'])}" for c in w[1:]) + " ڈگری۔"
    return "اب موسم کا حال۔ " + s

# ---------- voice ----------
def write_wav(path, samples):
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())

def read_wav(path):
    with wave.open(path, "rb") as f:
        return np.frombuffer(f.readframes(f.getnframes()), dtype="<i2").astype(np.float32) / 32767

# Owner 2026-10-10: the newsreader spoke too slowly and flatly ("normal people have some emotion: sometimes a
# little faster, sometimes slower"). Every reader is PACE % quicker than her voice's own speed, each kind of story
# has its own tone (MOOD: breaking quicker and a touch higher, good news warmer and calmer, in-brief brisk), and each
# sentence of a story gets a slightly different speed so a story isn't read at one flat rate.
# How the Urdu voices should SAY names they get wrong (owner 2026-10-10: "Independent" sounded wrong). Only the
# voice uses these spellings; the screen keeps the normal ones.
SAY = {"السلام علیکم": "اَلسّلامُ عَلَیکُم", "انڈپینڈنٹ": "اِنڈی پینڈنٹ", "انڈیپنڈنٹ": "اِنڈی پینڈنٹ", "ای ایس پی این کرک انفو": "ای ایس پی این، کرک اِنفو",
       "سٹی نیوز": "سِٹی نیوز", "ورائٹی": "وَرائٹی", "ٹورنٹو": "ٹورانٹو"}
PACE = int(os.environ.get("NEWS_PACE", "12"))
MOOD = {"breaking": (6, 3), "develop": (0, 0), "local": (3, 0), "good": (-3, 6), "brief": (8, 2),
        "sports": (6, 2), "film": (4, 4), "": (0, 0)}   # (rate %, pitch Hz)
SWING = (0, 4, -3, 2, -2, 5)   # rate % added to a story's 1st, 2nd, ... sentence

def with_mood(voice, mood):
    """'voice|pitch|rate' + the tone of a kind of story: 'voice|pitch|rate|mood'."""
    name, pitch, rate = (voice.split("|") + ["+0Hz", RATE])[:3]
    return f"{name}|{pitch}|{rate}|{mood if mood in MOOD else ''}"

def _shift(value, by, unit):
    m = re.match(r"([+-]?\d+)", value or "0")
    n = (int(m.group(1)) if m else 0) + by
    return f"{n:+d}{unit}"

async def _tts(text, voice, path, swing=0):
    import edge_tts
    name, pitch, rate, mood = (voice.split("|") + ["+0Hz", RATE, ""])[:4]   # "voice|pitch|rate|mood": voice_of(), with_mood()
    for written, said in SAY.items():
        text = text.replace(written, said)
    dr, dp = MOOD.get(mood, (0, 0))
    await edge_tts.Communicate(text, name, rate=_shift(rate, PACE + dr + swing, "%"),
                               pitch=_shift(pitch, dp, "Hz")).save(path)

def voice_of(reader):
    """The newsreader's own voice (tools/news/presenters/voices.json, by name; owner 2026-10-09: a different voice
    for each person), as "voice|pitch|rate". A reader not listed gets the plain lady's or man's voice."""
    plain = VOICE_B if reader and reader.get("voice") == VOICE_B else VOICE_A
    try:
        v = json.load(open(os.path.join(HERE, "presenters", "voices.json")))["voices"][reader["name"]]
        return f"{v['voice']}|{v.get('pitch', '+0Hz')}|{v.get('rate', RATE)}"
    except Exception:
        return plain

def speak(text, voice, base, offline):
    wav = base + ".wav"
    if offline:
        write_wav(wav, np.zeros(int(SR * (0.5 + len(text) * 0.062)), np.float32))
        return read_wav(wav)
    # A story is read sentence by sentence, each at its own slightly different speed (SWING), with a short breath.
    parts = [p for p in re.split(r"(?<=[۔؟!?])\s+", text.strip()) if p] if "|" in voice and voice.count("|") >= 3 else [text]
    out = []
    for k, part in enumerate(parts):
        mp3 = f"{base}-{k}.mp3"
        for attempt in range(5):
            try:
                asyncio.run(_tts(part, voice, mp3, SWING[k % len(SWING)] if len(parts) > 1 else 0))
                if os.path.getsize(mp3) > 1000: break
            except Exception as e:
                print("voice retry", attempt, e)
            time.sleep(5 * (attempt + 1))
        else:
            raise SystemExit("Voice failed for: " + part)
        run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", mp3, "-ac", "1", "-ar", str(SR), wav)
        if os.environ.get("NEWS_SAY_DIR"):   # the pronunciation check (tools/news/say_check.py) listens to these
            keep = os.environ["NEWS_SAY_DIR"]; os.makedirs(keep, exist_ok=True)
            n = len([f for f in os.listdir(keep) if f.endswith(".mp3")])
            shutil.copy(mp3, os.path.join(keep, f"{n:04d}.mp3"))
            with open(os.path.join(keep, f"{n:04d}.txt"), "w", encoding="utf-8") as f:
                f.write(part.strip())
        if out: out.append(np.zeros(int(SR * 0.12), np.float32))
        out.append(read_wav(wav))
    return np.concatenate(out)

# ---------- music: real recordings from tools/music/library.py (CC BY, credited on the end card) ----------
STING_MUSIC = os.environ.get("NEWS_STING", "promo")   # opening and end card
BED_MUSIC = os.environ.get("NEWS_BED", "calm")        # very low under the stories

def lib_music(mood, secs, fin, fout):
    sys.path.insert(0, os.path.join(HERE, "..", "music"))
    import library
    x = library.bed(mood, secs, fade_in=fin, fade_out=fout).mean(axis=1).astype(np.float32)
    return x / max(1e-6, np.abs(x).max())

def music_credit():
    sys.path.insert(0, os.path.join(HERE, "..", "music"))
    import library
    names = []
    for mood in dict.fromkeys((STING_MUSIC, BED_MUSIC)):
        t = library.track(mood); names.append(f"{t['title']} by {t['artist']} ({t['licence']})")
    return "Music: " + ", ".join(names)

# ---------- old home-made music (no longer used: owner rule, real recordings only) ----------
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

# ---------- graphics (right to left) ----------
RED, BLUE, TEAL, GREEN, GOLD = (210, 30, 45), (25, 110, 220), (20, 150, 140), (20, 130, 70), (245, 190, 40)
SAFFRON, PURPLE, PINK = (215, 105, 20), (125, 60, 190), (200, 40, 120)
SECTION_EN = {"pakistan": "Pakistan", "world": "World", "canada": "Canada", "india": "India", "sports": "Sports",
              "film": "Showbiz", "weather": "Weather"}
SECTION = {"pakistan": ("پاکستان", GREEN), "world": ("دنیا", BLUE), "canada": ("کینیڈا", RED), "india": ("بھارت", SAFFRON), "sports": ("کھیل", PURPLE), "film": ("شوبز", PINK),
           "weather": ("موسم", TEAL)}
RIGHT = 1170  # right edge of the text inside the panel
LIGHT, DIM = (205, 215, 235), (150, 170, 205)

DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
PUNCT = str.maketrans({".": "۔", ",": "،", "?": "؟", ";": "؛", "%": "٪", "-": " ", "–": " ", "—": " ", "/": " ",
                       ":": " ", "(": " ", ")": " ", "'": "", '"': "", "‘": "", "’": "", "“": "", "”": ""})

def urdu_ok(ch):
    return ("\u0600" <= ch <= "\u06ff" or "\u0750" <= ch <= "\u077f" or "\ufb50" <= ch <= "\ufdff"
            or "\ufe70" <= ch <= "\ufeff" or ch in "\u200c\u200d")

def tokens(text):
    """Words to draw: Urdu words in Nastaliq, English words in DejaVu, '•' as a dot.
    The Nastaliq font has no Latin letters, Western digits or most punctuation, so those are mapped or dropped."""
    out = []
    for word in text.split():
        if word == "•": out.append((word, "dot")); continue
        # English words (and plain figures right after them) stay together, so an English phrase reads left to right.
        if re.search(r"[A-Za-z]", word) or (out and out[-1][1] == "latin" and word.isascii()):
            if out and out[-1][1] == "latin": out[-1] = (out[-1][0] + " " + word, "latin")
            else: out.append((word, "latin"))
            continue
        w = "".join(c for c in word.translate(DIGITS).translate(PUNCT) if urdu_ok(c) or c == " ")
        out += [(x, "urdu") for x in w.split()]
    return out

def fonts(size, bold=True):
    return ufont(size), font(bold, max(12, int(size * 0.6)))

def tok_len(d, tok, kind, fs):
    if kind == "urdu": return d.textlength(tok, font=fs[0], direction="rtl", language="ur")
    if kind == "dot": return fs[0].size * 0.5
    return d.textlength(tok, font=fs[1])

def line_len(d, toks, fs):
    gap = fs[0].size * 0.3
    return sum(tok_len(d, t, k, fs) for t, k in toks) + gap * max(0, len(toks) - 1)

def draw_line(d, x, y, toks, fs, fill, align="r"):
    """One line, right to left; x is the right edge (align r), centre (m) or left edge (l)."""
    width, gap = line_len(d, toks, fs), fs[0].size * 0.3
    x = x if align == "r" else x + width / 2 if align == "m" else x + width
    for t, k in toks:
        w = tok_len(d, t, k, fs)
        if k == "urdu": d.text((x, y), t, font=fs[0], fill=fill, anchor="rm", direction="rtl", language="ur")
        elif k == "dot":
            r = fs[0].size * 0.09; cx = x - w / 2
            d.ellipse([cx - r, y - r, cx + r, y + r], fill=fill)
        else: d.text((x, y + fs[0].size * 0.15), t, font=fs[1], fill=fill, anchor="rm")
        x -= w + gap

def text(d, x, y, s, size, fill, align="r", bold=True):
    draw_line(d, x, y, tokens(s), fonts(size, bold), fill, align)

def wrap(d, s, size, width, max_lines):
    fs, out, line = fonts(size), [], []
    for tok in tokens(s):
        if line and line_len(d, line + [tok], fs) > width:
            out.append(line); line = []
        line.append(tok)
    if line: out.append(line)
    if len(out) > max_lines:
        out = out[:max_lines]
        while len(out[-1]) > 1 and line_len(d, out[-1] + [("…", "latin")], fs) > width: out[-1] = out[-1][:-1]
        out[-1] = out[-1] + [("…", "latin")]
    return out

def en_text(d, xy, s, size, fill, anchor="la", width=None, bold=False):
    """An English line (channel 1 writes Urdu and English together, owner 2026-10-09), cut with … to [width]."""
    f = font(bold, size)
    if width:
        while len(s) > 4 and d.textlength(s, font=f) > width: s = s[:-2].rstrip() + "…"
    d.text(xy, s, font=f, fill=fill, anchor=anchor)

def wrap_en(d, s, size, width, max_lines, bold=False):
    f, out, line = font(bold, size), [], ""
    for w in s.split():
        if line and d.textlength(line + " " + w, font=f) > width:
            out.append(line); line = w
        else: line = (line + " " + w).strip()
    if line: out.append(line)
    if len(out) > max_lines:
        out = out[:max_lines]; last = out[-1]
        while len(last) > 4 and d.textlength(last + "…", font=f) > width: last = last[:-1]
        out[-1] = last.rstrip() + "…"
    return out

_LOGO = {}

def spark_logo(im, x, y, h, name="spark-news.png"):
    """Pastes the Spark News logo (docs/channel/logos, owner 2026-10-10: show the logo, not only the name) h px high."""
    if name not in _LOGO:
        try:
            _LOGO[name] = Image.open(os.path.join(HERE, "..", "..", "docs", "channel", "logos", name)).convert("RGBA")
        except OSError:
            _LOGO[name] = None
    lg = _LOGO[name]
    if lg is None: return 0
    lg = lg.resize((round(lg.width * h / lg.height), h), Image.LANCZOS)
    im.alpha_composite(lg, (round(x), round(y)))
    return lg.width

def lower_bar(d, label, en=None, top=606):
    # y 606-654: free bottom strip below it stays clear for the app's ticker.
    o = top - 606
    d.rectangle([930, 606 + o, 1210, 654 + o], fill=(10, 20, 52))
    d.rectangle([930, 606 + o, 936, 654 + o], fill=RED)
    if not spark_logo(d._image, 958, 609 + o, 42):
        text(d, 1070, 628 + o, BRAND, 26, "white", "m")
    d.rectangle([70, 606 + o, 930, 654 + o], fill=(245, 245, 248) if not o else (225, 228, 238))
    text(d, 910, 628 + o, label, 22, (20, 25, 45))
    # The English line on the left of the bar, as far as the Urdu label leaves room.
    room = 910 - line_len(d, tokens(label), fonts(22)) - 30 - 88
    if room > 80: en_text(d, (88, 630 + o), LABEL_EN if en is None else en, 18, (60, 70, 100), "lm", room, True)

def panel(d, col):
    d.rounded_rectangle([70, 108, 1210, 590], 18, fill=(8, 16, 40, 225))
    d.rectangle([1200, 126, 1210, 572], fill=col)

def pill(d, name, col):
    """The section's name, Urdu and English: 'پاکستان • Pakistan'."""
    pw = line_len(d, tokens(name), fonts(24)) + 40
    d.rounded_rectangle([RIGHT - pw, 128, RIGHT, 176], 8, fill=col)
    text(d, RIGHT - pw / 2, 150, name, 24, "white", "m")

# Scene clip box on story cards (left of the text), when a free clip fits the story; see broll.py.
BROLL_BOX = (100, 196, 448, 252)

# Story graphics like a real bulletin (owner 2026-10-10: "not giving a realistic look"; no story counter, no source
# line): the newsreader full screen, a coloured flag (Breaking / Developing ...) over a headline strap in the lower
# third (Urdu, with the English line under it), the channel bar below, and a map over her shoulder for local news.
# Sources are named by the newsreader and on the end card.
MAP_BOX = (842, 96, 368, 207)
STRAP_Y = 486

def card(path, label, section, headline, headline_en="", tier=None, where=None):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if tier:
        f_ur, f_en, col = TIER[tier]
    else:
        f_ur, f_en = SECTION[section][0], SECTION_EN[section]; col = SECTION[section][1]
    if where:
        draw_map(im, d, where, col, MAP_BOX)
    # The flag, right-aligned above the strap.
    flag = f"{f_ur} • {f_en}"
    fw = line_len(d, tokens(flag), fonts(22)) + 36
    d.rectangle([1210 - fw, STRAP_Y - 40, 1210, STRAP_Y], fill=col)
    text(d, 1210 - fw / 2, STRAP_Y - 20, flag, 22, "white", "m")
    # The strap: the Urdu headline on white, the English one on navy under it.
    tw = 1210 - 70 - 40
    size = 34
    while size > 26 and len(wrap(d, headline, size, tw, 2)) > 1: size -= 2
    lines = wrap(d, headline, size, tw, 2)
    uh = 30 + int(size * 1.55) * len(lines)
    d.rectangle([70, STRAP_Y, 1210, STRAP_Y + uh], fill=(246, 246, 250))
    d.rectangle([70, STRAP_Y, 78, STRAP_Y + uh], fill=col)
    y = STRAP_Y + 15 + int(size * 1.55) // 2
    for ln in lines:
        draw_line(d, 1190, y, ln, fonts(size), (14, 22, 48)); y += int(size * 1.55)
    ey = STRAP_Y + uh
    if headline_en:
        d.rectangle([70, ey, 1210, ey + 34], fill=(10, 24, 62))
        en_text(d, (1190, ey + 17), headline_en, 19, "white", "rm", tw, True)
        ey += 34
    # The channel bar sits right under the strap (the bottom strip below it stays free for the app's ticker).
    lower_bar(d, label, top=max(606, ey + 4))
    im.save(path)

_WORLD = None


def world_shapes():
    """Country outlines (Natural Earth 1:110m, public domain), downloaded once; [] when they can't be had."""
    global _WORLD
    if _WORLD is None:
        cache = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "ne_110m_countries.geojson")
        try:
            if not os.path.exists(cache):
                data = fetch("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson", 60)
                open(cache, "wb").write(data)
            feats = json.load(open(cache, encoding="utf-8"))["features"]
            _WORLD = []
            for f in feats:
                g = f["geometry"]
                polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
                _WORLD += [p[0] for p in polys]
        except Exception as e:
            NOTES.append(f"map outlines failed: {e}"); _WORLD = []
    return _WORLD


def draw_map(im, d, where, col, box=None):
    """A map of the area around [where] (Urdu name, English name, lat, lon) with a pin, in [box]."""
    ur, en, lat, lon = where
    x, y, w, h = box or BROLL_BOX
    span = 16.0    # degrees of longitude shown: the city and the country around it
    sx = w / span; sy = sx / max(0.3, math.cos(math.radians(lat)))
    px = lambda lo, la: (x + w / 2 + (lo - lon) * sx, y + h / 2 - (la - lat) * sy)   # noqa: E731
    m = Image.new("RGBA", im.size, (0, 0, 0, 0)); md = ImageDraw.Draw(m)
    md.rectangle((x, y, x + w - 1, y + h - 1), fill=(18, 52, 92, 255))
    for ring in world_shapes():
        pts = [px(lo, la) for lo, la in ring]
        if max(p[0] for p in pts) < x or min(p[0] for p in pts) > x + w or max(p[1] for p in pts) < y or min(p[1] for p in pts) > y + h:
            continue
        md.polygon(pts, fill=(64, 92, 72, 255), outline=(150, 175, 160, 255))
    # Only the box: anything drawn outside it is cleared.
    mask = Image.new("L", im.size, 0); ImageDraw.Draw(mask).rectangle((x, y, x + w - 1, y + h - 1), fill=255)
    im.paste(m, (0, 0), Image.composite(m, Image.new("RGBA", im.size), mask).split()[3])
    cx, cy = x + w / 2, y + h / 2
    d.rectangle((x - 3, y - 3, x + w + 2, y + h + 2), outline=col, width=3)
    d.ellipse((cx - 14, cy - 14, cx + 14, cy + 14), outline=(255, 255, 255), width=3)
    d.ellipse((cx - 7, cy - 7, cx + 7, cy + 7), fill=(230, 40, 50))
    d.rounded_rectangle((cx - 110, cy + 20, cx + 110, cy + 74), 8, fill=(8, 16, 40, 235))
    text(d, cx, cy + 36, ur, 22, "white", "m")
    d.text((cx, cy + 62), en, font=font(True, 16), fill=GOLD, anchor="mm")
    d.text((x + w - 4, y + h - 4), "Map: Natural Earth", font=font(False, 11), fill=(200, 210, 225), anchor="rd")


def title_card(path, kind, when, sub, english="", when_en="", sub_en=""):
    """Urdu with English under each line (channel 1 writes both, owner 2026-10-09)."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([170, 120, 1110, 585], 22, fill=(8, 16, 40, 230))
    spark_logo(im, 196, 140, 64)
    text(d, W / 2, 190, BRAND, 70, "white", "m")
    d.text((W / 2, 282), BRAND_EN, font=font(True, 28), fill="white", anchor="mm")
    d.rectangle([340, 310, 940, 315], fill=RED)
    text(d, W / 2, 352, NAME[kind], 40, GOLD, "m")
    d.text((W / 2, 418), NAME_EN[kind], font=font(True, 24), fill=GOLD, anchor="mm")
    text(d, W / 2, 468, when, 28, (210, 220, 240), "m")
    if when_en: d.text((W / 2, 540), when_en, font=font(False, 22), fill=(210, 220, 240), anchor="mm")
    y = 610
    for ln in wrap(d, sub, 18, 1080, 2) if sub else []:
        draw_line(d, W / 2, y, ln, fonts(18, False), (180, 195, 225), "m"); y += 34
    for ln in wrap_en(d, sub_en, 15, 1080, 2) if sub_en else []:
        d.text((W / 2, y - 4), ln, font=font(False, 15), fill=(180, 195, 225), anchor="mm"); y += 20
    if english: d.text((W / 2, y + 2), english, font=font(False, 14), fill=(150, 165, 200), anchor="mm")
    im.save(path)

def weather_card(path, label, w):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    panel(d, TEAL); pill(d, "موسم • Weather", TEAL)
    t = w[0]
    text(d, RIGHT, 220, "ٹورنٹو", 40, "white")
    d.text((RIGHT - 130, 222), "Toronto", font=font(True, 24), fill="white", anchor="rm")
    d.text((RIGHT, 300), f"{t['now']}°", font=font(True, 110), fill="white", anchor="rm")
    x = RIGHT - 270
    text(d, x, 232, WMO.get(t["code"], ""), 34, GOLD)
    d.text((x, 276), WMO_EN.get(t["code"], ""), font=font(True, 20), fill=GOLD, anchor="rm")
    text(d, x, 298, f"آج زیادہ سے زیادہ {deg(t['hi'][0])} • کم سے کم {deg(t['lo'][0])} ڈگری", 24, LIGHT)
    d.text((x, 342), f"Today: high {t['hi'][0]}°, low {t['lo'][0]}°", font=font(False, 18), fill=LIGHT, anchor="rm")
    text(d, x, 378, f"کل {WMO.get(t['dcode'][1], '')} • زیادہ سے زیادہ {deg(t['hi'][1])} ڈگری", 24, LIGHT)
    d.text((x, 422), f"Tomorrow: {WMO_EN.get(t['dcode'][1], '')}, high {t['hi'][1]}°", font=font(False, 18), fill=LIGHT, anchor="rm")
    x = RIGHT
    for c in w[1:]:
        d.rounded_rectangle([x - 196, 448, x, 560], 12, fill=(20, 40, 80, 235))
        text(d, x - 98, 470, c["city"], 22, (190, 205, 230), "m")
        d.text((x - 98, 500), CITY_EN.get(c["city"], ""), font=font(False, 15), fill=(190, 205, 230), anchor="mm")
        d.text((x - 98, 533), f"{c['now']}°", font=font(True, 30), fill="white", anchor="mm")
        x -= 212
    d.text((110, 565), "Open-Meteo.com (CC BY 4.0)", font=font(False, 18), fill=DIM, anchor="lm")
    lower_bar(d, label)
    im.save(path)

# ---------- making it ----------
WEEKDAYS = ["پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ", "اتوار"]
MONTHS = ["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون", "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"]

SETS = (0, 8, 16)   # the 8-hour sets on channel 1, Toronto time

def set_start(which, now=None):
    """The start of the next (or current) 8-hour set in Toronto, or the one an ISO time names."""
    if which not in ("next", "current"):
        t = dt.datetime.fromisoformat(which)
        return (t if t.tzinfo else t.replace(tzinfo=TZ)).astimezone(TZ)
    now = now or dt.datetime.now(TZ)
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    starts = [(day + dt.timedelta(days=d)).replace(hour=h) for d in (-1, 0, 1) for h in SETS]
    return min(s for s in starts if s > now) if which == "next" else max(s for s in starts if s <= now)

def day_room(hour):
    return "day" if 6 <= hour < 18 else "night"

def slot_hour(kind_arg, hour_arg):
    now = dt.datetime.now(TZ)
    if hour_arg is not None:
        slot = now.replace(hour=hour_arg, minute=0, second=0, microsecond=0)
    else:
        slot = now.replace(minute=0, second=0, microsecond=0) + dt.timedelta(hours=1)
    kind = kind_arg if kind_arg != "auto" else ("full" if slot.hour % 3 == 0 else "headlines")
    return kind, slot

def period(h):
    if 5 <= h < 12: return "صبح"
    if 12 <= h < 16: return "دوپہر"
    if 16 <= h < 19: return "شام"
    return "رات"

def clock(slot):
    """'رات 8 بجے' (Toronto time)."""
    return f"{period(slot.hour)} {slot.hour % 12 or 12} بجے"

def date_ur(slot, year=False):
    return f"{WEEKDAYS[slot.weekday()]}، {slot.day} {MONTHS[slot.month - 1]}" + (f" {slot.year}" if year else "")

def date_en(slot, year=False):
    return slot.strftime("%A %-d %B") + (f" {slot.year}" if year else "")

def clock_en(slot):
    return f"{slot.hour % 12 or 12} {'am' if slot.hour < 12 else 'pm'}"

def probe(out):
    read_feeds(URDU_FEEDS + INDIA_FEEDS + CANADA_FEEDS + SPORTS_FEEDS + FILM_FEEDS)
    try: NOTES.append("translate: " + translate("Canada's prime minister met provincial leaders in Ottawa."))
    except Exception as e: NOTES.append(f"translate failed: {e}")
    try: NOTES.append(f"weather: {weather()[0]}")
    except Exception as e: NOTES.append(f"weather failed: {e}")
    json.dump({"notes": NOTES, "made": dt.datetime.now(dt.timezone.utc).isoformat()},
              open(os.path.join(out, "news-probe.json"), "w"), ensure_ascii=False, indent=1)
    print("\n".join(NOTES))

def reader_ids(onair, kind=None, room=None):
    """The clip ids on air. on-air.json lists each newsreader once ("readers") and, since the owner kept four
    newsrooms (2026-10-08), which room each kind of bulletin uses ("rooms": headlines/full by day 06-17 and night;
    never the day room at night or the night room by day): a reader's clip in a room is their id + the room letter
    ("same" maps exceptions). Without "rooms", the readers are the clip ids themselves. kind=None lists every clip
    any bulletin may need."""
    readers, rooms = onair["readers"], onair.get("rooms")
    if not rooms: return list(readers)
    same = onair.get("same", {})
    def ids(letter): return [same.get(r + letter, r + letter) for r in readers]
    if kind is None: return [i for letter in dict.fromkeys(rooms.values()) for i in ids(letter)]
    return ids(rooms[f"{kind}-{room}"])

def newsreader(slot, room=None, in_set=False, kind="headlines"):
    """The AI newsreader on camera (tools/news/presenters/on-air.json takes turns), in the newsroom for this kind of
    bulletin at this time of day (room day/night; default from the slot's hour).
    Her moving clip (news-move-<id>-raw.mp4, made by news-presenter-move.yml) must be in tools/news/presenters/clips/."""
    here = os.path.join(HERE, "presenters")
    try:
        ids = reader_ids(json.load(open(os.path.join(here, "on-air.json"))), kind, room or day_room(slot.hour))
        people = {p["id"]: p for p in json.load(open(os.path.join(here, "presenters.json")))["moving"]["people"]}
    except Exception as e:
        NOTES.append(f"no newsreader: {e}"); return None
    ids = [i for i in ids if i in people and os.path.exists(os.path.join(here, "clips", f"{i}.mp4"))]
    if not ids:
        NOTES.append("no newsreader clip found"); return None
    # Sets: everyone gets a turn across the days (an hour-based turn would give the same 3 readers every day).
    turn = (slot.toordinal() * len(SETS) + SETS.index(slot.hour)) if in_set and slot.hour in SETS else slot.hour
    p = dict(people[ids[turn % len(ids)]]); p["clip"] = boomerang(os.path.join(here, "clips", f"{p['id']}.mp4"))
    p["_room_ids"], p["_turn"], p["_people"] = ids, turn, people
    return p

def weather_presenter(reader):
    """Owner rule (2026-10-09): in the full news, the weather is presented by someone other than the newsreader,
    a lady when one is on air (the men's clip ids start with "anchor-m"). Same newsroom, taking turns like the readers.
    None when nobody else has a clip (the newsreader then presents the weather as before)."""
    if not reader: return None
    ids, people = reader["_room_ids"], reader["_people"]
    others = [i for i in ids if people[i]["name"] != reader["name"]]
    ladies = [i for i in others if not i.startswith("anchor-m")]
    pick = ladies or others
    if not pick: return None
    p = dict(people[pick[(reader["_turn"] + 1) % len(pick)]])
    p["clip"] = boomerang(os.path.join(HERE, "presenters", "clips", f"{p['id']}.mp4"))
    return p

def boomerang(clip):
    """The clip played forward then backward, so when it loops the hands never jump back (owner 2026-10-08)."""
    out = clip[:-4] + "-loop.mp4"
    if not os.path.exists(out):
        try:
            run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", clip, "-filter_complex",
                "[0:v]fps=25,setpts=PTS-STARTPTS,split[a][b];[b]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[r];[a][r]concat=n=2:v=1:a=0[v]",
                "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", out)
        except Exception as e:
            NOTES.append(f"boomerang failed: {e}"); return clip
    return out

def add_opening(body, secs, work):
    """Owner's pick (2026-10-08, opening 3): the headline wall with our logo landing replaces the still title
    for the first seconds. If it can't be made, the still title simply stays."""
    try:
        import intro_ideas
        intro = os.path.join(work, "opening.mp4")
        intro_ideas.opening(intro, secs)
        tmp = body + ".open.mp4"
        run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", body, "-i", intro, "-filter_complex",
            "[0:v][1:v]overlay=0:0:eof_action=pass,format=yuv420p[v]", "-map", "[v]", "-map", "0:a", "-c:v", "libx264",
            "-preset", "veryfast", "-crf", "24", "-g", str(FPS * 2), "-c:a", "copy", "-movflags", "+faststart", tmp)
        os.replace(tmp, body)
    except Exception as e:
        NOTES.append(f"opening failed: {e}")

def duration(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                                capture_output=True, text=True, check=True).stdout)

def add_news_opener(mp4, opener, work):
    """Owner's pick (2026-10-09): the Spark News opener montage (docs/media/spark-news-opener-<kind>.mp4, real news
    footage with English + Urdu titles) plays first, then the bulletin. The bulletin was made that much shorter."""
    tmp = os.path.join(work, "with-opener.mp4")
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", opener, "-i", mp4, "-filter_complex",
        f"[0:v]scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,fps={FPS},setsar=1,format=yuv420p[ov];"
        f"[0:a]aformat=sample_rates={SR}:channel_layouts=mono,loudnorm=I=-16:TP=-1.5[oa];"
        f"[1:v]fps={FPS},setsar=1,format=yuv420p[bv];[1:a]aformat=sample_rates={SR}:channel_layouts=mono[ba];"
        "[ov][oa][bv][ba]concat=n=2:v=1:a=1[v][a]", "-map", "[v]", "-map", "[a]", "-r", str(FPS), "-c:v", "libx264",
        "-preset", "veryfast", "-crf", "24", "-g", str(FPS * 2), "-c:a", "aac", "-b:a", "128k", "-ar", str(SR),
        "-movflags", "+faststart", tmp)
    os.replace(tmp, mp4)

def add_segment(body, clip, t0, work, secs=None):
    """Lays a ready-made segment's picture (the weather centre) over the bulletin from t0; its voice is already in the mix.
    secs: how long its slot lasts; the last picture holds to the end, so the plain weather card never peeks out."""
    try:
        tmp = body + ".seg.mp4"
        run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", body, "-itsoffset", f"{t0:.3f}", "-i", clip,
            "-filter_complex", f"[1:v]fps={FPS},setsar=1[s];[0:v][s]overlay=0:0:" + (f"eof_action=repeat:enable='between(t,{t0:.3f},{t0 + secs:.3f})'"
                                                                  if secs else "eof_action=pass") + ",format=yuv420p[v]",
            "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-g", str(FPS * 2),
            "-c:a", "copy", "-movflags", "+faststart", tmp)
        os.replace(tmp, body)
    except Exception as e:
        NOTES.append(f"weather centre overlay failed: {e}")

def add_reader(body, reader, windows, label, work):
    """Shows the newsreader full screen (moving) in [windows] ((start, secs, graphics png or None)): our lower bar
    while she says the opening and closing lines, each story's strap while she reads it."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    lower_bar(d, f"{label} • {reader['ur']}", f"{LABEL_EN} · {reader.get('name', '')}")
    im.save(os.path.join(work, "reader-bar.png"))
    # One continuous copy of the (looping, forward-and-back) clip runs under the whole bulletin and shows only in
    # the windows, so the newsreader never restarts mid-gesture between segments.
    pngs = list(dict.fromkeys(p or "reader-bar.png" for _, _, p in windows))
    ins = ["-i", body, "-stream_loop", "-1", "-i", reader["clip"]]
    for p in pngs: ins += ["-loop", "1", "-i", os.path.join(work, p)]
    between = lambda ws: "+".join(f"between(t,{t0:.3f},{t0 + dur:.3f})" for t0, dur, _ in ws)   # noqa: E731
    graph = [f"[1:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},setsar=1[r]",
             f"[0:v][r]overlay=0:0:shortest=1:enable='{between(windows)}'[m0]"]
    last = "m0"
    for i, p in enumerate(pngs):
        ws = [w for w in windows if (w[2] or "reader-bar.png") == p]
        graph.append(f"[{last}][{i + 2}:v]overlay=0:0:shortest=1:enable='{between(ws)}'[m{i + 1}]")
        last = f"m{i + 1}"
    tmp = os.path.join(work, "with-reader.mp4")
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", *ins, "-filter_complex", ";".join(graph) + f";[{last}]format=yuv420p[v]",
        "-map", "[v]", "-map", "0:a", "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-g", str(FPS * 2), "-c:a", "copy", "-movflags", "+faststart", tmp)
    os.replace(tmp, body)

def add_broll(body, clips, work):
    """Plays each story's scene clip inside its card's box (clips: (start, secs, file))."""
    if not clips: return
    x, y, w, h = BROLL_BOX
    ins, chain, last = ["-i", body], [], "0:v"
    files = list(dict.fromkeys(f for _, _, f in clips))   # each file is one continuous input (the newsreader never restarts)
    for i, f in enumerate(files, 1):
        ins += ["-stream_loop", "-1", "-i", f]
        on = "+".join(f"between(t,{t0:.3f},{t0 + secs:.3f})" for t0, secs, g in clips if g == f)
        chain.append(f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={FPS},setsar=1[b{i}]")
        chain.append(f"[{last}][b{i}]overlay={x}:{y}:shortest=1:enable='{on}'[v{i}]")
        last = f"v{i}"
    tmp = os.path.join(work, "broll.mp4")
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", *ins, "-filter_complex", ";".join(chain), "-map", f"[{last}]",
        "-map", "0:a", "-t", f"{float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', body], capture_output=True, text=True).stdout):.3f}",
        "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-g", str(FPS * 2), "-c:a", "copy",
        "-movflags", "+faststart", tmp)
    os.replace(tmp, body)

def add_promos(body, secs, slot, work, mp4):
    """Fills the time after the bulletin with our own Cable TV promos, in turn (a different start each hour)."""
    media = os.path.join(HERE, "..", "..", "docs", "media")
    cfg = json.load(open(os.path.join(media, "app-promos.json")))["promos"]
    files = [os.path.join(media, p["src"]) for p in cfg if os.path.exists(os.path.join(media, p["src"]))]
    if not files: raise SystemExit("no promos to fill the end of the bulletin")
    start = slot.hour % len(files)
    order = (files[start:] + files[:start]) * 4
    picked, have = [], 0.0
    for f in order:
        if have >= secs: break
        d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f],
                                 capture_output=True, text=True, check=True).stdout)
        picked.append(f); have += d
    ins, parts = ["-i", body], ["[0:v][0:a]"]
    pre = []
    for i, f in enumerate(picked, 1):
        ins += ["-i", f]
        pre.append(f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,"
                   f"fps={FPS},setsar=1,format=yuv420p[v{i}];"
                   f"[{i}:a]aformat=sample_rates={SR}:channel_layouts=mono,loudnorm=I=-16:TP=-1.5[a{i}]")
        parts.append(f"[v{i}][a{i}]")
    total = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", body],
                                 capture_output=True, text=True, check=True).stdout) + secs
    fade = max(0.0, total - 1.0)
    graph = (";".join(pre) + ";[0:v]format=yuv420p,setsar=1[bv];[0:a]aformat=sample_rates=" + str(SR) +
             ":channel_layouts=mono[ba];" + "".join(["[bv][ba]"] + parts[1:]) + f"concat=n={len(parts)}:v=1:a=1[cv][ca];"
             f"[cv]trim=0:{total:.3f},setpts=PTS-STARTPTS,fade=t=out:st={fade:.3f}:d=1[v];"
             f"[ca]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,afade=t=out:st={fade:.3f}:d=1[a]")
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", *ins, "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
        "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-g", str(FPS * 2), "-c:a", "aac",
        "-b:a", "128k", "-ar", str(SR), "-movflags", "+faststart", mp4)
    return [os.path.basename(f) for f in picked]

def main():
    if "--reader-ids" in sys.argv:   # every clip a bulletin may need, for the workflows to download
        print(" ".join(reader_ids(json.load(open(os.path.join(HERE, "presenters", "on-air.json")))))); return
    args = sys.argv[1:]
    if not args: raise SystemExit(__doc__)
    out = args[0]; offline = "--offline" in args
    opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
    os.makedirs(out, exist_ok=True)
    if opt("--kind") == "probe": return probe(out)
    in_set = opt("--set") is not None
    if in_set:
        kind, slot = opt("--kind", "headlines"), set_start(opt("--set"))
        if kind not in LENGTH: raise SystemExit("--set needs --kind headlines or full")
    else:
        kind, slot = slot_hour(opt("--kind", "auto"), int(opt("--hour")) if opt("--hour") else None)
    if "--due" in args:  # just say which bulletin is due next (the workflow uses it to skip a repeat run)
        return print(kind, slot.isoformat())
    if "--gather" in args:
        json.dump(gather(kind), open(os.path.join(out, f"stories-{kind}.json"), "w"), ensure_ascii=False, indent=1)
        return print("saved", kind, "stories for", slot.isoformat(), "|", "; ".join(NOTES))
    room = opt("--room")
    name = f"news-{kind}" + (f"-{room}" if room else "")
    # Owner, 2026-10-09: the headlines open with "SPARK NEWS HEADLINES", the full news with "SPARK NEWS".
    opener = os.path.join(HERE, "..", "..", "docs", "media", f"spark-news-opener-{kind}.mp4")
    opener_secs = duration(opener) if os.path.exists(opener) else 0.0
    total = LENGTH[kind] - opener_secs   # the bulletin itself; the opener goes in front, so the slot stays the same
    work = os.path.join(out, "work-" + name); os.makedirs(work, exist_ok=True)
    print("making", name, "for", slot.isoformat())

    picked = json.load(open(opt("--stories"))) if opt("--stories") else gather(kind)
    stories = [s for sec in ORDER for s in picked.get(sec, [])]
    if len(stories) < 3: raise SystemExit("Too few stories found; keeping the last bulletin.")
    # The headlines go breaking, developments, local, good news, in brief (owner, 2026-10-10); the full news by section.
    if kind == "headlines":
        stories = headline_order(stories)
        NOTES.append("order: " + ", ".join(f"{s['tier']}/{s['section']}" for s in stories))
    script(stories, kind)
    if offline:
        wx = json.load(open(opt("--weather"))) if opt("--weather") else None
    else:
        try:
            wx = weather()
        except Exception as e:
            print("weather failed", e); wx = None; NOTES.append(f"weather failed: {e}")

    global LABEL_EN
    label = f"{NAME[kind]} • {clock(slot)} • {date_ur(slot)}"
    LABEL_EN = f"Spark TV News · {NAME_EN[kind]} · {clock_en(slot)} · {slot.strftime('%a %-d %b')}"
    sources = sorted({s["source"] for s in stories})
    nxt = slot + dt.timedelta(hours=1)
    next_full = slot + dt.timedelta(hours=3 - slot.hour % 3)
    up_next = f"اگلی خبریں {clock(nxt)}" + (f" • {NAME['full']}" if nxt.hour % 3 == 0 else "")
    up_next_en = f"Next news at {clock_en(nxt)}" + (" · Full news" if nxt.hour % 3 == 0 else "")
    every_full = "ہر تین گھنٹے بعد"
    every_full_en = "every three hours"
    greet = f"السلام علیکم۔ ٹورنٹو میں {period(slot.hour)} کے {slot.hour % 12 or 12} بجے ہیں، اور یہ ہے اسپارک ٹی وی نیوز۔ "
    if in_set:   # replayed through the 8-hour set, so no clock time anywhere
        label = f"{NAME[kind]} • {date_ur(slot)}"
        LABEL_EN = f"Spark TV News · {NAME_EN[kind]} · {slot.strftime('%a %-d %b')}"
        up_next = "اگلی خبریں ایک گھنٹے بعد"
        up_next_en = "Next news in one hour"
        every_full = "ہر چار گھنٹے بعد"
        every_full_en = "every four hours"
        greet = "السلام علیکم، اور یہ ہے اسپارک ٹی وی نیوز۔ "
    head = (greet + ("تفصیلی خبرنامے میں خوش آمدید۔" if kind == "full" else "پیش ہیں اس وقت کی اہم خبریں۔"))
    # Owner 2026-10-08: start with the headlines, then the sections. (The headlines bulletin opens straight on its
    # breaking news instead, owner 2026-10-10.)
    tops = [next(s for s in stories if s["section"] == sec)["headline"] for sec in ORDER if any(s["section"] == sec for s in stories)]
    if tops and kind == "full": head += " سب سے پہلے اہم سرخیاں۔ " + "۔ ".join(t.rstrip("۔.؟?! ") for t in tops[:4]) + "۔"
    tail = (f"یہ تھیں اس وقت کی خبریں۔ خبروں کی سرخیاں ہر گھنٹے، اور تفصیلی خبرنامہ {every_full}، "
            "صرف اسپارک ٹی وی پر۔ اللہ حافظ۔")
    weather_seg = weather_words(wx, kind == "headlines", slot if in_set else None) if wx else None
    NAMES = {"canada": "کینیڈا", "pakistan": "پاکستان", "india": "بھارت", "world": "دنیا", "film": "فلم اور شوبز", "sports": "کھیلوں"}
    present = [sec for sec in ORDER if any(s["section"] == sec for s in stories)]
    LEAD = {sec: ("اب " if 0 < i < len(present) - 1 else "اور آخر میں " if i else "") + NAMES[sec] + " کی خبریں۔ "
            for i, sec in enumerate(present)}
    # The voice always matches the newsreader on camera: a man reads with a man's voice, a lady with a lady's (owner 2026-10-08).
    reader = newsreader(slot, room, in_set, kind)
    rv = voice_of(reader)
    VOICE = {sec: rv for sec in ORDER}
    # Full news: a second presenter, a lady when possible, does the weather (owner, 2026-10-09).
    wx_reader = (weather_presenter(reader) if kind == "full" else None) or reader
    wv = voice_of(wx_reader)
    if wx_reader is not reader: NOTES.append(f"weather presenter: {wx_reader['name']}")

    # Owner's pick (2026-10-08, weather idea 1): the weather centre with the same newsreader replaces the weather card.
    wxvid = None
    if weather_seg and reader and not offline:
        try:
            import weather_ideas
            wxvid = weather_ideas.segment(work, wv, wx_reader["clip"], kind == "headlines", slot if in_set else None)
        except Exception as e:
            NOTES.append(f"weather centre failed: {e}")

    def plan(counts):
        segs = []
        if kind == "headlines":
            # In the running order; the fitting step below drops stories from the end (counts["all"]).
            last = None
            for s in stories[:counts["all"]]:
                segs.append(("story", (TIER_LEAD[s["tier"]] if s["tier"] != last else "") + s["read"], with_mood(rv, s["tier"]), s))
                last = s["tier"]
            if weather_seg: segs.append(("weather", weather_seg, wv, None))
            return segs
        for sec in ORDER:
            for i, s in enumerate([s for s in stories if s["section"] == sec][:counts[sec]]):
                segs.append(("story", (LEAD[sec] if i == 0 else "") + s["read"], with_mood(VOICE[sec], sec), s))
        if weather_seg: segs.append(("weather", weather_seg, wv, None))
        return segs

    # Speak every possible line once, then drop stories from the end until it fits.
    cache = {}
    def voice(text, v):
        key = (text, v)
        if key not in cache:
            cache[key] = speak(text, v, os.path.join(work, f"v{len(cache):02d}"), offline)
        return cache[key]
    STING, GAP, END_MIN = 6.0, 0.45, 8.0   # a shorter pause between stories (owner: it felt slow)
    counts = {sec: sum(s["section"] == sec for s in stories) for sec in ORDER}
    counts["all"] = len(stories)
    while True:
        segs = [("open", head, rv, None)] + plan(counts) + [("close", tail, rv, None)]
        used = STING + sum((wxvid[2] if k == "weather" and wxvid else len(voice(t, v)) / SR) + GAP for k, t, v, _ in segs)
        if used + END_MIN <= total or (kind == "headlines" and counts["all"] <= 3) or sum(counts[k] for k in ORDER) <= 2: break
        if kind == "headlines":
            counts["all"] -= 1
            continue
        biggest = max(ORDER, key=lambda k: counts[k])
        counts[biggest] -= 1
    print(counts, f"{used:.0f} s of {total} s")

    # Pictures and sound, one block per segment.
    background(os.path.join(work, "bg.mp4"))
    shown = [s for _, _, _, s in segs if s]
    cards, voice_track = [], np.zeros(int(SR * total) + SR, np.float32)
    title_card(os.path.join(work, "c-title.png"), kind, date_ur(slot, True) if in_set else f"{clock(slot)} • {date_ur(slot, True)}", "",
               when_en=date_en(slot, True) if in_set else f"{clock_en(slot)} · {date_en(slot, True)}")
    cards.append(("c-title.png", STING))
    t = STING; n = 0; on_camera = []; clips = []
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import broll
    wx_at = wx_dur = None
    for i, (sk, text, v, s) in enumerate(segs):
        audio = wxvid[1] if sk == "weather" and wxvid else voice(text, v)
        if sk == "weather" and wxvid: wx_at = t
        a = int(t * SR); voice_track[a:a + len(audio)] += audio[:len(voice_track) - a]
        dur = len(audio) / SR + GAP
        if sk == "weather" and wxvid: wx_dur = dur
        pic = f"c-{i:02d}.png"
        if sk == "story":
            n += 1
            # Owner 2026-10-10: the newsreader full screen with the story's strap, like a real bulletin (topic
            # clips only with NEWS_BROLL=1, in the old box). Local news adds a map of where it happened.
            clip = broll.pick(s, work) if os.environ.get("NEWS_BROLL") == "1" and not offline else None
            if clip: clips.append((t, len(audio) / SR + GAP, clip[0]))
            where = place_of(s) if s.get("tier") == "local" else None
            card(os.path.join(work, pic), label, s["section"], s["headline"], s.get("headline_en", ""),
                 tier=s.get("tier"), where=where)
            if not clip: on_camera.append((t, dur, pic))
        elif sk == "weather":
            weather_card(os.path.join(work, pic), label, wx)
        elif sk == "open":
            pic = "c-title.png"
        else:
            title_card(os.path.join(work, pic), kind, up_next,
                       f"تفصیلی خبرنامہ {every_full}" + ("" if in_set else f"، اگلا {clock(next_full)}"),
                       when_en=up_next_en, sub_en=f"Full news {every_full_en}" + ("" if in_set else f", next at {clock_en(next_full)}"))
        if sk in ("open", "close"): on_camera.append((t, dur, None))
        cards.append((pic, dur)); t += dur
    left = total - t
    # A short gap stays on the end card; a long one gets promos after a normal-length end card.
    end_secs = left if left <= END_MAX + 3 else END_MAX
    news_len = t + end_secs
    credits = ("خبروں کے ذرائع " + "، ".join(sources) + " • بھارت، کینیڈا، کھیل اور شوبز کی خبروں کا ترجمہ اور آواز مصنوعی ذہانت")
    credits_en = ("News sources: " + ", ".join(SOURCE_EN.get(x, x) for x in sources)
                  + " · India, Canada, sports and showbiz news translated and voiced by AI")
    title_card(os.path.join(work, "c-end.png"), kind, up_next, credits,
               music_credit() + (" · Weather: Open-Meteo.com (CC BY 4.0) · AI voice" if wx else " · AI voice"),
               when_en=up_next_en, sub_en=credits_en)
    cards.append(("c-end.png", end_secs))

    music = np.zeros_like(voice_track)
    st = lib_music(STING_MUSIC, STING, 0.2, 1.2); music[:len(st)] += 0.9 * st
    b = lib_music(BED_MUSIC, total, 1.0, 1.5); music[int(STING * SR) - SR:int(STING * SR) - SR + len(b)] += 0.10 * b[:len(music) - int(STING * SR) + SR]
    e0 = int(t * SR); m_end = lib_music(STING_MUSIC, end_secs + 1, 1.0, 1.5)
    ramp = np.minimum(1, np.arange(len(m_end)) / (SR * 1.5))
    music[e0:e0 + len(m_end)] += 0.25 * ramp * m_end[:len(music) - e0]
    fade = int(SR * 2); music[int(news_len * SR) - fade:int(news_len * SR)] *= np.linspace(1, 0, fade)
    mix = voice_track + music
    mix = mix[:int(news_len * SR)] / max(1.0, np.abs(mix).max() / 0.95)
    write_wav(os.path.join(work, "sound.wav"), mix)

    with open(os.path.join(work, "cards.txt"), "w") as f:
        for pic, dur in cards:
            f.write(f"file '{pic}'\nduration {dur:.3f}\n")
        f.write(f"file '{cards[-1][0]}'\n")
    mp4 = os.path.join(out, f"{name}.mp4")
    body = mp4 if news_len >= total - 0.01 else os.path.join(work, "body.mp4")
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-stream_loop", "-1", "-i", os.path.join(work, "bg.mp4"),
        "-f", "concat", "-safe", "0", "-i", os.path.join(work, "cards.txt"), "-i", os.path.join(work, "sound.wav"),
        "-filter_complex", f"[1:v]fps={FPS},format=rgba[c];[0:v][c]overlay=0:0:format=auto,format=yuv420p[v]",
        "-map", "[v]", "-map", "2:a", "-t", f"{news_len:.3f}", "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "24", "-g", str(FPS * 2), "-c:a", "aac", "-b:a", "128k", "-ar", str(SR), "-movflags", "+faststart", body)
    add_broll(body, clips, work)
    add_opening(body, STING, work)
    if wx_at is not None: add_segment(body, wxvid[0], wx_at, work, wx_dur)
    if reader and on_camera:
        add_reader(body, reader, on_camera, label, work)
    promos = []
    if body != mp4:
        promos = add_promos(body, total - news_len, slot, work, mp4)
    if opener_secs: add_news_opener(mp4, opener, work)
    total = LENGTH[kind]
    got = duration(mp4)
    if abs(got - total) > 1.0: raise SystemExit(f"{mp4} is {got:.1f} s, wanted {total} s")
    info = {"kind": kind, "lang": "ur", "secs": total, "opener_secs": round(opener_secs, 1), "slot": slot.isoformat(), "set": in_set, "room": room,
            "made": dt.datetime.now(dt.timezone.utc).isoformat(), "sources": sources, "weather": bool(wx), "notes": NOTES,
            "news_secs": round(news_len, 1), "promos": promos,
            "reader": reader["id"] if reader else None,
            "weather_presenter": wx_reader["id"] if wx_reader else None,
            "stories": [{"section": s["section"], "headline": s["headline"], "headline_en": s.get("headline_en", ""),
                         "source": s["source"]} for s in shown]}
    json.dump(info, open(os.path.join(out, f"{name}.json"), "w"), ensure_ascii=False, indent=1)
    print("made", mp4, f"{got:.1f} s")

if __name__ == "__main__":
    main()
