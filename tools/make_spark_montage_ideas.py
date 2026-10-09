"""Two more Spark TV montage ideas (owner, 2026-10-09: "make a couple of montage ideas for Spark TV").

Both are 20 s on the 120 BPM grid of "Inspiring Advertising" (Rafael Krux, CC BY 4.0) and end on the Spark Flower,
like the approved v5 montage (tools/make_spark_montage.py, whose clips and drawing helpers this reuses):

  languages  One TV, four languages. A 2x2 wall draws itself in the language colours, fills one screen per beat,
             then URDU, HINDI, ENGLISH and PUNJABI each take the whole screen in turn; the four screens fold into
             the four petals of the flower.
  carousel   Channel surfing. Our shows glide past on a carousel of screens, one per beat, faster and faster,
             then rapid-fire cuts and sliding strips before the flower blooms.

Usage: python3 tools/make_spark_montage_ideas.py languages|carousel OUT.mp4
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


def make(kind, out):
    print("fetching clips", flush=True)
    if kind == "languages":
        names = {n for v in LANG_CLIPS.values() for n in v} | {"sintel-cliff"}
        tagline = "URDU   ·   HINDI   ·   ENGLISH   ·   PUNJABI"
    else:
        names = set(REEL) | {n for n, _ in FIRE} | set(STRIPS) | {"sintel-cliff"}
        tagline = "MOVIES   ·   KIDS   ·   SPORTS   ·   NEWS   ·   TRAVEL"
    clips = {n: Clip(n, 9.0 if n == "sintel-cliff" else 3.2) for n in names}
    outro = Outro(tagline, clips["sintel-cliff"])
    body = (languages if kind == "languages" else carousel)(clips, outro)
    bug = Image.open(M.BUG).convert("RGBA"); bug = fade_img(bug.resize((230, int(230 * bug.height / bug.width)), Image.LANCZOS), .8)
    cf = ImageFont.truetype(FONT, 21)
    fr = tempfile.mkdtemp()
    for n in range(N):
        t = n / FPS
        f = outro.frame(t) if t >= OUT else body(t)
        img = to_img(grain(f, n))
        if 1.5 <= t < OUT - .3: img.paste(bug, (W - 60 - bug.width, 50), bug)
        ck = clamp((t - OUT - 3.6) / .5) * (1 - clamp((t - (SECS - .7)) / .4))
        if ck > 0:
            d = ImageDraw.Draw(img, "RGBA"); txt = credit("feelgood") + "  ·  Clips: Blender Foundation (CC BY), public domain, Spark TV"
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
