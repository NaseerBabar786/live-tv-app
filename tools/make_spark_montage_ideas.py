"""Two more Spark TV montage ideas (owner, 2026-10-09: "make a couple of montage ideas for Spark TV").

Both are 20 s on the 120 BPM grid of "Inspiring Advertising" (Rafael Krux, CC BY 4.0) and end on the Spark Flower,
like the approved v5 montage (tools/make_spark_montage.py, whose clips and drawing helpers this reuses):

  languages  One TV, four languages. A 2x2 wall draws itself in the language colours, fills one screen per beat,
             then URDU, HINDI, ENGLISH and PUNJABI each take the whole screen in turn; the four screens fold into
             the four petals of the flower.
  carousel   Channel surfing. Our shows glide past on a carousel of screens, one per beat, faster and faster,
             then rapid-fire cuts and sliding strips before the flower blooms.

  remote     The remote. A TV switches on and flips through the Spark channels, faster and faster, with the channel
             banner each time; the channel list scrolls, the TV switches off to a dot of light, and the flower blooms.
  mosaic     Every screen makes the flower. One show full screen, the camera pulls back and back: it is one of
             hundreds of screens, and the screens in the four petals take on the petal colours until they are the flower.

  panels     Rhythm panels (real footage only). Slanted panels split the screen on the beat, a wall of cards flips,
             four columns take the petal colours and swing into the flower.
  fly        Fly-through (real footage only). Every shot holds the next one in a window at its centre; the camera
             flies through window after window, faster and faster, into the flower.

  gallery    Calm gallery (real footage only), the fly-through's replacement: big postcards glide in from the right one
             after another, then four cards take the petal colours and slide together into the flower.

  news       Spark TV News opener (real news footage only, English + Urdu): three bands of news pictures glide
             sideways, a bilingual lower third names each one, a wall of screens, then the SPARK TV NEWS title card.

Usage: python3 tools/make_spark_montage_ideas.py languages|carousel|remote|mosaic|panels|fly|gallery|news OUT.mp4
"""
import math, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_spark_montage as M  # noqa: E402
from make_spark_montage import (W, H, FPS, PETALS, ORG, PNK, Clip, push, petal, word_img, fade_img, comp, arr, to_img,  # noqa: E402
                                up, blur, clamp, out_cubic, in_cubic, inout, out_back, grain, VIGN, xx, yy, bg_dark, leak)
from library import bed, credit, save, SR  # noqa: E402

SECS = 20.0
N = int(FPS * SECS)
OUT = 15.0                       # the flower blooms here (a bar line)
DARK = np.array((6, 7, 16), np.float32) / 255
LANGS = [("URDU", (0, 168, 96)), ("HINDI", (255, 122, 0)), ("ENGLISH", (40, 120, 255)), ("PUNJABI", (232, 172, 0))]
FONT = M.LATIN if os.path.exists(M.LATIN) else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def logo_parts():
    """The wide Spark TV logo split into the flower mark and its letters, sized and placed for the ending."""
    wide = Image.open(M.LOGO).convert("RGBA"); al = np.array(wide)[..., 3]; cols = (al > 40).any(0)
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
    return dict(PET=[petal(Sbig, i, c) for i, c in enumerate(PETALS)], Sbig=Sbig, Sfin=Sfin, glyphs=glyphs,
                lx=lx, ly=ly, LW=LW, LH=LH, end_c=end_c)


class Outro:
    """The last five seconds: flash, the Spark Flower blooms, 'spark tv' rises, a line of what's on underneath."""
    def __init__(self, tagline, bg_clip):
        self.L = logo_parts(); self.tagline = tagline; self.bg = bg_clip
        self.font = ImageFont.truetype(FONT, 34)
        rnd = M.rnd
        self.sparks = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(160, 620), rnd.choice(PETALS + ((255, 240, 220),)), rnd.uniform(1.5, 3.5)) for _ in range(110)]
        M.HIT = OUT

    def frame(self, t):
        L = self.L; k = t - OUT
        mv = inout((k - 1.3) / .9)
        c = (W / 2 + (L["end_c"][0] - W / 2) * mv, H / 2 + (L["end_c"][1] - H / 2) * mv)
        f = bg_dark(t, self.bg, OUT)
        light = np.zeros((H // 2, W // 2, 3), np.float32)
        for x in (M.rays(t, c), M.hit_light(t, c, self.sparks)):
            if x is not None: light = light + x
        if k < .2: light = light + (1 - k / .2) * .9
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        grow = [out_back((k - .05 * i) / .55, 2.4) for i in range(4)]
        pulse = 1 + .06 * math.sin(k * 6) * math.exp(-k * 1.8)
        S = int((L["Sbig"] + (L["Sfin"] - L["Sbig"]) * mv) * pulse)
        fl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        for i in range(4):
            gs = max(2, int(S * max(.02, grow[i]))); q = L["PET"][i].resize((gs, gs), Image.BILINEAR)
            if gs <= S: fl.alpha_composite(q, ((S - gs) // 2, (S - gs) // 2))
            else: fl.alpha_composite(q.crop(((gs - S) // 2, (gs - S) // 2, (gs + S) // 2, (gs + S) // 2)))
        rot = -70 * (1 - out_cubic(k / 1.1))
        if abs(rot) > .05: fl = fl.rotate(rot, resample=Image.BICUBIC)
        lay.alpha_composite(fl, (int(c[0] - S / 2), int(c[1] - S / 2)))
        for j, (g, gx) in enumerate(L["glyphs"]):
            kk = clamp((k - (1.75 + .09 * j + (.2 if j >= 5 else 0))) / .55)
            if kk <= 0: continue
            e = out_back(kk, 1.8); dy = (1 - e) * (70 if j < 5 else -70)
            lay.alpha_composite(fade_img(g, clamp(kk * 2.2)), (gx, int(L["ly"] + dy)))
        gk = (k - 3.3) / .8
        if 0 < gk < 1:                                       # one glint across the letters
            la = np.asarray(lay, np.float32).copy()
            band = np.exp(-(((xx + yy * .35) - (L["lx"] - 300 + gk * (L["LW"] + 900))) / 55) ** 2)[..., None]
            la[..., :3] = la[..., :3] + (255 - la[..., :3]) * band * .85
            lay = Image.fromarray(la.astype(np.uint8), "RGBA")
        tk = clamp((k - 2.6) / .8)
        if tk > 0:
            d = ImageDraw.Draw(lay); full = d.textlength(self.tagline, font=self.font)
            d.text(((W - full) / 2, L["ly"] + L["LH"] + 120), self.tagline[:int(len(self.tagline) * tk)], font=self.font,
                   fill=(225, 228, 238, int(235 * min(1, tk * 1.5))))
        light = np.clip(light, 0, 1)
        f = f + up(light) * .8 + up(blur(light[::2, ::2], 10)) * 1.6
        f, la = comp(f, lay)
        f = f + up(blur(la[::4, ::4, :3] * la[::4, ::4, 3:4], 6)) * .35
        return f * VIGN


def label(text, col, size=64):
    """A small language or genre tag: white words on a coloured pill."""
    fnt = ImageFont.truetype(M.WORD_FONT, size)
    x0, y0, x1, y1 = ImageDraw.Draw(Image.new("L", (10, 10))).textbbox((0, 0), text, font=fnt)
    w, h = x1 - x0 + 56, y1 - y0 + 30
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], h // 2, fill=col + (235,))
    d.text((28 - x0, 15 - y0), text, font=fnt, fill=(255, 255, 255, 255))
    return im


# ------------------------------------------------------------------ idea 1: one TV, four languages
LANG_CLIPS = {  # two shows per language for its full-screen turn, the first one also fills its corner of the wall
    "URDU": ["anchor", "story"], "HINDI": ["traffic", "plane"], "ENGLISH": ["sintel-snow", "tos-robot"],
    "PUNJABI": ["cricket", "stadium"],
}


def languages(clips, outro):
    corners = [(0, 0), (1, 0), (0, 1), (1, 1)]
    gap = 16; tw, th = (W - 3 * gap) // 2, (H - 3 * gap) // 2
    tags = [label(n, c) for n, c in LANGS]
    big = [word_img(n, c, 230) for n, c in LANGS]
    sub = ImageFont.truetype(FONT, 40)

    def wall(t, zoom=1.0, focus=None, fold=0.0):
        """The 2x2 wall; [zoom] grows the [focus] screen towards full screen; [fold] shrinks all four to the centre."""
        cv = to_img(np.zeros((H, W, 3), np.float32) + DARK).convert("RGBA")
        for i, (name, col) in enumerate(LANGS):
            k = clamp((t - 1.0 - .5 * i) / .3)               # one screen fills per beat
            cx, cy = corners[i]
            x, y = gap + cx * (tw + gap), gap + cy * (th + gap); w, h = tw, th
            if focus == i:
                x, y, w, h = x * (1 - zoom), y * (1 - zoom), w + (W - w) * zoom, h + (H - h) * zoom
            if fold:
                s = 1 - .82 * fold; mx, my = W / 2 + (x + w / 2 - W / 2) * (1 - fold) * .5, H / 2 + (y + h / 2 - H / 2) * (1 - fold) * .5
                w, h = w * s, h * s; x, y = mx - w / 2, my - h / 2
            w, h = int(w), int(h)
            if w < 4 or h < 4: continue
            if k > 0:
                src = clips[LANG_CLIPS[name][0]].frame(max(0, t - 1.0 - .5 * i))
                im = push(src, clamp((t - 1) / 14), 1.1, 1.18, size=(w, h)).convert("RGBA")
                if k < 1: im = Image.blend(Image.new("RGBA", (w, h), col + (255,)), im, k)
            else:
                im = Image.new("RGBA", (w, h), DARK_RGBA)
            if fold > .35: im = Image.blend(im, Image.new("RGBA", (w, h), PETALS[i] + (255,)), clamp((fold - .35) / .4))
            d = ImageDraw.Draw(im)
            draw = clamp((t - .1 * i) / .8)                  # the frames draw themselves first
            if draw > 0:
                per = 2 * (w + h) * draw; pts = [(0, 0), (w - 1, 0), (w - 1, h - 1), (0, h - 1), (0, 0)]
                for a, b in zip(pts, pts[1:]):
                    seg = math.dist(a, b)
                    if per <= 0: break
                    q = min(1, per / seg); d.line([a, (a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q)], fill=col + (255,), width=6)
                    per -= seg
            rot = fold * (90 * (1 if i % 2 else -1))
            if rot: im = im.rotate(rot, expand=True, resample=Image.BILINEAR)
            cv.alpha_composite(im, (int(x + w / 2 - im.width / 2), int(y + h / 2 - im.height / 2)))
            if k > .5 and focus is None and not fold:
                tg = fade_img(tags[i], clamp((k - .5) * 2))
                cv.alpha_composite(tg, (int(x + 30), int(y + h - tg.height - 26)))
        return arr(cv.convert("RGB"))

    def frame(t):
        lay = None
        if t < 5:
            f = wall(t)
            if 3.2 < t < 5:                                  # the line under the wall
                lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay); txt = "ONE TV  ·  FOUR LANGUAGES"
                a = clamp((t - 3.2) / .4) * (1 - clamp((t - 4.7) / .3))
                tw_ = d.textlength(txt, font=sub); d.rounded_rectangle([(W - tw_) / 2 - 30, H / 2 - 38, (W + tw_) / 2 + 30, H / 2 + 38], 38, fill=(6, 7, 16, int(220 * a)))
                d.text(((W - tw_) / 2, H / 2 - 26), txt, font=sub, fill=(255, 255, 255, int(255 * a)))
        elif t < 13:
            i = int((t - 5) / 2); k = (t - 5) - 2 * i; name, col = LANGS[i]
            if k < .45:                                      # its screen grows out of the wall
                f = wall(t, out_cubic(k / .45), focus=i)
            else:
                nm = LANG_CLIPS[name][0 if k < 1.25 else 1]; kk = k - (.45 if k < 1.25 else 1.25)
                f = arr(push(clips[nm].frame(kk + (t - 1.0 - .5 * i if k < 1.25 else 0)), kk, 1.0, 1.08, dx=(-1) ** i * .3))
                if 1.25 <= k < 1.33: f = f + (1 - (k - 1.25) / .08) * .5
                bar = np.zeros_like(f); bar[:, :14] = np.array(col, np.float32) / 255; bar[:, -14:] = bar[:, :14]
                f = f * (1 - (bar > 0)) + bar
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); wi = big[i]
            reveal = out_cubic((k - .35) / .3) * (1 - in_cubic((k - 1.8) / .2))
            if reveal > 0:
                q = wi.crop((0, 0, max(1, int(wi.width * reveal)), wi.height)); lay.alpha_composite(q, (110 + int(k * 25), H - 150 - wi.height))
        else:
            k = t - 13
            f = wall(t, fold=in_cubic(k / 1.9))
            if k > 1.6: f = f + ((k - 1.6) / .4) ** 2 * .6
        for t0 in (5, 13):
            lk = leak(t, t0)
            if lk is not None: f = f + lk
        if lay is not None: f, _ = comp(f, lay)
        return f * (.3 + .7 * VIGN)

    return frame


DARK_RGBA = tuple(int(v * 255) for v in DARK) + (255,)

# ------------------------------------------------------------------ idea 2: channel surfing on a carousel
REEL = ["sintel-snow", "bunny-fly", "cricket", "toronto", "anchor", "tos-robot", "llama", "football", "earth", "wing-rocket",
        "superman-zap", "plane", "cosmos-sheep", "story", "stadium", "sintel-face", "bunny", "city", "wing-cat", "tos-dome",
        "traffic", "llama2", "sintel-roof", "superman-lab"]
GENRE = {"sintel-snow": "MOVIES", "tos-robot": "MOVIES", "sintel-face": "MOVIES", "cosmos-sheep": "MOVIES", "tos-dome": "MOVIES",
         "sintel-roof": "MOVIES", "bunny-fly": "KIDS", "llama": "KIDS", "wing-rocket": "KIDS", "bunny": "KIDS", "wing-cat": "KIDS",
         "llama2": "KIDS", "cricket": "SPORTS", "football": "SPORTS", "stadium": "SPORTS", "toronto": "TRAVEL", "plane": "TRAVEL",
         "traffic": "TRAVEL", "anchor": "NEWS", "earth": "NEWS", "city": "NEWS", "story": "STORIES", "superman-zap": "CLASSICS",
         "superman-lab": "CLASSICS"}
GCOL = {"MOVIES": ORG, "KIDS": (255, 196, 0), "SPORTS": (0, 168, 96), "TRAVEL": (40, 120, 255), "NEWS": PNK, "STORIES": (124, 58, 237),
        "CLASSICS": (150, 150, 160)}
FIRE = [("superman-zap", "WATCH"), ("cricket", "CHEER"), ("bunny", "LAUGH"), ("plane", "EXPLORE")]
STRIPS = ["tos-robot", "llama", "football", "earth", "sintel-cliff", "bunny-forest", "city", "wing-cat"]


def surf_pos(t):
    """Carousel position (in cards) at time t: one card per beat from 1 s, two per beat from 8 s, eased on each step."""
    if t < 1: return 0.0
    if t < 8:
        s = (t - 1) / .5; return math.floor(s) + inout((s % 1) / .7)
    s = (t - 8) / .25; return 14 + math.floor(s) + inout((s % 1) / .7)


def carousel(clips, outro):
    tags = {g: label(g, c, 56) for g, c in GCOL.items()}
    words = [word_img(w, PETALS[i % 4], 230, bar=False) for i, (_, w) in enumerate(FIRE)]

    def card(nm, t, w, h, dim):
        im = push(clips[nm].frame(t % 3.0), 0, 1.1, 1.1, size=(w, h)).convert("RGBA")
        if dim: im = Image.blend(im, Image.new("RGBA", (w, h), DARK_RGBA), dim)
        ImageDraw.Draw(im).rounded_rectangle([0, 0, w - 1, h - 1], 18, outline=(255, 255, 255, 200), width=4)
        m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], 18, fill=255); im.putalpha(m)
        return im

    def frame(t):
        lay = None
        if t < 11:
            f = bg_dark(t, clips["sintel-cliff"], 0)
            cv = to_img(f).convert("RGBA"); p = surf_pos(t)
            # the screens around the centre, drawn far ones first; scale and brightness fall off with distance
            items = []
            for j in range(int(p) - 3, int(p) + 5):
                if j < 0: continue
                d = j - p; ad = abs(d)
                if ad > 3.2: continue
                sc = .62 - .17 * min(ad, 2.4) ** 1.1; w = int(W * sc); h = int(w * 9 / 16)
                x = W / 2 + math.copysign(1, d) * (ad ** .8) * W * .33 - w / 2; y = H * .45 - h / 2 + 30 * min(ad, 2)
                items.append((ad, j, int(x), int(y), w, h))
            for ad, j, x, y, w, h in sorted(items, reverse=True):
                nm = REEL[j % len(REEL)]
                im = card(nm, t + j * .37, w, h, clamp(ad * .38))
                if ad > .02:                                 # side screens lean away a little
                    im = im.resize((w, int(h * (1 - .08 * min(ad, 2)))), Image.BILINEAR)
                cv.alpha_composite(im, (x, y + (h - im.height) // 2))
                if ad < .5:                                  # the floor reflection of the centre screen
                    r = im.transpose(Image.FLIP_TOP_BOTTOM).crop((0, 0, im.width, int(im.height * .35)))
                    ra = np.asarray(r, np.float32); ra[..., 3] *= np.linspace(.22, 0, r.height)[:, None] * (1 - ad * 2)
                    cv.alpha_composite(Image.fromarray(ra.astype(np.uint8), "RGBA"), (x, y + h + 8))
            f = arr(cv.convert("RGB"))
            j = int(round(p)); g = GENRE[REEL[j % len(REEL)]]; tg = tags[g]
            settle = 1 - min(1, abs(p - round(p)) * 3)
            if t > 1.2 and settle > 0:
                lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                lay.alpha_composite(fade_img(tg, settle), ((W - tg.width) // 2, int(H * .45 + W * .62 * 9 / 32 + 40)))
            if t < 1:                                        # opening: the first screen swings up out of the dark
                f = f * clamp(t / .8)
            if t > 10.5: f = f + ((t - 10.5) / .5) ** 2 * .7
        elif t < 13:
            i = min(3, int((t - 11) / .5)); k = (t - 11) - i * .5; nm, _ = FIRE[i]
            punch = 1.28 - .28 * out_cubic(k / .3)
            f = arr(push(clips[nm].frame(k + .6), 0, punch, punch, dx=(-1) ** i * .3))
            if k < .08: f = f + (1 - k / .08) * .55
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); wi = words[i]
            z = 1.5 - .5 * out_cubic(k / .18); q = fade_img(wi.resize((int(wi.width * z), int(wi.height * z)), Image.BILINEAR), clamp(k / .1))
            for dx, colr in ((-7, PNK), (7, (0, 200, 230))):
                tint = Image.new("RGBA", q.size, colr + (0,)); tint.putalpha(q.split()[3].point(lambda v: int(v * .45)))
                lay.alpha_composite(tint, (W // 2 - q.width // 2 + dx, H // 2 - q.height // 2))
            lay.alpha_composite(q, (W // 2 - q.width // 2, H // 2 - q.height // 2))
        else:
            # eight strips of eight shows slide in from top and bottom, then squeeze into a line of light
            k = t - 13; cv = to_img(np.zeros((H, W, 3), np.float32) + DARK).convert("RGBA"); sw = W // 8
            squeeze = in_cubic((k - 1.3) / .6)
            for s, nm in enumerate(STRIPS):
                e = out_cubic((k - .06 * s) / .45); dirn = 1 if s % 2 else -1
                src = push(clips[nm].frame(k + .3), 0, 1.15, 1.15)
                strip = src.crop((s * sw, 0, s * sw + sw, H)).convert("RGBA")
                ImageDraw.Draw(strip).rectangle([0, 0, sw - 1, H - 1], outline=PETALS[s % 4] + (255,), width=4)
                hh = max(2, int(H * (1 - .99 * squeeze)))
                if hh != H: strip = strip.resize((sw, hh), Image.BILINEAR)
                cv.alpha_composite(strip, (s * sw, int((H - hh) / 2 + dirn * (1 - e) * H)))
            f = arr(cv.convert("RGB"))
            if k > 1.5: f = f + ((k - 1.5) / .5) ** 2 * .8
        for t0 in (11, 13):
            lk = leak(t, t0)
            if lk is not None: f = f + lk
        if lay is not None: f, _ = comp(f, lay)
        return f * (.3 + .7 * VIGN)

    return frame


# ------------------------------------------------------------------ idea 3: the remote, flipping through Spark channels
FLIPS = [("SPARK TV ONE", "anchor", "NEWS"), ("SPARK CINEMA", "sintel-snow", "MOVIES"), ("SPARK KIDS", "bunny-fly", "KIDS"),
         ("SPARK SPORTS", "cricket", "SPORTS"), ("SPARK TRAVEL", "plane", "TRAVEL"), ("SPARK COMEDY", "wing-cat", "KIDS"),
         ("SPARK MOVIES ENGLISH", "tos-robot", "MOVIES"), ("SPARK DRAMAS", "story", "STORIES"), ("SPARK TV NEWS", "earth", "NEWS"),
         ("SPARK TEENS", "cosmos-sheep", "MOVIES"), ("SPARK SPORTS", "football", "SPORTS"), ("SPARK KIDS", "llama", "KIDS"),
         ("SPARK CINEMA", "superman-zap", "CLASSICS"), ("SPARK TRAVEL", "toronto", "TRAVEL"), ("SPARK CINEMA", "sintel-face", "MOVIES"),
         ("SPARK KIDS", "bunny", "KIDS"), ("SPARK TV NEWS", "city", "NEWS"), ("SPARK SPORTS", "stadium", "SPORTS")]
NOISE = [np.random.default_rng(90 + s).random((H // 4, W // 4, 1)).astype(np.float32) for s in range(6)]


def flip_index(t):
    """Which channel is on at time t: a new one every beat from 1 s, every half beat from 8 s, then it rests at 12 s."""
    if t < 8: return int((t - 1) / .5), (t - 1) % .5
    if t < 12: return 14 + int((t - 8) / .25), (t - 8) % .25
    return 30, t - 12


def remote(clips, outro):
    big = ImageFont.truetype(M.WORD_FONT, 64); small = ImageFont.truetype(FONT, 30); listf = ImageFont.truetype(M.WORD_FONT, 58)

    def osd(name, genre, j, a):
        """The channel banner a TV shows after you press CH+: coloured bar, the channel's name, what's on."""
        col = PETALS[j % 4]; lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        w = int(max(d.textlength(name, font=big), 420) + 150); x, y = 90, H - 250
        d.rounded_rectangle([x, y, x + w, y + 150], 26, fill=(8, 9, 20, int(205 * a)))
        d.rounded_rectangle([x, y, x + 18, y + 150], 9, fill=col + (int(255 * a),))
        d.text((x + 52, y + 18), name, font=big, fill=(255, 255, 255, int(255 * a)))
        d.text((x + 54, y + 100), "▲ CH+   ·   NOW ON  " + genre, font=small, fill=GCOL[genre] + (int(255 * a),))
        return lay

    def static(n, a):
        g = NOISE[n % 6]; f = np.repeat(g, 3, 2) * .9
        f = f * (.75 + .25 * np.sin(np.arange(H // 4)[:, None, None] * .9 + n))
        return up(f) * a

    def screen(t):
        i, k = flip_index(t)
        name, nm, genre = FLIPS[i % len(FLIPS)]
        f = arr(push(clips[nm].frame(k + .4 + (i % 3) * .5), clamp(k / 2), 1.04, 1.1))
        n = int(t * FPS)
        sn = .06 if t < 8 else .03                                    # the snow between channels, shorter when flipping fast
        if k < sn: f = f * .25 + static(n, .9)
        elif k < 2 * sn: f = f + static(n, .35 * (1 - (k - sn) / sn))
        if k < 1.6 * sn: f = np.roll(f, int((1 - k / (1.6 * sn)) * 140), axis=0)  # a little vertical roll as the picture locks
        return f, name, genre, i, k

    def frame(t):
        lay = None
        if t < 1:                                                     # power on: a line of light opens into the picture
            f, *_ = screen(1.3)
            o = out_cubic((t - .2) / .7); hh = max(2, int(H * o)); line = np.zeros((H, W, 3), np.float32)
            y0 = (H - hh) // 2; line[y0:y0 + hh] = f[y0:y0 + hh] if hh > 4 else 1
            core = np.exp(-((yy[:, :1] - H / 2) / (6 + 40 * o)) ** 2)[..., None] * (1 - o) * 1.5
            f = line + core * clamp(t / .2)
        elif t < 12:
            f, name, genre, i, k = screen(t)
            a = clamp((k - .06) / .08) if t < 8 else clamp((k - .03) / .04)
            lay = osd(name, genre, i, a)
        elif t < 13.6:                                                 # the channel list scrolls past, more and more
            k = t - 12; f, *_ = screen(t); f = up(blur(f[::4, ::4], 4)) * .35 + DARK * .65
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
            names = [n for n, _, _ in FLIPS] * 3; off = (k / 1.6) ** 2 * 1400
            for r, nm in enumerate(names):
                y = 300 + r * 104 - off
                if 170 < y < H + 20:
                    hi = abs(y + 30 - H / 2) < 52
                    d.text((W // 2 - d.textlength(nm, font=listf) / 2, y), nm, font=listf,
                           fill=(PETALS[r % 4] if hi else (215, 220, 232)) + (255 if hi else int(110 + 100 * clamp((y - 170) / 120)),))
            d.text((W // 2 - d.textlength("ALL ON SPARK TV", font=big) / 2, 110), "ALL ON SPARK TV", font=big, fill=(255, 255, 255, 235))
        else:                                                          # switch off: the picture folds into a line, then a dot
            k = t - 13.6; f, *_ = screen(t)
            v = in_cubic(k / .5); hh = max(2, int(H * (1 - v)))
            out = np.zeros((H, W, 3), np.float32) + DARK
            y0 = (H - hh) // 2; sub = f[y0:y0 + hh] if hh > 2 else np.ones((2, W, 3), np.float32)
            hz = in_cubic((k - .5) / .45); ww = max(4, int(W * (1 - hz)))
            img = to_img(sub * (1 + v * 1.4)).resize((ww, hh), Image.BILINEAR)
            out[y0:y0 + hh, (W - ww) // 2:(W - ww) // 2 + ww] = arr(img)
            dot = np.exp(-(((xx[::2, ::2] - W / 2) ** 2 + (yy[::2, ::2] - H / 2) ** 2) / (2 * (10 + 30 * clamp((k - .9) / .5)) ** 2)))[..., None]
            f = out + up(dot * np.array((1, .9, .85), np.float32)) * clamp((k - .75) / .2) * (1.6 + .6 * math.sin(k * 30))
        if lay is not None: f, _ = comp(f, lay)
        for t0 in (8,):
            lk = leak(t, t0)
            if lk is not None: f = f + lk
        return f * (.35 + .65 * VIGN)

    return frame


# ------------------------------------------------------------------ idea 4: every screen makes the flower
MOSAIC = ["sintel-face", "bunny-fly", "cricket", "toronto", "anchor", "tos-robot", "llama", "football", "earth", "wing-rocket",
          "superman-zap", "plane", "cosmos-sheep", "story", "stadium", "sintel-snow", "bunny", "city", "wing-cat", "tos-dome",
          "traffic", "llama2", "sintel-roof", "superman-lab"]
TW, TH, GAP = 34, 19, 3                      # a screen's size in the finished flower picture
SF = 940                                     # the flower's size there
WORDS4 = [(2.5, "EVERY STORY"), (5.5, "EVERY MATCH"), (8.5, "EVERY SMILE"), (11.5, "ONE SPARK")]


def mosaic(clips, outro):
    cols, rows = W // (TW + GAP) + 3, H // (TH + GAP) + 3
    gx0 = W / 2 - cols * (TW + GAP) / 2; gy0 = H / 2 - rows * (TH + GAP) / 2
    masks = [np.asarray(M.petal_mask(SF, i), np.float32) / 255 for i in range(4)]
    tiles = []
    rnd = M.rnd
    for r in range(rows):
        for c in range(cols):
            x, y = gx0 + c * (TW + GAP), gy0 + r * (TH + GAP); cx, cy = x + TW / 2 - (W / 2 - SF / 2), y + TH / 2 - (H / 2 - SF / 2)
            pet = -1
            if 0 <= cx < SF and 0 <= cy < SF:
                for i in range(4):
                    if masks[i][int(cy), int(cx)] > .5: pet = i
            tiles.append((x, y, pet, rnd.randrange(len(MOSAIC)), rnd.uniform(0, 2)))
    # the first screen we see full screen: a tile in the top petal, near its middle
    focus = min((t for t in tiles if t[2] == 0), key=lambda t: abs(t[0] + TW / 2 - W / 2) + abs(t[1] + TH / 2 - (H / 2 - SF * .25)))
    fi = tiles.index(focus); tiles[fi] = focus[:3] + (0, 0.0)
    fcx, fcy = focus[0] + TW / 2, focus[1] + TH / 2
    words = {w: word_img(w, PETALS[i % 4], 150) for i, (_, w) in enumerate(WORDS4)}

    def frame(t):
        p = inout(clamp((t - .6) / 13.6)) * .55 + clamp((t - .6) / 13.6) * .45   # how far the camera has pulled back
        z = (W / TW) ** (1 - p)                                                  # screen pixels per picture pixel
        m = (1 - p) ** 2.2                                                      # the camera drifts from that screen to the flower's centre
        cx, cy = W / 2 + (fcx - W / 2) * m, H / 2 + (fcy - H / 2) * m
        tw, th = max(1, int(round(TW * z))), max(1, int(round(TH * z)))
        cv = Image.new("RGB", (W, H), tuple(int(v * 255) for v in DARK))
        tint = clamp((t - 6) / 8) ** 1.5; dim = clamp((t - 3) / 7)
        cache = {}
        for x, y, pet, ci, ph in tiles:
            sx, sy = (x - cx) * z + W / 2, (y - cy) * z + H / 2
            if sx > W or sy > H or sx + tw < 0 or sy + th < 0: continue
            key = (ci, pet)
            if key not in cache:
                src = clips[MOSAIC[ci]].frame((t + ci * .3) % 3.0)
                if tw > 400: src = push(src, 0, 1.0, 1.0)
                im = src.resize((tw, th), Image.BILINEAR if tw > 200 else Image.BOX)
                if pet >= 0 and tint > 0: im = Image.blend(im, Image.new("RGB", (tw, th), PETALS[pet]), .82 * tint)
                if pet < 0: im = Image.blend(im, Image.new("RGB", (tw, th), tuple(int(v * 255) for v in DARK)), .88 * dim)
                cache[key] = im
            cv.paste(cache[key], (int(sx), int(sy)))
        f = arr(cv)
        if t > 13.8: f = f + ((t - 13.8) / 1.2) ** 2 * .9                     # the flower shines into the bloom
        lay = None
        for t0, w in WORDS4:
            k = t - t0
            if 0 <= k < 2.2:
                wi = words[w]; a = clamp(k / .25) * (1 - clamp((k - 1.8) / .4)); s = .9 + .1 * out_cubic(k / .5)
                q = fade_img(wi.resize((int(wi.width * s), int(wi.height * s)), Image.BILINEAR), a)
                lay = lay or Image.new("RGBA", (W, H), (0, 0, 0, 0))
                lay.alpha_composite(q, (W // 2 - q.width // 2, int(H * .78) - q.height // 2))
        if lay is not None: f, _ = comp(f, lay)
        return f * (.4 + .6 * VIGN)

    return frame


# ------------------------------------------------------------------ ideas 5 and 6: only real footage from our channels
# Owner, 2026-10-09: no AI-made video at all, only shots from what runs on the Spark channels. So these two use the
# Spark TV News footage (real video from Wikimedia Commons, tools/news/broll.py) and the films on Spark Cinema and
# Spark Kids (Blender open movies, Superman 1941); never the AI newsreaders or the AI story videos.
BR = M.NB
M.CLIPS.update({
    "train": (BR + "india-160decbb.mp4", 2, ""), "cst": (BR + "india-f5de6f65.mp4", 2, ""), "taxi": (BR + "india-c16af481.mp4", 2, ""),
    "street": (BR + "india-45c3d88a.mp4", 2, ""), "quebec": (BR + "canada-bdb6a81c.mp4", 2, ""), "to-lapse": (BR + "canada-4ad1cd20.mp4", 2, ""),
    "to-sky": (BR + "canada-2fd98608.mp4", 2, ""), "city-lapse": (BR + "world-73273108.mp4", 2, ""), "clouds": (BR + "weather-rain-3de3a689.mp4", 2, ""),
    "rain": (BR + "weather-rain-f5f027fb.mp4", 2, ""), "golak": (BR + "sports-d6b78877.mp4", 2, ""), "cricket2": (BR + "cricket-c12cf9fb.mp4", 2, ""),
    "projector": (BR + "film-d1282eb3.mp4", 2, ""), "reels": (BR + "film-3d50c860.mp4", 2, ""), "night-earth": (BR + "world-09bb4764.mp4", 2, ""),
    "heli": (BR + "health-95f4d06b.mp4", 2, ""),
    "elephants": (M.CM + "elephants-dream.mp4", 200, ""), "wing-sky": (M.CM + "wing-it.mp4", 120, ""), "tos-city": (M.CM + "tears-of-steel.mp4", 440, M.WIDE),
})
AI_MADE = {"anchor", "story"}                 # never in ideas 5 and 6


def reel_frame(clips, nm, t, w=W, h=H, k=0.0, dx=0.0):
    return push(clips[nm].frame(t % 3.0), k, 1.04, 1.12, dx=dx, size=(w, h))


# idea 5: rhythm panels. Slanted panels split the screen on the beat, 1 -> 2 -> 3 -> 4, then a wall of cards flips,
# then four columns take the petal colours and swing into the flower.
PANELS = [["projector"], ["to-sky", "cricket"], ["train", "sintel-snow", "golak"], ["quebec", "bunny-fly", "football", "cst"],
          ["city-lapse", "tos-robot"], ["clouds", "wing-sky", "cricket2"], ["taxi", "llama", "stadium", "to-lapse"],
          ["to-sky", "golak", "sintel-face", "train"]]
PWORDS = ["LIVE", "SPORTS", "MOVIES", "CITIES", "NEWS", "KIDS", "CRICKET", "SPARK"]
GRIDC = ["to-lapse", "cricket", "sintel-snow", "train", "bunny-fly", "quebec", "golak", "tos-robot", "cst", "llama", "clouds", "football",
         "city-lapse", "wing-sky", "taxi", "stadium", "superman-zap", "wing-rocket", "sintel-face", "cricket2"]


def panels(clips, outro):
    words = [word_img(w, PETALS[i % 4], 150) for i, w in enumerate(PWORDS)]
    slant = 140

    def split(t, names, k, wipe):
        n = len(names); cv = Image.new("RGB", (W, H))
        for i, nm in enumerate(names):
            x0 = W * i / n; x1 = W * (i + 1) / n
            m = Image.new("L", (W, H), 0)
            ImageDraw.Draw(m).polygon([(x0 + slant / 2 - (slant if i else 400), 0), (x1 + slant / 2 + (0 if i < n - 1 else 400), 0),
                                       (x1 - slant / 2 + (0 if i < n - 1 else 400), H), (x0 - slant / 2 - (slant * 0 if i else 400), H)], fill=255)
            src = reel_frame(clips, nm, t + i * .4, k=k, dx=(-1) ** i * .4)
            if wipe < 1 and i == n - 1:                       # the newest panel slides in
                off = int((1 - out_cubic(wipe)) * W * .6); src = src.transform(src.size, Image.AFFINE, (1, 0, -off, 0, 1, 0))
                m = m.transform(m.size, Image.AFFINE, (1, 0, -off, 0, 1, 0))
            cv.paste(src, (0, 0), m)
        d = ImageDraw.Draw(cv)
        for i in range(1, n):                                 # coloured dividers in the petal colours
            x = W * i / n; d.line([(x + slant / 2, 0), (x - slant / 2, H)], fill=PETALS[i % 4], width=10)
        return cv

    def wall(t, flip0):
        """4x4 wall; each card flips (narrows, swaps, widens) on its own beat."""
        cv = Image.new("RGB", (W, H), tuple(int(v * 255) for v in DARK)); g = 10; cw, ch = (W - 5 * g) // 4, (H - 5 * g) // 4
        for r in range(4):
            for c in range(4):
                j = r * 4 + c; ph = (t - flip0 - (j % 7) * .07) / .5
                n = int(max(0, ph)); f = max(0, ph) - n
                nm = GRIDC[(j + n * 5) % len(GRIDC)]
                sx = abs(math.cos(min(1, f / .35) * math.pi)) if f < .35 else 1
                w = max(2, int(cw * sx))
                im = reel_frame(clips, nm, t + j * .3, cw, ch, k=.5)
                if w != cw: im = im.resize((w, ch), Image.BILINEAR)
                cv.paste(im, (g + c * (cw + g) + (cw - w) // 2, g + r * (ch + g)))
        return cv

    def frame(t):
        lay = None
        if t < 9:
            b = int(t / .5) if t >= 1 else 0
            seg = min(len(PANELS) - 1, b // 2)
            k = (t - seg * 1.0) / 1.0
            prev_n = len(PANELS[seg - 1]) if seg else 0
            wipe = clamp(k / .35) if len(PANELS[seg]) > prev_n and len(PANELS[seg]) > 1 else 1
            f = arr(split(t, PANELS[seg], clamp(k), wipe))
            if k < .06: f = f + (1 - k / .06) * .4
            wi = words[seg]; a = clamp((k - .15) / .15) * (1 - clamp((k - .85) / .15))
            if a > 0:
                lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); q = fade_img(wi, a)
                lay.alpha_composite(q, ((W - q.width) // 2, H - 110 - q.height))
        elif t < 12.5:
            f = arr(wall(t, 9.0))
            if t < 9.1: f = f + (1 - (t - 9) / .1) * .6
        else:
            # four tall columns, each taking a petal colour over its show, close in and become the flower's petals
            k = t - 12.5; cv = Image.new("RGBA", (W, H), tuple(int(v * 255) for v in DARK) + (255,))
            e = inout(clamp((k - .5) / 1.5)); S = 760
            for i in range(4):
                x0, y0, w0, h0 = W * i / 4 + 6, 0, W / 4 - 12, H        # from its column...
                x1, y1 = (W - S) / 2, (H - S) / 2                       # ...to the flower's square
                x, y, w, h = x0 + (x1 - x0) * e, y0 + (y1 - y0) * e, w0 + (S - w0) * e, h0 + (S - h0) * e
                w, h = max(4, int(w)), max(4, int(h))
                im = reel_frame(clips, PANELS[3][i], t + i, w, h).convert("RGBA")
                im = Image.blend(im, Image.new("RGBA", im.size, PETALS[i] + (255,)), clamp(k / 1.2) * .8)
                pm = M.petal_mask(S, i).resize((w, h), Image.BILINEAR)
                if e < .92:                                     # the column rounds off towards its petal's outline
                    bx = pm.getbbox() or (0, 0, w, h); q = clamp(e / .92)
                    box = [bx[0] * q, bx[1] * q, w - 1 - (w - 1 - bx[2]) * q, h - 1 - (h - 1 - bx[3]) * q]
                    m = Image.new("L", (w, h), 0)
                    ImageDraw.Draw(m).rounded_rectangle(box, int(min(box[2] - box[0], box[3] - box[1]) / 2 * q), fill=255)
                else:
                    m = pm
                im.putalpha(m); cv.alpha_composite(im, (int(x), int(y)))
            f = arr(cv.convert("RGB"))
            if k > 1.9: f = f + ((k - 1.9) / .6) ** 2 * .9
        for t0 in (5, 9):
            lk = leak(t, t0)
            if lk is not None: f = f + lk
        if lay is not None: f, _ = comp(f, lay)
        return f * (.35 + .65 * VIGN)

    return frame


# idea 6: fly-through. Every shot carries the next one in a framed window at its centre; the camera flies through
# window after window, faster and faster, into a flash of light where the flower blooms.
FLY = ["to-sky", "train", "cricket", "sintel-snow", "quebec", "golak", "bunny-fly", "cst", "tos-city", "clouds", "football", "wing-sky",
       "taxi", "elephants", "stadium", "city-lapse", "llama", "cricket2", "superman-zap", "to-lapse", "rain", "heli", "reels", "night-earth"]
FWORDS = {0: "TORONTO", 1: "MUMBAI", 2: "CRICKET", 3: "CINEMA", 4: "QUEBEC", 5: "SPORTS", 6: "KIDS", 8: "MOVIES", 10: "FOOTBALL"}
SCALE = 3.2


def fly_pos(t):
    """How many windows the camera has flown through by time t (one per beat, then two, then four)."""
    if t < 1: return 0.0
    if t < 7: return (t - 1) / 1.0
    if t < 11: return 6 + (t - 7) / .5
    return 14 + (t - 11) / .25


def flythrough(clips, outro):
    words = {i: word_img(w, PETALS[i % 4], 140) for i, w in FWORDS.items()}

    def shot(i, t, size):
        w, h = size
        return reel_frame(clips, FLY[i % len(FLY)], t + i * .5, max(2, w), max(2, h), k=.3)

    def frame(t):
        z = fly_pos(t); i = int(z); f = z - i
        ease = f if t >= 7 else inout(f) * .7 + f * .3
        s = SCALE ** ease                                       # how far into shot i we have flown
        cv = Image.new("RGB", (W, H))
        base = shot(i, t, (int(W * s) + 2, int(H * s) + 2))
        cv.paste(base, (-(base.width - W) // 2, -(base.height - H) // 2))
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        for depth in (1, 2):                                    # the next two windows, nested
            ww, hh = int(W * s / SCALE ** depth), int(H * s / SCALE ** depth)
            if ww < 8: break
            x0, y0 = (W - ww) // 2, (H - hh) // 2
            win = shot(i + depth, t, (ww, hh)).convert("RGBA")
            m = Image.new("L", (ww, hh), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, ww - 1, hh - 1], max(4, ww // 40), fill=255)
            if ww <= W * 1.6:
                cv.paste(win.convert("RGB"), (x0, y0), m)
                d.rounded_rectangle([x0 - 6, y0 - 6, x0 + ww + 5, y0 + hh + 5], max(6, ww // 36), outline=PETALS[(i + depth) % 4] + (255,), width=max(3, ww // 120))
        f_ = arr(cv)
        if f < .04 and z >= 1: f_ = f_ + (1 - f / .04) * .25
        wi = words.get(i)
        if wi is not None and t < 11:
            a = clamp(f / .1) * (1 - clamp((f - .45) / .15))
            q = fade_img(wi, a); lay.alpha_composite(q, (110, H - 120 - q.height))
        f_, _ = comp(f_, lay)
        if t > 14.2: f_ = f_ + ((t - 14.2) / .8) ** 2 * .9
        for t0 in (7, 11):
            lk = leak(t, t0)
            if lk is not None: f_ = f_ + lk
        return f_ * (.35 + .65 * VIGN)

    return frame


# idea 6, second try (owner, 2026-10-09 21:23: the fly-through felt like your head spinning): a calm gallery.
# Big postcards of real footage glide in from the right, one after another, always the same direction, no zoom
# tunnel and no turning; the next card peeks in at the edge. At the end four cards take the petal colours and
# slide together into the flower.
GALLERY = [("to-sky", "TORONTO"), ("train", "MUMBAI"), ("cricket", "CRICKET"), ("sintel-snow", "CINEMA"), ("quebec", "QUEBEC"),
           ("bunny-fly", "KIDS"), ("golak", "SPORTS"), ("cst", "MUMBAI"), ("tos-city", "MOVIES"), ("clouds", "WEATHER"),
           ("football", "FOOTBALL"), ("wing-rocket", "KIDS"), ("taxi", "CITIES"), ("stadium", "SPORTS"), ("city-lapse", "NEWS"),
           ("llama", "KIDS"), ("cricket2", "CRICKET"), ("to-lapse", "TORONTO"), ("superman-zap", "CLASSICS"), ("heli", "NEWS")]
GCOLS = {"TORONTO": (40, 120, 255), "MUMBAI": (255, 122, 0), "CRICKET": (0, 168, 96), "CINEMA": ORG, "QUEBEC": (40, 120, 255),
         "KIDS": (255, 196, 0), "SPORTS": (0, 168, 96), "MOVIES": ORG, "WEATHER": (40, 120, 255), "FOOTBALL": (0, 168, 96),
         "CITIES": PNK, "NEWS": PNK, "CLASSICS": (150, 150, 160)}


def gallery_pos(t):
    """Which card is in the middle at time t: one every second from 1 s, one every half second from 9 s, eased."""
    if t < 1: return 0.0
    if t < 9: s = t - 1; return math.floor(s) + inout(clamp((s % 1) / .55))
    s = (t - 9) / .5; return 8 + math.floor(s) + inout(clamp((s % 1) / .6))


def gallery(clips, outro):
    tags = {w: label(w, c, 52) for w, c in GCOLS.items()}
    cw, ch = int(W * .66), int(W * .66 * 9 / 16); gap = 70

    def card(i, t, w=cw, h=ch):
        nm = GALLERY[i % len(GALLERY)][0]
        im = reel_frame(clips, nm, t + i * .4, w, h, k=clamp((t % 4) / 4) * .5).convert("RGBA")
        m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], 26, fill=255); im.putalpha(m)
        return im

    shadow = Image.new("RGBA", (cw + 120, ch + 120), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([60, 70, cw + 60, ch + 70], 30, fill=(0, 0, 0, 150))
    shadow = shadow.filter(M.ImageFilter.GaussianBlur(28))

    def frame(t):
        if t < 12.5:
            p = gallery_pos(t); i0 = int(p)
            f = bg_dark(t, clips[GALLERY[i0 % len(GALLERY)][0]], 0) * .9
            cv = to_img(f).convert("RGBA")
            for j in range(i0 - 1, i0 + 3):                    # left neighbour, centre, the next two waiting at the right
                if j < 0: continue
                x = W / 2 + (j - p) * (cw + gap) - cw / 2; y = (H - ch) / 2 - 30
                if x > W or x + cw < 0: continue
                cv.alpha_composite(shadow, (int(x) - 60, int(y) - 60))
                im = card(j, t)
                d = abs(j - p)
                if d > .02: im = Image.blend(Image.new("RGBA", im.size, (0, 0, 0, 0)), im, max(.35, 1 - .55 * d))
                cv.alpha_composite(im, (int(x), int(y)))
            settle = 1 - min(1, abs(p - round(p)) * 4)
            if t > 1.1 and settle > 0:
                tg = fade_img(tags[GALLERY[int(round(p)) % len(GALLERY)][1]], settle)
                cv.alpha_composite(tg, ((W - tg.width) // 2, int((H + ch) / 2 - 30 + 34)))
            f = arr(cv.convert("RGB"))
            if t < .9: f = f * clamp(t / .8)
        else:
            # four cards in a row take the petal colours and glide together into the flower's square
            k = t - 12.5; cv = Image.new("RGBA", (W, H), tuple(int(v * 255) for v in DARK) + (255,))
            a = out_cubic(clamp(k / .6)); e = inout(clamp((k - .7) / 1.5)); S = 760
            sw, sh = int(W * .2), int(W * .2 * 9 / 16)
            for i in range(4):
                x0 = W / 2 + (i - 1.5) * (sw + 30) - sw / 2 + (1 - a) * W * .5; y0 = (H - sh) / 2
                x1, y1 = (W - S) / 2, (H - S) / 2
                x, y, w, h = x0 + (x1 - x0) * e, y0 + (y1 - y0) * e, sw + (S - sw) * e, sh + (S - sh) * e
                w, h = max(4, int(w)), max(4, int(h))
                im = reel_frame(clips, GALLERY[i * 3][0], t + i, w, h).convert("RGBA")
                im = Image.blend(im, Image.new("RGBA", im.size, PETALS[i] + (255,)), clamp(k / 1.0) * .8)
                pm = M.petal_mask(S, i).resize((w, h), Image.BILINEAR)
                if e < .92:
                    bx = pm.getbbox() or (0, 0, w, h); q = clamp(e / .92)
                    box = [bx[0] * q, bx[1] * q, w - 1 - (w - 1 - bx[2]) * q, h - 1 - (h - 1 - bx[3]) * q]
                    m = Image.new("L", (w, h), 0)
                    ImageDraw.Draw(m).rounded_rectangle(box, max(8, int(min(box[2] - box[0], box[3] - box[1]) / 2 * q)), fill=255)
                else:
                    m = pm
                im.putalpha(m); cv.alpha_composite(im, (int(x), int(y)))
            f = arr(cv.convert("RGB"))
            if k > 2.0: f = f + ((k - 2.0) / .5) ** 2 * .8
        for t0 in (9,):
            lk = leak(t, t0)
            if lk is not None: f = f + lk
        return f * (.4 + .6 * VIGN)

    return frame


# ------------------------------------------------------------------ the Spark TV News opener (owner, 2026-10-09)
# Real footage only (the Spark TV News footage from Wikimedia Commons), no AI video; every word on screen in English
# and Urdu (channel 1 is an Urdu channel). Three bands of news pictures glide sideways at a steady pace (no zoom,
# no spinning), a lower third names each place or topic in both languages, the bands settle into a wall of screens,
# and the title card "SPARK TV NEWS / اسپارک ٹی وی نیوز" closes it. It owns its ending (no 'spark tv' outro).
M.CLIPS.update({"court": (BR + "court-2d5d0ee3.mp4", 2, ""),
                "india-st": (BR + "india-a49850ca.mp4", 2, ""), "cricket3": (BR + "cricket-c12cf9fb.mp4", 6, "")})
NEWS_BANDS = [["to-sky", "train", "cricket", "clouds", "city-lapse", "court", "golak"],
              ["night-earth", "cst", "football", "quebec", "taxi", "heli", "to-lapse"],
              ["street", "stadium", "to-lapse", "city", "india-st", "taxi", "cricket2"]]
NEWS_WALL = ["to-sky", "cst", "cricket", "clouds", "night-earth", "court", "football", "quebec", "city-lapse", "train", "heli", "stadium"]
NEWS_LINES = [("TORONTO", "ٹورنٹو"), ("MUMBAI", "ممبئی"), ("CRICKET", "کرکٹ"), ("WORLD", "دنیا"), ("WEATHER", "موسم"),
              ("SPORTS", "کھیل"), ("CITIES", "شہر")]
NEWS_RED = (214, 32, 48)
URDU = os.path.join(HERE, "fonts", "NotoNastaliqUrdu.ttf")
NEWS_END = 12.5                              # the title card starts here


def urdu_text(d, xy, text, font, fill, anchor="la"):
    d.text(xy, text, font=font, fill=fill, anchor=anchor, direction="rtl", language="ur", features=["-kern"])


def news(clips, outro):
    tw, th, g = 520, 292, 18
    en = ImageFont.truetype(M.WORD_FONT, 54); ur = ImageFont.truetype(URDU, 48)
    big_en = ImageFont.truetype(M.WORD_FONT, 132); big_ur = ImageFont.truetype(URDU, 104)
    L = logo_parts(); pet = [petal(260, i, c) for i, c in enumerate(PETALS)]

    def bands(t, open_k=1.0):
        cv = Image.new("RGB", (W, H), tuple(int(v * 255) for v in DARK))
        bh = th + g; top = (H - 3 * bh + g) / 2
        for b, row in enumerate(NEWS_BANDS):
            speed = 150 * (1 if b % 2 else -1)              # pixels a second, steady
            off = (t * speed) % ((tw + g) * len(row))
            y = top + b * bh + (1 - open_k) * (H / 2 - (top + b * bh + th / 2))
            for j in range(-1, len(row) + 3):
                x = j * (tw + g) - off + (0 if b % 2 else -(tw + g) * 2)
                x = (x + (tw + g) * len(row)) % ((tw + g) * len(row)) - (tw + g)
                if x > W or x + tw < 0: continue
                nm = row[j % len(row)]
                im = reel_frame(clips, nm, t + j * .37 + b, tw, max(2, int(th * open_k)))
                cv.paste(im, (int(x), int(y)))
        return cv

    def wall(t, k):
        """The bands settle into a 4x3 wall; the middle screens get a red frame."""
        cv = Image.new("RGB", (W, H), tuple(int(v * 255) for v in DARK)); d = ImageDraw.Draw(cv)
        cw, chh = (W - 5 * 14) // 4, (H - 4 * 14) // 3
        for r in range(3):
            for c in range(4):
                j = r * 4 + c; a = clamp((k - .04 * j) / .3)
                if a <= 0: continue
                x, y = 14 + c * (cw + 14), 14 + r * (chh + 14)
                im = reel_frame(clips, NEWS_WALL[j], t + j * .3, cw, chh)
                if a < 1: im = Image.blend(Image.new("RGB", im.size, tuple(int(v * 255) for v in DARK)), im, a)
                cv.paste(im, (x, y))
                if r == 1 and c in (1, 2): d.rectangle([x - 4, y - 4, x + cw + 3, y + chh + 3], outline=NEWS_RED, width=6)
        return cv

    def lower_third(t, lay):
        i = int((t - 1.6) / 1.5)
        if i < 0 or i >= len(NEWS_LINES): return
        k = (t - 1.6) - 1.5 * i; a = clamp(k / .2) * (1 - clamp((k - 1.3) / .2))
        e_txt, u_txt = NEWS_LINES[i]; d = ImageDraw.Draw(lay)
        ew = d.textlength(e_txt, font=en) + 70; uw = d.textlength(u_txt, font=ur, direction="rtl", language="ur") + 60
        y = H - 210; slide = (1 - out_cubic(k / .3)) * -120
        x = 110 + slide
        d.rectangle([x, y, x + ew, y + 92], fill=(255, 255, 255, int(240 * a)))
        d.text((x + 35, y + 46), e_txt, font=en, fill=(20, 22, 34, int(255 * a)), anchor="lm")
        d.rectangle([x + ew, y, x + ew + uw, y + 92], fill=NEWS_RED + (int(240 * a),))
        urdu_text(d, (x + ew + uw / 2, y + 40), u_txt, ur, (255, 255, 255, int(255 * a)), anchor="mm")
        d.rectangle([x, y + 92, x + ew + uw, y + 100], fill=(20, 22, 34, int(200 * a)))

    def title(t):
        k = t - NEWS_END
        f = arr(wall(t, 1.0)); f = up(blur(f[::4, ::4], 6)) * (.35 - .15 * clamp(k / 2)) + DARK * .6
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        # the flower blooms on the left of the words
        S = 300; fl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        for i in range(4):
            gs = max(2, int(S * out_back((k - .06 * i) / .5, 2.2)))
            if gs > 2:
                q = pet[i].resize((min(gs, S * 2), min(gs, S * 2)), Image.BILINEAR)
                if q.width <= S: fl.alpha_composite(q, ((S - q.width) // 2, (S - q.height) // 2))
                else: fl.alpha_composite(q.crop(((q.width - S) // 2, (q.height - S) // 2, (q.width + S) // 2, (q.height + S) // 2)))
        rot = -60 * (1 - out_cubic(k / .9))
        if abs(rot) > .05: fl = fl.rotate(rot, resample=Image.BICUBIC)
        tx = W // 2 - 520
        lay.alpha_composite(fl, (tx - S - 30, H // 2 - S // 2 - 20))
        wk = clamp((k - .45) / .5)
        if wk > 0:                                           # "SPARK TV NEWS" wipes in, then the red line, then Urdu
            txt = Image.new("RGBA", (1200, 170), (0, 0, 0, 0)); ImageDraw.Draw(txt).text((0, 0), "SPARK TV NEWS", font=big_en, fill=(255, 255, 255, 255))
            txt = txt.crop((0, 0, max(1, int(txt.width * out_cubic(wk))), txt.height)); lay.alpha_composite(txt, (tx, H // 2 - 150))
        lk = clamp((k - .8) / .4)
        if lk > 0: d.rectangle([tx, H // 2 + 20, tx + int(1040 * out_cubic(lk)), H // 2 + 30], fill=NEWS_RED + (255,))
        uk = clamp((k - 1.1) / .5)
        if uk > 0: urdu_text(d, (tx + 1040, H // 2 + 50), "اسپارک ٹی وی نیوز", big_ur, (255, 255, 255, int(255 * uk)), anchor="ra")
        gk = (k - 2.4) / .8
        if 0 < gk < 1:
            la = np.asarray(lay, np.float32).copy()
            band = np.exp(-(((xx + yy * .35) - (tx - 300 + gk * 1700)) / 55) ** 2)[..., None]
            la[..., :3] = la[..., :3] + (255 - la[..., :3]) * band * .8
            lay = Image.fromarray(la.astype(np.uint8), "RGBA")
        f, _ = comp(f, lay)
        if k < .15: f = f + (1 - k / .15) * .7
        return f

    def frame(t):
        if t >= NEWS_END: return title(t) * (.45 + .55 * VIGN)
        if t < 1.2:                                          # a red line draws across, then opens into the bands
            k = t / 1.2; cv = Image.new("RGB", (W, H), tuple(int(v * 255) for v in DARK))
            if k > .5: cv = bands(t, out_cubic((k - .5) / .5))
            d = ImageDraw.Draw(cv); lw = int(W * out_cubic(min(1, k / .5)))
            if k < .9: d.rectangle([(W - lw) // 2, H // 2 - 4, (W + lw) // 2, H // 2 + 4], fill=NEWS_RED)
            f = arr(cv)
        elif t < 10.2:
            f = arr(bands(t))
        else:
            k = (t - 10.2) / 2.0
            m = clamp(k / .3)                                 # bands cross-fade into the wall, no dip to black
            f = arr(wall(t, .3 + k)) if m >= 1 else arr(bands(t)) * (1 - m) + arr(wall(t, .3 + k)) * m
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); lower_third(t, lay)
        f, _ = comp(f, lay)
        lk = leak(t, 10.2, NEWS_RED)
        if lk is not None: f = f + lk * .6
        return f * (.45 + .55 * VIGN)

    return frame


def make(kind, out):
    print("fetching clips", flush=True)
    if kind == "languages":
        names = {n for v in LANG_CLIPS.values() for n in v} | {"sintel-cliff"}
        tagline = "URDU   ·   HINDI   ·   ENGLISH   ·   PUNJABI"
    elif kind == "carousel":
        names = set(REEL) | {n for n, _ in FIRE} | set(STRIPS) | {"sintel-cliff"}
        tagline = "MOVIES   ·   KIDS   ·   SPORTS   ·   NEWS   ·   TRAVEL"
    elif kind == "remote":
        names = {n for _, n, _ in FLIPS} | {"sintel-cliff"}
        tagline = "ONE REMOTE   ·   EVERY SPARK CHANNEL"
    elif kind == "mosaic":
        names = set(MOSAIC) | {"sintel-cliff"}
        tagline = "EVERY STORY   ·   ONE SPARK"
    elif kind == "panels":
        names = {n for p in PANELS for n in p} | set(GRIDC) | {"sintel-cliff"}
        tagline = "LIVE   ·   SPORTS   ·   MOVIES   ·   NEWS"
    elif kind == "news":
        names = {n for b in NEWS_BANDS for n in b} | set(NEWS_WALL) | {"sintel-cliff"}
        tagline = ""
    elif kind == "gallery":
        names = {n for n, _ in GALLERY} | {"sintel-cliff"}
        tagline = "FROM TORONTO TO MUMBAI   ·   ALL ON SPARK"
    else:
        names = set(FLY) | {"sintel-cliff"}
        tagline = "FROM TORONTO TO MUMBAI   ·   ALL ON SPARK"
    assert kind in ("languages", "carousel", "remote", "mosaic") or not names & AI_MADE, "ideas 5 and 6 use no AI-made video"
    clips = {n: Clip(n, 9.0 if n == "sintel-cliff" else 3.2) for n in names}
    outro = Outro(tagline, clips["sintel-cliff"])
    body = {"languages": languages, "carousel": carousel, "remote": remote, "mosaic": mosaic, "panels": panels, "fly": flythrough, "gallery": gallery, "news": news}[kind](clips, outro)
    bug = Image.open(M.BUG).convert("RGBA"); bug = fade_img(bug.resize((230, int(230 * bug.height / bug.width)), Image.LANCZOS), .8)
    cf = ImageFont.truetype(FONT, 21)
    fr = tempfile.mkdtemp()
    for n in range(N):
        t = n / FPS
        f = outro.frame(t) if t >= OUT and kind != "news" else body(t)
        img = to_img(grain(f, n))
        if 1.5 <= t < (NEWS_END - .3 if kind == "news" else OUT - .3): img.paste(bug, (W - 60 - bug.width, 50), bug)
        ck = clamp((t - OUT - 3.6) / .5) * (1 - clamp((t - (SECS - .7)) / .4))
        if ck > 0:
            d = ImageDraw.Draw(img, "RGBA"); txt = credit("feelgood") + ("  ·  Clips: Spark TV News footage, Wikimedia Commons" if kind == "news" else "  ·  Clips: Blender Foundation (CC BY), public domain, Spark TV")
            d.text((W - 44 - d.textlength(txt, font=cf), H - 56), txt, font=cf, fill=(255, 255, 255, int(105 * ck)))
        if t > SECS - .6: img = Image.blend(img, Image.new("RGB", (W, H)), clamp((t - (SECS - .6)) / .55))
        img.save(f"{fr}/{n:04d}.jpg", quality=95)
        if n % 50 == 0: print("frame", n, flush=True)
    x = bed("feelgood", SECS + .3, start_bar=22, fade_in=.05, fade_out=1.8)[: int(SECS * SR)]
    wav = os.path.join(fr, "m.wav"); save(wav, x * .72)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", f"{fr}/%04d.jpg", "-i", wav,
                    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out], check=True)
    print("made", out)


if __name__ == "__main__":
    make(sys.argv[1], sys.argv[2])
