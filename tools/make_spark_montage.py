"""Spark TV network montage, v5 (30 s): the longer, richer follow-up to the 20 s ident (tools/make_spark_ident.py).

Owner (2026-10-09): "make one more Spark TV network montage, a really nice one; it can be longer". For the next version.

Five acts on the 120 BPM grid of "Inspiring Advertising" (Rafael Krux, CC BY 4.0):
  0-2 s   the four petals light up one per beat; the orange one flies at the camera and opens into the first show
  2-10 s  our channels' shows open out of petal-shaped windows, two per word: MOVIES, KIDS, SPORTS, TRAVEL
  10-14 s three tall panels slide past each other: STORIES, then NEWS
  14-18 s rapid fire, one show and one word per beat: WATCH, LAUGH, EXPLORE, LEARN, CHEER, DISCOVER, DREAM, ENJOY
  18-22 s the camera pulls back from one show to a 3x3 wall of nine; the screens turn into petal colours and fly in
  22-30 s the Spark Flower blooms, "spark tv" rises, MOVIES · KIDS · SPORTS · NEWS · TRAVEL underneath, glints, fade
Clips: our channels' free films (Blender Foundation open movies, CC BY; Superman 1941, public domain), our own news
presenter and story, and the news b-roll from our releases. Credits on screen.

Usage: python3 tools/make_spark_montage.py OUT.mp4
"""
import math, os, random, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "music"))
from library import bed, credit, save, SR  # noqa: E402

W, H, FPS, SECS = 1920, 1080, 25, 30.0
N = int(FPS * SECS)
MOOD = "feelgood"
HIT = 22.0
ORG, PNK, VIO, YEL = (255, 106, 0), (255, 45, 120), (124, 58, 237), (255, 196, 0)
PETALS = (ORG, PNK, VIO, YEL)
REL = "https://github.com/NaseerBabar786/live-tv-app/releases/download/"
LOGO = os.path.join(HERE, "spark_logos", "spark-tv.png")
BUG = os.path.join(HERE, "..", "docs", "channel", "logos", "spark-tv.png")
WORD_FONT = os.path.join(HERE, "fonts", "Poppins-BlackItalic.ttf")
LATIN = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
WIDE = "crop=1280:536:0:92,"          # open movies: 2.39:1 inside 16:9
BOX43 = "crop=960:720:160:0,"         # Superman 1941: 4:3 inside 16:9
NOBAR = "crop=1138:600:71:0,"         # our news/story videos: leave out the caption bar at the bottom
CM, NB = "channel-media/", "news-broll/broll-"
CLIPS = {
    "sintel-snow": (CM + "sintel.mp4", 30, WIDE), "tos-robot": (CM + "tears-of-steel.mp4", 300, WIDE),
    "bunny-fly": (CM + "big-buck-bunny.mp4", 425, ""), "wing-rocket": (CM + "wing-it.mp4", 159.5, ""),
    "cricket": (NB + "cricket-56bb9390.mp4", 1, ""), "football": (NB + "football-d0b68c12.mp4", 2, ""),
    "toronto": (NB + "canada-5f4338e4.mp4", 2, ""), "plane": (NB + "india-a0c307bc.mp4", 2, ""),
    "cosmos-sheep": (CM + "cosmos-laundromat.mp4", 350, WIDE), "llama": (CM + "caminandes-gran-dillama.mp4", 29, ""),
    "sintel-cliff": (CM + "sintel.mp4", 699, WIDE), "anchor": (CM + "news-move-anchor-1t.mp4", 1, NOBAR),
    "earth": (NB + "world-866918d5.mp4", 2, ""), "city": (NB + "world-81301e9c.mp4", 2, ""),
    "superman-zap": (CM + "superman-1941.mp4", 499.5, BOX43), "tos-panel": (CM + "tears-of-steel.mp4", 50, WIDE),
    "bunny": (CM + "big-buck-bunny.mp4", 59, ""), "sun": (CM + "caminandes-gran-dillama.mp4", 89, ""),
    "sintel-face": (CM + "sintel.mp4", 119.5, WIDE), "wing-cat": (CM + "wing-it.mp4", 79.5, ""),
    "cosmos-man": (CM + "cosmos-laundromat.mp4", 599, WIDE), "superman-lab": (CM + "superman-1941.mp4", 379.5, BOX43),
    "story": (CM + "story-lion-and-rabbit.mp4", 58, NOBAR), "tos-dome": (CM + "tears-of-steel.mp4", 219, WIDE),
    "sintel-roof": (CM + "sintel.mp4", 180, WIDE), "llama2": (CM + "caminandes-gran-dillama.mp4", 16.5, ""),
    "traffic": (NB + "india-b8ce65c8.mp4", 2, ""), "stadium": (NB + "sports-303a1d1e.mp4", 2, ""),
    "bunny-forest": (CM + "big-buck-bunny.mp4", 30, ""),
}
ACT1 = [(2, "sintel-snow", "MOVIES"), (3, "tos-robot", "MOVIES"), (4, "bunny-fly", "KIDS"), (5, "wing-rocket", "KIDS"),
        (6, "cricket", "SPORTS"), (7, "football", "SPORTS"), (8, "toronto", "TRAVEL"), (9, "plane", "TRAVEL")]
ACT2 = [(10, ["cosmos-sheep", "llama", "sintel-cliff"], "STORIES"), (12, ["earth", "anchor", "city"], "NEWS")]
ACT3 = ["superman-zap", "tos-panel", "bunny", "sun", "sintel-face", "wing-cat", "cosmos-man", "superman-lab"]
ACT3_WORDS = ["WATCH", "LAUGH", "EXPLORE", "LEARN", "CHEER", "DISCOVER", "DREAM", "ENJOY"]
WALL = ["story", "tos-dome", "sintel-roof", "llama2", "anchor", "traffic", "stadium", "bunny-forest", "cosmos-sheep"]
rnd = random.Random(33)


def clamp(x): return max(0.0, min(1.0, x))
def out_cubic(k): return 1 - (1 - clamp(k)) ** 3
def in_cubic(k): return clamp(k) ** 3
def inout(k):
    k = clamp(k)
    return 4 * k ** 3 if k < .5 else 1 - (-2 * k + 2) ** 3 / 2
def out_back(k, s=2.0):
    k = clamp(k) - 1
    return 1 + (s + 1) * k ** 3 + s * k ** 2
def arr(im): return np.asarray(im, np.float32) / 255
def to_img(f): return Image.fromarray((np.clip(f, 0, 1) * 255).astype(np.uint8), "RGB")
def blur(x, r):
    out = np.empty_like(x)
    for c in range(3):
        out[..., c] = arr(Image.fromarray(np.clip(x[..., c] * 255, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(r)))
    return out
def up(x, w=W, h=H): return arr(to_img(x).resize((w, h), Image.BILINEAR))


class Clip:
    """A few seconds of one of our channels' shows as 1920x1080 frames."""
    def __init__(self, name, secs=3.0):
        f, start, pre = CLIPS[name]
        self.dir = tempfile.mkdtemp(prefix=name + "-")
        vf = pre + "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,unsharp=5:5:0.6,fps=25"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(start), "-i", REL + f, "-t", str(secs), "-an",
                        "-vf", vf, "-q:v", "3", f"{self.dir}/%04d.jpg"], check=True, timeout=900)
        self.n = len(os.listdir(self.dir)); self.cache = {}

    def frame(self, t):
        i = min(self.n, max(1, int(t * FPS) + 1))
        if i not in self.cache:
            if len(self.cache) > 4: self.cache.clear()
            self.cache[i] = Image.open(f"{self.dir}/{i:04d}.jpg").convert("RGB")
        return self.cache[i]


def push(im, k, z0=1.0, z1=1.08, dx=0.0, size=(W, H)):
    z = z0 + (z1 - z0) * k; w, h = im.size; cw, ch = w / z, h / z
    x0 = (w - cw) / 2 + dx * (w - cw) / 2
    return im.crop((int(x0), int((h - ch) / 2), int(x0 + cw), int((h + ch) / 2))).resize(size, Image.BILINEAR)


def petal_mask(S, i):
    K = 2; s = S * K; c = s / 2; pw, ph = s * .26, s * .48
    m = Image.new("L", (s, s), 0)
    ImageDraw.Draw(m).ellipse([c - pw / 2, c - ph + s * .04, c + pw / 2, c + s * .07], fill=255)
    return m.rotate(-90 * i, resample=Image.BICUBIC, center=(c, c)).resize((S, S), Image.LANCZOS)


def petal(S, i, col):
    m = petal_mask(S, i); y, x = np.mgrid[0:S, 0:S].astype(np.float32); c = S / 2
    d = [(c - y), (x - c), (y - c), (c - x)][i] / (S * .48)
    rgb = np.clip(np.array(col, np.float32)[None, None] / 255 * (.9 + .16 * np.clip(d, 0, 1))[..., None], 0, 1)
    im = Image.fromarray((rgb * 255).astype(np.uint8), "RGB").convert("RGBA"); im.putalpha(m)
    return im


# a single petal standing upright, centred, used as the window shape in the transitions
WIN = Image.new("L", (600, 600), 0)
ImageDraw.Draw(WIN).ellipse([300 - 78, 300 - 288 + 24 + 130, 300 + 78, 300 + 42 + 130], fill=255)
WIN = WIN.crop(WIN.getbbox())


def window_mask(k, rot):
    """Petal-shaped window growing from the centre until it covers the screen (k 0..1)."""
    s = .02 + 9.0 * in_cubic(k) + .25 * k
    h = int(H * s); w = int(h * WIN.width / WIN.height)
    m = Image.new("L", (W, H), 0)
    if h < 4: return m
    if h > 6 * H: return Image.new("L", (W, H), 255)
    q = WIN.resize((w, h), Image.BILINEAR).rotate(rot, expand=True, resample=Image.BILINEAR)
    m.paste(q, (W // 2 - q.width // 2, H // 2 - q.height // 2))
    return m


yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
VIGN = np.clip(1.15 - .75 * (((xx - W / 2) / (W * .62)) ** 2 + ((yy - H / 2) / (H * .62)) ** 2), .15, 1)[..., None]
BOKEH = [(rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(.3, 1), rnd.choice(PETALS + ((255, 255, 255),)), rnd.uniform(0, 6)) for _ in range(46)]
GRAIN = [np.random.default_rng(s).normal(0, .018, (H // 2, W // 2, 1)).astype(np.float32) for s in range(4)]


def grain(f, n):
    g = GRAIN[n % 4]; return f + np.repeat(np.repeat(g, 2, 0), 2, 1)


def leak(t, t0, col=(255, 140, 60)):
    """A warm light leak sweeping across, as on film, around time t0."""
    k = (t - t0 + .3) / .6
    if not 0 < k < 1: return None
    cx = -400 + k * (W + 800); a = math.sin(k * math.pi) * .55
    g = np.exp(-(((xx[::4, ::4] - cx) / 520) ** 2 + ((yy[::4, ::4] - H * .3) / 700) ** 2))[..., None]
    return up(g * np.array(col, np.float32) / 255 * a)


def bg_dark(t, clip, t0):
    base = arr(clip.frame(t - t0).resize((W // 8, H // 8), Image.BILINEAR).filter(ImageFilter.GaussianBlur(3)))
    f = up(base * .22 + np.array((6, 7, 16), np.float32) / 255 * .8)
    lay = Image.new("RGB", (W // 4, H // 4)); d = ImageDraw.Draw(lay)
    for x0, y0, depth, col, ph in BOKEH:
        x = ((x0 - t * 40 * depth) % (W + 200) - 100) / 4; y = (y0 + 20 * math.sin(t * .5 + ph)) / 4; r = 2 + 8 * depth
        a = (.12 + .1 * math.sin(t * 1.4 + ph)); d.ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(v * a) for v in col))
    return f + up(arr(lay.filter(ImageFilter.GaussianBlur(1.5))))


def word_img(text, col, size=170, bar=True):
    fnt = ImageFont.truetype(WORD_FONT, size)
    x0, y0, x1, y1 = ImageDraw.Draw(Image.new("L", (10, 10))).textbbox((0, 0), text, font=fnt)
    w, h = x1 - x0 + 70, y1 - y0 + (90 if bar else 50)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    sh = Image.new("L", (w, h), 0); ImageDraw.Draw(sh).text((30 - x0, 20 - y0), text, font=fnt, fill=170)
    im.paste((0, 0, 0, 255), (6, 8), sh.filter(ImageFilter.GaussianBlur(10)))
    d.text((30 - x0, 20 - y0), text, font=fnt, fill=(255, 255, 255, 255))
    if bar: d.rounded_rectangle([34, h - 46, 34 + min(w - 70, 520), h - 30], 8, fill=col + (255,))
    return im


def fade_img(im, a):
    q = im.copy(); q.putalpha(q.split()[3].point(lambda v: int(v * a))); return q


def rays(t, c):
    a = clamp((t - HIT) / .3) * (1 - clamp((t - HIT - 1.6) / 1.4))
    if a <= 0: return None
    L = Image.new("RGB", (W // 2, H // 2)); d = ImageDraw.Draw(L); cx, cy = c[0] / 2, c[1] / 2
    for j in range(14):
        an = math.radians(j * 360 / 14 + t * 10); w = math.radians(1.6)
        d.polygon([(cx, cy), (cx + 1400 * math.cos(an - w), cy + 1400 * math.sin(an - w)), (cx + 1400 * math.cos(an + w), cy + 1400 * math.sin(an + w))],
                  fill=tuple(int(v * .5 * a) for v in (255, 235, 215)))
    ys, xs = np.mgrid[0:H // 2, 0:W // 2].astype(np.float32)
    return arr(L) * np.exp(-np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / 260)[..., None]


def hit_light(t, c, sparks):
    k = t - HIT
    if k < 0 or k > 2.2: return None
    L = Image.new("RGB", (W // 2, H // 2)); d = ImageDraw.Draw(L); cx, cy = c[0] / 2, c[1] / 2; a = math.exp(-k * 3.2)
    hw = 950 * (.4 + .6 * out_cubic(k / .4))
    d.ellipse([cx - hw, cy - 3, cx + hw, cy + 3], fill=tuple(int(v * a) for v in (180, 210, 255)))
    rr = 40 + 900 * out_cubic(k / 1.2)
    d.ellipse([cx - rr, cy - rr * .9, cx + rr, cy + rr * .9], outline=tuple(int(v * a * .8) for v in (255, 220, 200)), width=max(1, int(10 * a)))
    for an, v, col, sz in sparks:
        r0 = v * k * (1 - k * .28); r1 = r0 + 30 * math.exp(-k * 2); f = math.exp(-k * 2.2)
        d.line([(cx + r0 * math.cos(an), cy + r0 * math.sin(an) + 40 * k * k), (cx + r1 * math.cos(an), cy + r1 * math.sin(an) + 40 * k * k)],
               fill=tuple(int(q * f) for q in col), width=max(1, int(sz * f + .5)))
    return arr(L)


def comp(f, layer, a=1.0):
    x = np.asarray(layer, np.float32) / 255; al = x[..., 3:4] * a
    return f * (1 - al) + x[..., :3] * al, x


def make(out):
    wide = Image.open(LOGO).convert("RGBA"); al = np.array(wide)[..., 3]; cols = (al > 40).any(0)
    runs, s = [], None
    for i, c in enumerate(cols):
        if c and s is None: s = i
        if not c and s is not None: runs.append([s, i]); s = None
    if s is not None: runs.append([s, len(cols)])
    parts = []
    for r in runs:
        if parts and r[0] - parts[-1][1] <= 4: parts[-1][1] = r[1]
        else: parts.append(r)
    mark, letters = parts[0], parts[1:]
    sc = 1180 / wide.width; LW, LH = int(wide.width * sc), int(wide.height * sc); big = wide.resize((LW, LH), Image.LANCZOS)
    lx, ly = (W - LW) // 2, int(H * .40 - LH / 2)
    glyphs = [(big.crop((int(x0 * sc) - 3, 0, int(x1 * sc) + 3, LH)), lx + int(x0 * sc) - 3) for x0, x1 in letters]
    mark_w = (mark[1] - mark[0]) * sc; end_c = (lx + mark[0] * sc + mark_w / 2, ly + LH / 2)
    probe = Image.new("RGBA", (400, 400)); [probe.alpha_composite(petal(400, i, c)) for i, c in enumerate(PETALS)]
    bb = probe.getbbox(); Sfin = int(mark_w / ((bb[2] - bb[0]) / 400)); Sbig = int(Sfin * 2.3)
    PET = [petal(Sbig, i, c) for i, c in enumerate(PETALS)]
    bug = Image.open(BUG).convert("RGBA"); bug = fade_img(bug.resize((230, int(230 * bug.height / bug.width)), Image.LANCZOS), .8)
    words = {}
    for i, w in enumerate(dict.fromkeys([a[2] for a in ACT1] + [a[2] for a in ACT2])): words[w] = word_img(w, PETALS[i % 4])
    big_words = [word_img(w, PETALS[i % 4], 230, bar=False) for i, w in enumerate(ACT3_WORDS)]
    tag_font = ImageFont.truetype(LATIN if os.path.exists(LATIN) else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 34)
    tagline = "MOVIES   ·   KIDS   ·   SPORTS   ·   NEWS   ·   TRAVEL"
    sparks = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(160, 620), rnd.choice(PETALS + ((255, 240, 220),)), rnd.uniform(1.5, 3.5)) for _ in range(110)]
    cf = ImageFont.truetype(LATIN if os.path.exists(LATIN) else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 21)
    print("fetching clips", flush=True)
    clips = {n: Clip(n, 9.0 if n == "sintel-cliff" else 3.2) for n in CLIPS}
    fr = tempfile.mkdtemp()
    for n in range(N):
        t = n / FPS
        light = np.zeros((H // 2, W // 2, 3), np.float32); lay = None; bug_on = 2 <= t < 21
        if t < 2:
            # intro: the four petals light up one per beat, then the orange one flies at the camera
            f = np.zeros((H, W, 3), np.float32) + np.array((6, 7, 16), np.float32) / 255
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); S = int(Sbig * (1 + .15 * t))
            spin = 40 * (1 - out_cubic(t / 1.6))
            fl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            for i in range(4):
                k = clamp((t - .1 - .45 * i) / .35)
                if k > 0: fl.alpha_composite(fade_img(PET[i].resize((S, S), Image.BILINEAR), k))
            fl = fl.rotate(spin, resample=Image.BICUBIC)
            lay.alpha_composite(fl, (W // 2 - S // 2, H // 2 - S // 2))
            L = Image.new("RGB", (W // 2, H // 2)); ImageDraw.Draw(L).ellipse([W / 4 - 130, H / 4 - 130, W / 4 + 130, H / 4 + 130], fill=(90, 50, 40))
            light = light + arr(L) * clamp(t / 1.4)
            k = (t - 1.65) / .35                              # the first show opens out of an orange petal
            if k > 0:
                m = arr(window_mask(k, -15))[..., None]
                rim = arr(window_mask(min(1, k * 1.05 + .02), -15))[..., None]
                nxt = arr(push(clips[ACT1[0][1]].frame(0), 0, 1.15, 1.15))
                f = f * (1 - rim) + np.array(ORG, np.float32) / 255 * rim
                f = f * (1 - m) + nxt * m
        elif t < 10:
            i = min(7, int(t - 2)); a, name, word = ACT1[i]; k = t - a
            punch = 1.15 - .1 * out_cubic(k / .4)
            f = arr(push(clips[name].frame(k), k, punch, punch + .05, dx=(-1) ** i * .4 * k))
            if i < 7 and k > .65:                             # the next show opens out of a petal window
                kk = (k - .65) / .35; nm = ACT1[i + 1][1]
                m = arr(window_mask(kk, (-15, 75, 165, 255)[(i + 1) % 4]))[..., None]
                rim = arr(window_mask(min(1, kk * 1.05 + .02), (-15, 75, 165, 255)[(i + 1) % 4]))[..., None]
                nxt = arr(push(clips[nm].frame(0), 0, 1.15, 1.15))
                col = np.array(PETALS[(i + 1) % 4], np.float32) / 255
                f = f * (1 - rim) + col * rim; f = f * (1 - m) + nxt * m
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); first = i % 2 == 0
            wi = words[word]; ws = clamp((t - ACT1[i - (0 if first else 1)][0]) / .3)
            reveal = out_cubic(ws); q = wi.crop((0, 0, max(1, int(wi.width * reveal)), wi.height))
            drift = (t - ACT1[i - (0 if first else 1)][0]) * 25
            lay.alpha_composite(q, (110 + int(drift), H - 150 - wi.height))
            if k > .85 and i % 2 == 1:                        # the word leaves with the pair
                lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        elif t < 14:
            # three tall panels slide past each other
            j = 0 if t < 12 else 1; a, names, word = ACT2[j]; k = t - a
            f = np.zeros((H, W, 3), np.float32) + np.array((6, 7, 16), np.float32) / 255
            cv = to_img(f).convert("RGBA"); gap = 14; pw = (W - 4 * gap) // 3
            for p, nm in enumerate(names):
                e = out_cubic((k - .08 * p) / .55); out_k = in_cubic((k - 1.7) / .3)
                dirn = 1 if p == 1 else -1
                y = dirn * (1 - e) * H - dirn * out_k * H + dirn * -20 * k
                frm = clips[nm].frame(k); zoom = 1.1 + .05 * k
                src = push(frm, 0, zoom, zoom)
                cx0 = (W - int(H * pw / H)) // 2
                panel = src.crop((W // 2 - pw // 2, 0, W // 2 + pw // 2, H)).convert("RGBA")
                ImageDraw.Draw(panel).rectangle([0, 0, panel.width - 1, H - 1], outline=PETALS[(p + j) % 4] + (255,), width=5)
                cv.alpha_composite(panel, (gap + p * (pw + gap), int(y)))
            f = arr(cv.convert("RGB"))
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); wi = words[word]
            reveal = out_cubic(k / .3) * (1 - in_cubic((k - 1.75) / .25))
            if reveal > 0:
                q = wi.crop((0, 0, max(1, int(wi.width * reveal)), wi.height)); lay.alpha_composite(q, (110 + int(k * 25), H - 150 - wi.height))
        elif t < 18:
            # rapid fire: one show and one big word per beat
            i = min(7, int((t - 14) / .5)); k = (t - 14) - i * .5
            punch = 1.28 - .28 * out_cubic(k / .3)
            f = arr(push(clips[ACT3[i]].frame(k), 0, punch, punch, dx=(-1) ** i * .3))
            if k < .08: f = f + (1 - k / .08) * .55                # white flash on the cut
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); wi = big_words[i]
            z = 1.5 - .5 * out_cubic(k / .18); q = wi.resize((int(wi.width * z), int(wi.height * z)), Image.BILINEAR)
            q = fade_img(q, clamp(k / .1))
            for dx, colr in ((-7, PNK), (7, (0, 200, 230))):     # colour fringes for a punchy look
                tint = Image.new("RGBA", q.size, colr + (0,)); tint.putalpha(q.split()[3].point(lambda v: int(v * .45)))
                lay.alpha_composite(tint, (W // 2 - q.width // 2 + dx, H // 2 - q.height // 2))
            lay.alpha_composite(q, (W // 2 - q.width // 2, H // 2 - q.height // 2))
        elif t < HIT:
            # pull back from one show to a 3x3 wall; the screens turn to petal colours and fly into the middle
            f = np.zeros((H, W, 3), np.float32) + np.array((6, 7, 16), np.float32) / 255
            cv = to_img(f).convert("RGBA"); k = t - 18
            Z = 3.15 - 2.15 * inout(k / 1.6) - .06 * clamp((k - 1.6) / 1.4)
            gap = 22; tw, th = (W - 4 * gap) / 3, (H - 4 * gap) / 3
            for idx, nm in enumerate(WALL):
                r, c = idx // 3, idx % 3
                cx, cy = gap + tw / 2 + c * (tw + gap), gap + th / 2 + r * (th + gap)
                fly = in_cubic((k - 3.25 - .03 * idx) / .6)
                sx, sy = W / 2 + (cx - W / 2) * Z * (1 - fly), H / 2 + (cy - H / 2) * Z * (1 - fly)
                w, h = int(tw * Z * (1 - .9 * fly)), int(th * Z * (1 - .9 * fly))
                if w < 4 or sx + w / 2 < 0 or sx - w / 2 > W or sy + h / 2 < 0 or sy - h / 2 > H: continue
                im = push(clips[nm].frame(k), k / 4, 1.0, 1.06, size=(w, h)).convert("RGBA")
                tc = clamp((k - 2.7 - .05 * idx) / .2)            # turns into a petal colour
                if tc > 0: im = Image.blend(im, Image.new("RGBA", (w, h), PETALS[idx % 4] + (255,)), tc)
                ImageDraw.Draw(im).rectangle([0, 0, w - 1, h - 1], outline=(255, 255, 255, 160), width=max(1, int(3 * Z)))
                rot = fly * (200 if idx % 2 else -200)
                if rot: im = im.rotate(rot, expand=True, resample=Image.BILINEAR)
                cv.alpha_composite(im, (int(sx - im.width / 2), int(sy - im.height / 2)))
            f = arr(cv.convert("RGB"))
            kk = (t - (HIT - .4)) / .4
            if kk > 0: light = light + kk * kk * .6
        else:
            # the Spark Flower and "spark tv"
            mv = inout((t - HIT - 1.3) / .9)
            c = (W / 2 + (end_c[0] - W / 2) * mv, H / 2 + (end_c[1] - H / 2) * mv)
            f = bg_dark(t, clips["sintel-cliff"], HIT)
            for x in (rays(t, c), hit_light(t, c, sparks)):
                if x is not None: light = light + x
            if t - HIT < .2: light = light + (1 - (t - HIT) / .2) * .9
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); k = t - HIT
            grow = [out_back((k - .05 * i) / .55, 2.4) for i in range(4)]
            pulse = 1 + .06 * math.sin(k * 6) * math.exp(-k * 1.8)
            S = int((Sbig + (Sfin - Sbig) * mv) * pulse)
            fl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            for i in range(4):
                g = max(.02, grow[i]); gs = max(2, int(S * g)); q = PET[i].resize((gs, gs), Image.BILINEAR)
                fl.alpha_composite(q, ((S - gs) // 2, (S - gs) // 2)) if gs <= S else fl.alpha_composite(q.crop(((gs - S) // 2, (gs - S) // 2, (gs + S) // 2, (gs + S) // 2)))
            rot = -70 * (1 - out_cubic(k / 1.1)) + 4 * math.sin(t * 1.1) * (1 - mv)
            if abs(rot) > .05: fl = fl.rotate(rot, resample=Image.BICUBIC)
            lay.alpha_composite(fl, (int(c[0] - S / 2), int(c[1] - S / 2)))
            for j, (g, gx) in enumerate(glyphs):
                kk = clamp((t - (HIT + 1.75 + .09 * j + (.2 if j >= 5 else 0))) / .55)
                if kk <= 0: continue
                e = out_back(kk, 1.8); dy = (1 - e) * (70 if j < 5 else -70)
                lay.alpha_composite(fade_img(g, clamp(kk * 2.2)), (gx, int(ly + dy)))
            for g0 in (HIT + 3.4, HIT + 6.0):
                gk = (t - g0) / .8
                if 0 < gk < 1:
                    la = np.asarray(lay, np.float32).copy()
                    band = np.exp(-(((xx + yy * .35) - (lx - 300 + gk * (LW + 900))) / 55) ** 2)[..., None]
                    la[..., :3] = la[..., :3] + (255 - la[..., :3]) * band * .85
                    lay = Image.fromarray(la.astype(np.uint8), "RGBA")
            top = ly + LH + 6
            refl = lay.crop((0, 2 * top - H, W, top)).transpose(Image.FLIP_TOP_BOTTOM)
            ra = np.asarray(refl, np.float32) / 255
            fd = np.clip(1 - np.arange(refl.height) / 150, 0, 1)[:, None, None] ** 1.6 * .2
            a_ = ra[..., 3:4] * fd; f[top:H] = f[top:H] * (1 - a_) + ra[..., :3] * a_
            tk = clamp((t - (HIT + 3.0)) / .8)                # the line of what's on, letter by letter
            if tk > 0:
                d = ImageDraw.Draw(lay); n_ch = int(len(tagline) * tk); txt = tagline[:n_ch]
                full = d.textlength(tagline, font=tag_font)
                d.text(((W - full) / 2, ly + LH + 120), txt, font=tag_font, fill=(225, 228, 238, int(235 * min(1, tk * 1.5))))
        # light leaks between the acts
        for t0 in (10, 14, 18):
            lk = leak(t, t0)
            if lk is not None: f = f + lk
        if light.max() > 0:
            light = np.clip(light, 0, 1)
            f = f + up(light) * (.8 if t >= HIT or t < 2 else .3) + up(blur(light[::2, ::2], 10)) * (1.6 if t >= HIT or t < 2 else 1.0)
        if lay is not None:
            f, la = comp(f, lay)
            if t >= HIT or t < 2: f = f + up(blur(la[::4, ::4, :3] * la[::4, ::4, 3:4], 6)) * .35
        f = f * (VIGN if (t >= HIT or t < 2) else (.3 + .7 * VIGN))
        f = grain(f, n)
        img = to_img(f)
        if bug_on: img.paste(bug, (W - 60 - bug.width, 50), bug)
        ck = clamp((t - HIT - 4.0) / .5) * (1 - clamp((t - (SECS - .7)) / .4))
        if ck > 0:
            d = ImageDraw.Draw(img, "RGBA"); txt = credit(MOOD) + "  ·  Clips: Blender Foundation (CC BY), public domain, Spark TV"
            d.text((W - 44 - d.textlength(txt, font=cf), H - 56), txt, font=cf, fill=(255, 255, 255, int(105 * ck)))
        if t > SECS - .6:
            img = Image.blend(img, Image.new("RGB", (W, H)), clamp((t - (SECS - .6)) / .55))
        img.save(f"{fr}/{n:04d}.jpg", quality=95)
        if n % 75 == 0: print("frame", n, flush=True)
    x = bed(MOOD, SECS + .3, start_bar=20, fade_in=.05, fade_out=1.8)[: int(SECS * SR)]
    wav = os.path.join(fr, "m.wav"); save(wav, x * .72)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", f"{fr}/%04d.jpg", "-i", wav,
                    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out], check=True)
    Image.open(f"{fr}/{int((HIT + 5.5) * FPS):04d}.jpg").save(out[:-4] + "-poster.jpg", quality=88)
    print("made", out)


if __name__ == "__main__":
    make(sys.argv[1])
