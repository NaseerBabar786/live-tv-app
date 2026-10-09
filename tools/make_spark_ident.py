"""The Spark TV network ident: one 20-second montage that runs on every Spark channel.

Owner (2026-10-08/09): a real TV-station moving logo, English only, one for the whole network; after v1-v3 the
owner asked for much more movement, sent a reference and confirmed: a montage of quick clips from our own
channels cut together around the Spark logo.

Story (120 BPM, cut on the beat): petal-coloured slashes open the screen; clips from our channels cut every
two beats with big words (MOVIES, KIDS, SPORTS, TRAVEL), then every beat (NEWS, CLASSICS, COMEDY, ADVENTURE);
a 2x2 split of four channels; four petals filled with moving pictures fly in and lock on the bar, turn into
the Spark Flower and "spark tv" rises over a soft moving background; a glint, hold, fade.
Clips: our channels' own free films (Blender Foundation open movies, CC BY; Superman 1941, public domain) and
the news b-roll from our releases. Music: "Inspiring Advertising" by Rafael Krux (CC BY 4.0), credited on screen.

Usage: python3 tools/make_spark_ident.py OUT.mp4
Needs Pillow, numpy and ffmpeg (clips are read straight from our GitHub releases).
"""
import math, os, random, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "music"))
from library import bed, credit, save, SR  # noqa: E402

W, H, FPS, SECS = 1920, 1080, 25, 20.0
N = int(FPS * SECS)
MOOD = "feelgood"            # Inspiring Advertising, 120 BPM: a beat is 0.5 s, a bar 2 s
HIT = 14.0                   # the petals lock together on a bar line
ORG, PNK, VIO, YEL = (255, 106, 0), (255, 45, 120), (124, 58, 237), (255, 196, 0)
PETALS = (ORG, PNK, VIO, YEL)
REL = "https://github.com/NaseerBabar786/live-tv-app/releases/download/"
LOGO = os.path.join(HERE, "spark_logos", "spark-tv.png")
BUG = os.path.join(HERE, "..", "docs", "channel", "logos", "spark-tv.png")   # stacked corner logo
WORD_FONT = os.path.join(HERE, "fonts", "Poppins-BlackItalic.ttf")
LATIN = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
WIDE = "crop=1280:536:0:92,"     # the open movies are 2.39:1 inside 16:9: cut the black bars off
BOX43 = "crop=960:720:160:0,"    # Superman 1941 is 4:3 inside 16:9
# name: (file, start s, pre-crop)
CLIPS = {
    "tos-dome": ("channel-media/tears-of-steel.mp4", 219, WIDE), "sintel-roof": ("channel-media/sintel.mp4", 180, WIDE),
    "bunny-fly": ("channel-media/big-buck-bunny.mp4", 425, ""), "llama": ("channel-media/caminandes-gran-dillama.mp4", 16.5, ""),
    "cricket": ("news-broll/broll-cricket-56bb9390.mp4", 1, ""), "football": ("news-broll/broll-football-d0b68c12.mp4", 2, ""),
    "plane": ("news-broll/broll-india-a0c307bc.mp4", 2, ""), "toronto": ("news-broll/broll-canada-5f4338e4.mp4", 2, ""),
    "earth": ("news-broll/broll-world-866918d5.mp4", 2, ""), "superman": ("channel-media/superman-1941.mp4", 120, BOX43),
    "wingit": ("channel-media/wing-it.mp4", 159.5, ""), "tos-ship": ("channel-media/tears-of-steel.mp4", 110.5, WIDE),
    "tos-lab": ("channel-media/tears-of-steel.mp4", 543, WIDE), "bunny": ("channel-media/big-buck-bunny.mp4", 59, ""),
    "cosmos": ("channel-media/cosmos-laundromat.mp4", 499, WIDE), "traffic": ("news-broll/broll-india-b8ce65c8.mp4", 2, ""),
    "sintel-girl": ("channel-media/sintel.mp4", 574, WIDE), "llama2": ("channel-media/caminandes-gran-dillama.mp4", 58.5, ""),
    "stadium": ("news-broll/broll-sports-303a1d1e.mp4", 2, ""), "city": ("news-broll/broll-world-81301e9c.mp4", 2, ""),
}
# full-screen montage: (start, end, clip, word)
CUTS = [(1, 2, "tos-dome", "MOVIES"), (2, 3, "sintel-roof", "MOVIES"), (3, 4, "bunny-fly", "KIDS"), (4, 5, "llama", "KIDS"),
        (5, 6, "cricket", "SPORTS"), (6, 7, "football", "SPORTS"), (7, 8, "plane", "TRAVEL"), (8, 9, "toronto", "TRAVEL"),
        (9, 9.5, "earth", "NEWS"), (9.5, 10, "superman", "CLASSICS"), (10, 10.5, "wingit", "COMEDY"), (10.5, 11, "tos-ship", "ADVENTURE")]
SPLIT = ["tos-lab", "bunny", "cosmos", "traffic"]            # 11-13 s: four channels at once
PETAL_CLIPS = ["sintel-girl", "llama2", "stadium", "city"]   # 12.6-14 s: the petals fly in full of pictures
rnd = random.Random(21)


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
def blur(x, r):
    out = np.empty_like(x)
    for c in range(3):
        out[..., c] = arr(Image.fromarray(np.clip(x[..., c] * 255, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(r)))
    return out
def up(x, w=W, h=H):
    return arr(Image.fromarray(np.clip(x * 255, 0, 255).astype(np.uint8), "RGB").resize((w, h), Image.BILINEAR))


# ---------- clips ----------
class Clip:
    """A few seconds of one of our channels' shows as 1920x1080 frames, read on demand."""
    def __init__(self, name, secs=2.6):
        f, start, pre = CLIPS[name]
        self.dir = tempfile.mkdtemp(prefix=name + "-")
        vf = pre + "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,unsharp=5:5:0.6,fps=25"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(start), "-i", REL + f, "-t", str(secs), "-an",
                        "-vf", vf, "-q:v", "3", f"{self.dir}/%04d.jpg"], check=True, timeout=900)
        self.n = len(os.listdir(self.dir)); self.cache = {}

    def frame(self, t):
        i = min(self.n, max(1, int(t * FPS) + 1))
        if i not in self.cache:
            if len(self.cache) > 6: self.cache.clear()
            self.cache[i] = Image.open(f"{self.dir}/{i:04d}.jpg").convert("RGB")
        return self.cache[i]


def push(im, k, z0=1.0, z1=1.08, dx=0.0):
    """Slow camera push on a picture: k 0..1 through the shot."""
    z = z0 + (z1 - z0) * k; w, h = im.size; cw, ch = w / z, h / z
    x0 = (w - cw) / 2 + dx * (w - cw) / 2
    return im.crop((int(x0), int((h - ch) / 2), int(x0 + cw), int((h + ch) / 2))).resize((W, H), Image.BILINEAR)


# ---------- the Spark Flower ----------
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


# ---------- background for the logo ----------
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
VIGN = np.clip(1.15 - .75 * (((xx - W / 2) / (W * .62)) ** 2 + ((yy - H / 2) / (H * .62)) ** 2), .15, 1)[..., None]
BOKEH = [(rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(.3, 1), rnd.choice(PETALS + ((255, 255, 255),)), rnd.uniform(0, 6)) for _ in range(46)]


def logo_bg(t, clip):
    """A show keeps moving behind the logo, blurred and dark; colour lights drift over it."""
    base = arr(clip.frame(t - 12.6).resize((W // 8, H // 8), Image.BILINEAR).filter(ImageFilter.GaussianBlur(3)))
    f = up(base * .22 + np.array((6, 7, 16), np.float32) / 255 * .8)
    lay = Image.new("RGB", (W // 4, H // 4)); d = ImageDraw.Draw(lay)
    for x0, y0, depth, col, ph in BOKEH:
        x = ((x0 - t * 40 * depth) % (W + 200) - 100) / 4; y = (y0 + 20 * math.sin(t * .5 + ph)) / 4; r = 2 + 8 * depth
        a = (.12 + .1 * math.sin(t * 1.4 + ph)); d.ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(v * a) for v in col))
    return f + up(arr(lay.filter(ImageFilter.GaussianBlur(1.5))))


# ---------- light: slashes, flash, rays, sparks ----------
def slash(L, k, col, ang=-18, width=420, rev=False):
    """A wide coloured band sweeping across the screen (k 0..1)."""
    d = ImageDraw.Draw(L); s = L.size[0] / W
    x = (-width * 2 + k * (W + width * 4)) if not rev else (W + width * 2 - k * (W + width * 4))
    dx = math.tan(math.radians(ang)) * H
    d.polygon([((x - width / 2) * s, 0), ((x + width / 2) * s, 0), ((x + width / 2 + dx) * s, H * s), ((x - width / 2 + dx) * s, H * s)], fill=col)


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


def word_img(text, col):
    """A big slanted word with a petal-colour bar under it."""
    fnt = ImageFont.truetype(WORD_FONT, 170)
    d0 = ImageDraw.Draw(Image.new("L", (10, 10))); x0, y0, x1, y1 = d0.textbbox((0, 0), text, font=fnt)
    w, h = x1 - x0 + 60, y1 - y0 + 90
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    sh = Image.new("L", (w, h), 0); ImageDraw.Draw(sh).text((30 - x0, 20 - y0), text, font=fnt, fill=170)
    im.paste((0, 0, 0, 255), (6, 8), sh.filter(ImageFilter.GaussianBlur(10)))      # soft shadow
    d.text((30 - x0, 20 - y0), text, font=fnt, fill=(255, 255, 255, 255))
    d.rounded_rectangle([34, h - 46, 34 + min(w - 70, 520), h - 30], 8, fill=col + (255,))
    return im


def make(out):
    # logo parts
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
    lx, ly = (W - LW) // 2, int(H * .43 - LH / 2)
    glyphs = [(big.crop((int(x0 * sc) - 3, 0, int(x1 * sc) + 3, LH)), lx + int(x0 * sc) - 3) for x0, x1 in letters]
    mark_w = (mark[1] - mark[0]) * sc; end_c = (lx + mark[0] * sc + mark_w / 2, ly + LH / 2)
    probe = Image.new("RGBA", (400, 400)); [probe.alpha_composite(petal(400, i, c)) for i, c in enumerate(PETALS)]
    bb = probe.getbbox(); Sfin = int(mark_w / ((bb[2] - bb[0]) / 400)); Sbig = int(Sfin * 2.3)
    PET = [petal(Sbig, i, c) for i, c in enumerate(PETALS)]; MASK = [petal_mask(Sbig, i) for i in range(4)]
    bug = Image.open(BUG).convert("RGBA"); bug = bug.resize((230, int(230 * bug.height / bug.width)), Image.LANCZOS)
    bug.putalpha(bug.split()[3].point(lambda v: int(v * .8)))
    words = {w: word_img(w, PETALS[i % 4]) for i, w in enumerate(dict.fromkeys(c[3] for c in CUTS))}
    sparks = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(160, 620), rnd.choice(PETALS + ((255, 240, 220),)), rnd.uniform(1.5, 3.5)) for _ in range(110)]
    cf = ImageFont.truetype(LATIN if os.path.exists(LATIN) else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    print("fetching clips", flush=True)
    clips = {n: Clip(n, 8.0 if n == PETAL_CLIPS[0] else 2.6) for n in CLIPS}   # the first petal's show also runs behind the logo
    fr = tempfile.mkdtemp()
    for n in range(N):
        t = n / FPS
        light = np.zeros((H // 2, W // 2, 3), np.float32)
        lay = None
        if t < 11:
            cut = next((c for c in CUTS if c[0] <= t < c[1]), None)
            if cut is None:                                   # the opening: petal slashes over black
                f = np.zeros((H, W, 3), np.float32) + np.array((6, 7, 16), np.float32) / 255
            else:
                a, b, name, word = cut; k = (t - a) / (b - a); ci = CUTS.index(cut)
                punch = 1.10 - .10 * out_cubic((t - a) / .3)
                f = arr(push(clips[name].frame(t - a), k, punch, punch + .05, dx=(-1) ** ci * .5 * k))
                lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                wi = words[word]; first = ci == 0 or CUTS[ci - 1][3] != word
                ws = clamp((t - a) / .22)
                if ws < 1 and first:                          # the word slams in on its first shot
                    z = 1.35 - .35 * out_cubic(ws); q = wi.resize((int(wi.width * z), int(wi.height * z)), Image.BILINEAR)
                    q.putalpha(q.split()[3].point(lambda v: int(v * ws)))
                else:
                    q = wi
                pair = next(j for j, c in enumerate(CUTS) if c[3] == word)
                drift = (t - CUTS[pair][0]) * 30
                lay.alpha_composite(q, (110 + int(drift), H - 150 - q.height))
            # a petal-colour slash covers every cut
            L = Image.new("RGB", (W // 2, H // 2))
            for j, (a, b, _, _) in enumerate(CUTS):
                k = (t - (a - .14)) / .28
                if 0 < k < 1: slash(L, k, PETALS[j % 4], ang=-18 if j % 2 else 18, width=520 if b - a > .6 else 380, rev=j % 2 == 1)
            for j in range(4):                                # opening: four slashes, one per petal colour
                k = (t - .1 - j * .2) / .42
                if 0 < k < 1: slash(L, k, PETALS[j], ang=(-1) ** j * 22, width=360)
            sl = arr(L); light = light + sl
            slf = up(sl); m = slf.max(-1, keepdims=True)
            f = f * (1 - np.clip(m * 1.4, 0, .92)) + slf      # the slash is solid colour on screen
        elif t < HIT:
            # 2x2 split: four channels at once; the grid opens, then flies apart as the petals come in
            canvas = Image.new("RGBA", (W, H), (6, 7, 16, 255))
            g = out_back((t - 11) / .5, 1.6); fade = 1 - clamp((t - 12.8) / .5); spread = 1 + 1.4 * in_cubic((t - 12.4) / .8)
            gap = 18; pw, ph = int((W - 3 * gap) / 2 * (.85 + .15 * g)), int((H - 3 * gap) / 2 * (.85 + .15 * g))
            for j, name in enumerate(SPLIT):
                cx = W / 2 + (-1 if j % 2 == 0 else 1) * (pw / 2 + gap / 2) * (1 + .5 * (1 - g)) * spread
                cy = H / 2 + (-1 if j < 2 else 1) * (ph / 2 + gap / 2) * (1 + .5 * (1 - g)) * spread
                im = push(clips[name].frame(t - 11), (t - 11) / 2, 1.0, 1.1).resize((pw, ph), Image.BILINEAR).convert("RGBA")
                ImageDraw.Draw(im).rectangle([0, 0, pw - 1, ph - 1], outline=PETALS[j] + (255,), width=6)
                if fade < 1: im.putalpha(int(255 * fade))
                canvas.alpha_composite(im, (int(cx - pw / 2), int(cy - ph / 2)))
            f = arr(canvas.convert("RGB"))
            # the four petals, each full of a moving picture, fly in and lock on the bar
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            for i in range(4):
                k = clamp((t - 12.6 - .08 * i) / (HIT - 12.6 - .08 * i))
                if k <= 0: continue
                e = out_cubic(k); ang = math.radians(135 - 90 * i) + (1 - e) * 1.2; dist = (1 - e) * 1300
                sz = int(Sbig * (1.6 - .6 * e))
                pic = push(clips[PETAL_CLIPS[i]].frame(t - 12.6), k, 1, 1.1).resize((sz, sz), Image.BILINEAR).convert("RGBA")
                pic.putalpha(MASK[i].resize((sz, sz), Image.BILINEAR))
                rot = (1 - e) * (120 if i % 2 else -120)
                if abs(rot) > .5: pic = pic.rotate(rot, resample=Image.BILINEAR)
                lay.alpha_composite(pic, (int(W / 2 + dist * math.cos(ang) - sz / 2), int(H / 2 - dist * math.sin(ang) * .6 - sz / 2)))
            k = (t - (HIT - .5)) / .5                         # light builds into the hit
            if k > 0: light = light + k * k * .5
        else:
            mv = inout((t - HIT - 1.3) / .9)
            c = (W / 2 + (end_c[0] - W / 2) * mv, H / 2 + (end_c[1] - H / 2) * mv)
            f = logo_bg(t, clips[PETAL_CLIPS[0]])
            for x in (rays(t, c), hit_light(t, c, sparks)):
                if x is not None: light = light + x
            if t - HIT < .2: light = light + (1 - (t - HIT) / .2) * .9
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); k = t - HIT
            pulse = 1 + .06 * math.sin(k * 6) * math.exp(-k * 1.8)
            S = int((Sbig + (Sfin - Sbig) * mv) * pulse)
            fl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            vid = clamp(1 - k / .5)                           # the pictures in the petals melt into the petal colours
            for i in range(4):
                q = PET[i].resize((S, S), Image.BILINEAR)
                if vid > 0:
                    pic = push(clips[PETAL_CLIPS[i]].frame(t - 12.6), 1, 1.1, 1.1).resize((S, S), Image.BILINEAR).convert("RGBA")
                    q = Image.blend(q, pic, vid); q.putalpha(MASK[i].resize((S, S), Image.BILINEAR))
                fl.alpha_composite(q)
            rot = 4 * math.sin(t * 1.1) * (1 - mv)
            if abs(rot) > .05: fl = fl.rotate(rot, resample=Image.BICUBIC)
            lay.alpha_composite(fl, (int(c[0] - S / 2), int(c[1] - S / 2)))
            for j, (g, gx) in enumerate(glyphs):
                kk = clamp((t - (HIT + 1.75 + .09 * j + (.2 if j >= 5 else 0))) / .55)
                if kk <= 0: continue
                e = out_back(kk, 1.8); dy = (1 - e) * (70 if j < 5 else -70)
                q = g.copy(); q.putalpha(q.split()[3].point(lambda v, a=clamp(kk * 2.2): int(v * a)))
                lay.alpha_composite(q, (gx, int(ly + dy)))
            for g0 in (HIT + 3.1, HIT + 4.9):
                gk = (t - g0) / .8
                if 0 < gk < 1:
                    la = np.asarray(lay, np.float32).copy()
                    band = np.exp(-(((xx + yy * .35) - (lx - 300 + gk * (LW + 900))) / 55) ** 2)[..., None]
                    la[..., :3] = la[..., :3] + (255 - la[..., :3]) * band * .85
                    lay = Image.fromarray(la.astype(np.uint8), "RGBA")
            top = ly + LH + 6                                 # glossy floor
            refl = lay.crop((0, 2 * top - H, W, top)).transpose(Image.FLIP_TOP_BOTTOM)
            ra = np.asarray(refl, np.float32) / 255
            fd = np.clip(1 - np.arange(refl.height) / 170, 0, 1)[:, None, None] ** 1.6 * .22
            a_ = ra[..., 3:4] * fd; f[top:H] = f[top:H] * (1 - a_) + ra[..., :3] * a_
        # light and bloom
        if light.max() > 0:
            light = np.clip(light, 0, 1)
            f = f + up(light) * (.25 if t < 11 else .8) + up(blur(light[::2, ::2], 10)) * (.9 if t < 11 else 1.6)
        if lay is not None:
            f, la = comp(f, lay)
            if t >= HIT: f = f + up(blur(la[::4, ::4, :3] * la[::4, ::4, 3:4], 6)) * .35
        f = f * (VIGN if t >= HIT else (.25 + .75 * VIGN))
        img = Image.fromarray((np.clip(f, 0, 1) * 255).astype(np.uint8), "RGB")
        if 1 <= t < 12.6:                                     # our corner logo during the montage
            img.paste(bug, (W - 60 - bug.width, 50), bug)
        ck = clamp((t - HIT - 2.6) / .5) * (1 - clamp((t - (SECS - .7)) / .4))
        if ck > 0:
            d = ImageDraw.Draw(img, "RGBA"); txt = credit(MOOD) + "  ·  Clips: Blender Foundation (CC BY), public domain"
            d.text((W - 44 - d.textlength(txt, font=cf), H - 58), txt, font=cf, fill=(255, 255, 255, int(110 * ck)))
        if t > SECS - .5:
            img = Image.blend(img, Image.new("RGB", (W, H)), clamp((t - (SECS - .5)) / .45))
        img.save(f"{fr}/{n:04d}.jpg", quality=95)
        if n % 50 == 0: print("frame", n, flush=True)
    x = bed(MOOD, SECS + .3, start_bar=20, fade_in=.05, fade_out=1.4)[: int(SECS * SR)]   # from 40 s, like the Spark ads
    wav = os.path.join(fr, "m.wav"); save(wav, x * .72)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", f"{fr}/%04d.jpg", "-i", wav,
                    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out], check=True)
    Image.open(f"{fr}/{int((HIT + 4) * FPS):04d}.jpg").save(out[:-4] + "-poster.jpg", quality=88)
    print("made", out)


if __name__ == "__main__":
    make(sys.argv[1])
