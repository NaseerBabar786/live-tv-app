"""The Spark TV network ident: one 8-second moving logo that runs on every Spark channel.

Owner (2026-10-08): the channel logo moving in like a real TV station; English only (everyone understands it),
one ident for the whole network, not one per channel or language.

Story: four comets of light (the petal colours) spiral in out of the dark, meet in the middle with a flash
and bloom into the Spark Flower; light rays turn behind it, then the flower glides left while the letters of
"spark tv" rise up one by one, a glint runs across and the logo shines over a glossy floor.
Music: "Inspiring Advertising" by Rafael Krux (CC BY 4.0) from tools/music/library.py, credited on screen (no home-made synth).

Usage: python3 tools/make_spark_ident.py OUT.mp4
Needs Pillow, numpy and ffmpeg. Logo: tools/spark_logos/spark-tv.png (wide M2 Spark Flower).
"""
import math, os, random, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "music"))
from library import bed, credit, lowpass_sweep, save, SR  # noqa: E402

W, H, FPS, SECS = 1920, 1080, 25, 18.0
N = int(FPS * SECS)
MOOD = "feelgood"              # Inspiring Advertising (Rafael Krux), 120 BPM: one beat = 0.5 s (owner liked it on the Spark ads)
HIT = 3.0                      # on the logo part's clock (OFF later): the comets meet on a bar line
ORG, PNK, VIO, YEL = (255, 106, 0), (255, 45, 120), (124, 58, 237), (255, 196, 0)
PETALS = (ORG, PNK, VIO, YEL)
LOGO = os.path.join(HERE, "spark_logos", "spark-tv.png")
LATIN = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
rnd = random.Random(11)


def clamp(x): return max(0.0, min(1.0, x))
def out_cubic(k): return 1 - (1 - clamp(k)) ** 3
def out_quint(k): return 1 - (1 - clamp(k)) ** 5
def inout(k):
    k = clamp(k)
    return 4 * k ** 3 if k < .5 else 1 - (-2 * k + 2) ** 3 / 2
def out_back(k, s=2.0):
    k = clamp(k) - 1
    return 1 + (s + 1) * k ** 3 + s * k ** 2


def arr(im): return np.asarray(im, np.float32) / 255
def blur(x, r):
    """Gaussian blur of a float image (h, w, 3) through Pillow, per channel."""
    out = np.empty_like(x)
    for c in range(3):
        out[..., c] = arr(Image.fromarray(np.clip(x[..., c] * 255, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(r)))
    return out
def up(x, w=W, h=H):
    return arr(Image.fromarray(np.clip(x * 255, 0, 255).astype(np.uint8), "RGB").resize((w, h), Image.BILINEAR))


# ---------- the shaded petals (a little light and gloss, so the flower looks solid) ----------
def petal(S, i, col):
    K = 2; s = S * K; c = s / 2; pw, ph = s * .26, s * .48
    m = Image.new("L", (s, s), 0)
    ImageDraw.Draw(m).ellipse([c - pw / 2, c - ph + s * .04, c + pw / 2, c + s * .07], fill=255)
    y, x = np.mgrid[0:s, 0:s].astype(np.float32)
    shade = .9 + .16 * np.clip((c - y) / ph, 0, 1)              # brighter towards the tip
    rgb = np.clip(np.array(col, np.float32)[None, None] / 255 * shade[..., None], 0, 1)
    hl = Image.new("L", (s, s), 0)                                # soft gloss along one side
    ImageDraw.Draw(hl).ellipse([c - pw * .32, c - ph * .86 + s * .04, c - pw * .02, c - ph * .25], fill=255)
    hl = arr(hl.filter(ImageFilter.GaussianBlur(s * .04)))[..., None] * .2
    rgb = rgb + (1 - rgb) * hl
    im = Image.fromarray((rgb * 255).astype(np.uint8), "RGB").convert("RGBA"); im.putalpha(m)
    return im.rotate(-90 * i, resample=Image.BICUBIC, center=(c, c)).resize((S, S), Image.LANCZOS)


def flower(petals, S, rot=0.0, grow=(1, 1, 1, 1)):
    o = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    for p, g in zip(petals, grow):
        if g <= .01: continue
        q = p.resize((S, S), Image.BILINEAR)
        if abs(g - 1) > .005:   # petals unfold out of the centre
            gs = max(2, int(S * g)); q = q.resize((gs, gs), Image.BILINEAR)
            t = Image.new("RGBA", (S, S), (0, 0, 0, 0)); t.alpha_composite(q, ((S - gs) // 2, (S - gs) // 2)); q = t
        o.alpha_composite(q)
    return o.rotate(rot, resample=Image.BICUBIC) if abs(rot) > .05 else o


# ---------- background: deep blue-black, a slow nebula, three layers of bokeh drifting at different speeds ----------
def nebula():
    small = np.zeros((90, 160, 3), np.float32)
    ys, xs = np.mgrid[0:90, 0:160].astype(np.float32)
    for col, cx, cy, r, k in ((VIO, 40, 30, 38, .55), (PNK, 125, 62, 34, .35), (ORG, 95, 18, 30, .25), (VIO, 140, 10, 26, .3)):
        small += np.exp(-((xs - cx) ** 2 + (ys - cy) ** 2) / (2 * r * r))[..., None] * np.array(col, np.float32) / 255 * k
    return up(np.clip(small, 0, 1) * .22, W + 400, H + 200)
NEB = nebula()
BASE = np.array((6, 7, 14), np.float32) / 255
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
YH, XH = np.mgrid[0:H // 2, 0:W // 2].astype(np.float32)
VIGN = np.clip(1.15 - .75 * (((xx - W / 2) / (W * .62)) ** 2 + ((yy - H / 2) / (H * .62)) ** 2), .15, 1)[..., None]
BOKEH = [(rnd.uniform(-200, W + 200), rnd.uniform(-100, H + 100), depth, rnd.choice(PETALS + ((255, 255, 255),)), rnd.uniform(0, 6))
         for depth, n in ((.35, 26), (.65, 16), (1.0, 8)) for _ in range(n)]


def background(t, cam):
    ox = int(200 + cam[0] * 120); oy = int(100 + cam[1] * 60)
    f = BASE + NEB[oy:oy + H, ox:ox + W]
    lay = Image.new("RGB", (W // 4, H // 4)); d = ImageDraw.Draw(lay)
    for x0, y0, depth, col, ph in BOKEH:
        x = (x0 - cam[0] * 900 * depth - t * 18 * depth) / 4; y = (y0 - cam[1] * 300 * depth) / 4
        r = 2 + 9 * depth; a = (.10 + .10 * math.sin(t * 1.3 + ph)) * (1.2 - depth * .5)
        c = tuple(int(v * a) for v in col)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    f = f + up(arr(lay.filter(ImageFilter.GaussianBlur(1.6))))
    return f


# ---------- light: comets, rays, flare ----------
def comet_pos(i, t):
    """Comet i spirals in from its own side and reaches the centre at HIT."""
    k = clamp((t - .35 - .1 * i) / (HIT - .35 - .1 * i))
    e = 1 - (1 - k) ** 2.2
    r = 1250 * (1 - e)
    a = math.radians(135 - 90 * i) + (1 - e) * 2.6
    return W / 2 + r * math.cos(a), H / 2 - r * math.sin(a) * .62, k


def draw_light(t, flower_c):
    """Everything that glows, on a quarter-size canvas (it gets blurred into a bloom anyway)."""
    L = Image.new("RGB", (W // 2, H // 2)); d = ImageDraw.Draw(L)
    if t < HIT + .05:
        for i, col in enumerate(PETALS):
            pts = []
            for j in range(40):
                tt = t - j * .02
                x, y, k = comet_pos(i, tt)
                if k <= 0: break
                pts.append((x / 2, y / 2, j))
            for (x1, y1, j), (x2, y2, _) in zip(pts, pts[1:]):
                f = (1 - j / 40) ** 1.4
                d.line([(x1, y1), (x2, y2)], fill=tuple(int(v * f) for v in col), width=max(1, int(12 * f)))
            if pts:
                x, y, _ = pts[0]; d.ellipse([x - 8, y - 8, x + 8, y + 8], fill=(255, 250, 240))
    # rays turning behind the flower once it has bloomed
    ra = clamp((t - HIT) / .3) * (1 - clamp((t - 4.4) / 1.2))
    if ra > 0:
        R = Image.new("RGB", (W // 2, H // 2)); d = ImageDraw.Draw(R)
        cx, cy = flower_c[0] / 2, flower_c[1] / 2
        for j in range(14):
            a = math.radians(j * 360 / 14 + t * 9); w = math.radians(1.6)
            c = tuple(int(v * .5 * ra) for v in (255, 235, 215))
            d.polygon([(cx, cy), (cx + 1400 * math.cos(a - w), cy + 1400 * math.sin(a - w)),
                       (cx + 1400 * math.cos(a + w), cy + 1400 * math.sin(a + w))], fill=c)
        dist = np.sqrt((XH - cx) ** 2 + (YH - cy) ** 2)
        return arr(L) + arr(R) * np.exp(-dist / 260)[..., None]
    return arr(L)


def flare(t, c):
    """A horizontal anamorphic streak and a ring of light when the comets meet."""
    k = t - HIT
    if k < 0 or k > 1.6: return None
    a = math.exp(-k * 3.2)
    L = Image.new("RGB", (W // 2, H // 2)); d = ImageDraw.Draw(L); cx, cy = c[0] / 2, c[1] / 2
    hw = 950 * (0.4 + .6 * out_cubic(k / .4))
    d.ellipse([cx - hw, cy - 3, cx + hw, cy + 3], fill=tuple(int(v * a) for v in (180, 210, 255)))
    d.ellipse([cx - 60, cy - 60, cx + 60, cy + 60], fill=tuple(int(255 * a) for _ in range(3)))
    rr = 40 + 900 * out_cubic(k / 1.2); w = max(1, int(10 * a))
    d.ellipse([cx - rr, cy - rr * .9, cx + rr, cy + rr * .9], outline=tuple(int(v * a * .8) for v in (255, 220, 200)), width=w)
    for g, (gx, s) in enumerate(((-.55, 30), (.38, 18), (.8, 44))):  # small lens ghosts along the line through the centre
        x = cx + (cx - W / 4) * gx + gx * 260; y = cy + gx * 30
        d.ellipse([x - s, y - s, x + s, y + s], fill=tuple(int(v * a * .35) for v in PETALS[g + 1]))
    return arr(L)


def sparks_layer(t, c, sparks):
    k = t - HIT
    if k < 0 or k > 2.2: return None
    L = Image.new("RGB", (W // 2, H // 2)); d = ImageDraw.Draw(L)
    for a, v, col, sz in sparks:
        r0 = v * k * (1 - k * .28); r1 = r0 + 30 * math.exp(-k * 2)
        f = math.exp(-k * 2.2)
        x0, y0 = c[0] / 2 + r0 * math.cos(a), c[1] / 2 + r0 * math.sin(a) + 40 * k * k
        x1, y1 = c[0] / 2 + r1 * math.cos(a), c[1] / 2 + r1 * math.sin(a) + 40 * k * k
        d.line([(x0, y0), (x1, y1)], fill=tuple(int(q * f) for q in col), width=max(1, int(sz * f + .5)))
    return arr(L)


def comp(f, layer, a=1.0):
    """Lay an RGBA Pillow layer (full size) over the float frame."""
    x = np.asarray(layer, np.float32) / 255
    al = x[..., 3:4] * a
    return f * (1 - al) + x[..., :3] * al, x


# ---------- part 1: flying through space and a tunnel of our channels' pictures ----------
OFF = 9.0          # the logo part (comets, bloom, letters) starts here; the comets meet at OFF + HIT = 12 s
FOC = 900.0        # camera focal length in pixels
TW, TH = 1.6, .9   # a picture is 16:9 in world units


def travel(speed):
    """Camera position over time for a speed curve: cumulative sum frame by frame."""
    z, out = 0.0, []
    for n in range(N + 1):
        out.append(z); z += speed(n / FPS) / FPS
    return out
def bump(t, a, b, c, d):
    """0 before a, rises to 1 by b, stays until c, falls to 0 by d."""
    return inout((t - a) / (b - a)) * (1 - inout((t - c) / (d - c)))
STAR_Z = travel(lambda t: 2 + 30 * bump(t, 0, 1.6, 2.4, 4.2) + 6 * bump(t, 3, 4, 6.5, 8))
TILE_Z = travel(lambda t: 4.0 * bump(t, 1.8, 3.2, 5.6, 7.6) + .4 * bump(t, 6, 7, 9, 10))
STARS = [(rnd.uniform(-3, 3), rnd.uniform(-1.8, 1.8), rnd.uniform(0, 24), rnd.choice(PETALS + ((255, 255, 255),) * 3)) for _ in range(520)]


def stars_layer(t, n):
    """Light streaks rushing past: the camera flies forward through space."""
    a = clamp(t / .4) * (1 - .6 * clamp((t - 3.5) / 1.5)) * (1 - clamp((t - 11.2) / .8))
    if a <= 0: return None
    L = Image.new("RGB", (W // 2, H // 2)); d = ImageDraw.Draw(L)
    zc, zp = STAR_Z[n], STAR_Z[max(0, n - 3)]
    roll = t * .15
    for x, y, z0, col in STARS:
        r1 = (z0 - zc) % 24 + .15; r0 = r1 + (zc - zp)
        if r0 > 24: continue
        cr, sr = math.cos(roll), math.sin(roll); xr, yr = x * cr - y * sr, x * sr + y * cr
        p1 = (W / 4 + FOC / 2 * xr / r1, H / 4 + FOC / 2 * yr / r1); p0 = (W / 4 + FOC / 2 * xr / r0, H / 4 + FOC / 2 * yr / r0)
        b = a * clamp(1.6 / r1) * clamp((24 - r1) / 6)
        if b < .02: continue
        d.line([p0, p1], fill=tuple(int(v * b) for v in col), width=max(1, int(3.2 / r1 + .5)))
    return arr(L)


def load_tiles(folder):
    """Our channels' real pictures as 16:9 screens with a thin bright edge."""
    files = sorted(os.path.join(dp, f) for dp, _, fs in os.walk(folder) for f in fs if f.lower().endswith((".jpg", ".png")))
    rnd2 = random.Random(5); rnd2.shuffle(files)
    out = []
    for p in files[:40]:
        im = Image.open(p).convert("RGB").resize((640, 360), Image.LANCZOS).convert("RGBA")
        d = ImageDraw.Draw(im); d.rectangle([0, 0, 639, 359], outline=(255, 255, 255, 200), width=4)
        out.append(im)
    while len(out) < 40: out += out[: 40 - len(out)]
    return out


def tile_positions(t, n):
    """Camera-space (x, y, z, alpha, glow) of the 40 pictures at time t."""
    zc = TILE_Z[n]; roll = .35 * t; res = []
    g = inout((t - 6.2) / 1.9)                         # pictures gather into a wall
    ex = clamp((t - 9.0) / .85) ** 2                    # ...then burst past the camera
    for i in range(40):
        th = i * 2.399 + roll
        x, y, z = 1.55 * math.cos(th) * 1.3, 1.55 * math.sin(th) * .82, 3 + i * .62 - zc
        a = clamp((z - .35) / .5) * clamp((16 - z) / 5) * clamp((t - 1.7) / .8)
        glow = 0.0
        if i >= 24:
            k = i - 24; c, r = k % 4, k // 4
            push = .35 * clamp((t - 7.6) / 1.5)
            gx, gy, gz = (c - 1.5) * 1.78, (r - 1.5) * 1.02, 3.5 - push
            x, y, z = x + (gx - x) * g, y + (gy - y) * g, z + (gz - z) * g
            a = a + (1 - a) * g
            if ex > 0:
                x, y, z = x * (1 + ex * 2.2), y * (1 + ex * 2.2), z * (1 - ex * .8)
                a *= 1 - ex
            beat = int((t - 7.0) / .5)                   # on every beat one picture lights up
            if 7.0 < t < 9.0 and (beat * 7) % 16 == k: glow = 1 - ((t - 7.0) % .5) / .5
        else:
            a *= 1 - g
        if a > .02 and z > .3: res.append((z, x, y, a, glow, i))
    return sorted(res, reverse=True)


def tiles_layer(t, n, tiles):
    if t < 1.6 or t > 10.0: return None
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for z, x, y, a, glow, i in tile_positions(t, n):
        s = FOC / z; w, h = int(TW * s), int(TH * s)
        if w < 6 or w > 3200: continue
        q = tiles[i].resize((w, h), Image.BILINEAR)
        fog = .55 + .45 * clamp(2.6 / z)
        if glow > 0 or fog < 1:
            px = np.asarray(q, np.float32)
            px[..., :3] = px[..., :3] * fog + (255 - px[..., :3] * fog) * glow * .45
            px[..., 3] *= a
            q = Image.fromarray(np.clip(px, 0, 255).astype(np.uint8), "RGBA")
        else:
            q.putalpha(q.split()[3].point(lambda v: int(v * a)))
        lay.alpha_composite(q, (int(W / 2 + x * s - w / 2), int(H / 2 + y * s - h / 2))) if -w < W / 2 + x * s < W + w else None
    return lay


def wall_layer(t, tiles):
    """While the logo stands: a far wall of our pictures drifting slowly behind it."""
    a = .2 * clamp((t - 12.6) / 1.2) * (1 - clamp((t - (SECS - .6)) / .5))
    if a <= 0: return None
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); s = FOC / 7.5; w, h = int(TW * s), int(TH * s)
    for r in range(5):
        for c in range(9):
            x = (c - 4) * 1.75 - (t - 12) * (.25 if r % 2 else -.25); y = (r - 2) * 1.0
            q = tiles[(r * 9 + c) % 40].resize((w, h), Image.BILINEAR); q.putalpha(q.split()[3].point(lambda v: int(v * a)))
            lay.alpha_composite(q, (int(W / 2 + x * s - w / 2), int(H / 2 + y * s - h / 2)))
    return lay


def make(out, pictures):
    wide = Image.open(LOGO).convert("RGBA")
    a = np.array(wide)[..., 3]; cols = (a > 40).any(0)
    runs, s = [], None
    for i, c in enumerate(cols):
        if c and s is None: s = i
        if not c and s is not None: runs.append([s, i]); s = None
    if s is not None: runs.append([s, len(cols)])
    parts = []
    for r in runs:  # merge tiny gaps inside a letter
        if parts and r[0] - parts[-1][1] <= 4: parts[-1][1] = r[1]
        else: parts.append(r)
    mark, letters = parts[0], parts[1:]              # petals, then s p a r k t v
    sc = 1180 / wide.width
    LW, LH = int(wide.width * sc), int(wide.height * sc)
    big = wide.resize((LW, LH), Image.LANCZOS)
    lx, ly = (W - LW) // 2, int(H * .43 - LH / 2)
    glyphs = [(big.crop((int(x0 * sc) - 3, 0, int(x1 * sc) + 3, LH)), lx + int(x0 * sc) - 3) for x0, x1 in letters]
    mark_w = (mark[1] - mark[0]) * sc
    end_c = (lx + mark[0] * sc + mark_w / 2, ly + LH / 2)
    probe = Image.new("RGBA", (400, 400)); [probe.alpha_composite(petal(400, i, c)) for i, c in enumerate(PETALS)]
    bb = probe.getbbox(); Sfin = int(mark_w / ((bb[2] - bb[0]) / 400)); Sbig = int(Sfin * 2.1)
    PET = [petal(Sbig, i, c) for i, c in enumerate(PETALS)]
    tiles = load_tiles(pictures)
    sparks = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(160, 620), rnd.choice(PETALS + ((255, 240, 220),)), rnd.uniform(1.5, 3.5)) for _ in range(110)]
    cf = ImageFont.truetype(LATIN if os.path.exists(LATIN) else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    fr = tempfile.mkdtemp()
    for n in range(N):
        t = n / FPS; tl = t - OFF                      # tl: time on the logo part's clock
        cam = (math.sin(t * .35) * .6 + t * .05, math.cos(t * .27) * .4)      # slow camera drift (parallax)
        mv = inout((tl - 4.3) / .9)                                            # flower glides to its place
        c = (W / 2 + (end_c[0] - W / 2) * mv, H / 2 + (end_c[1] - H / 2) * mv)
        f = background(t, cam)
        for wl in (wall_layer(t, tiles), tiles_layer(t, n, tiles)):
            if wl is not None: f, _ = comp(f, wl)
        # light + its bloom
        light = draw_light(tl, c)
        for extra in (flare(tl, c), sparks_layer(tl, c, sparks), stars_layer(t, n)):
            if extra is not None: light = light + extra
        lf = up(np.clip(light, 0, 1))
        bloom = up(blur(np.clip(light, 0, 1)[::2, ::2], 10), W, H)
        f = f + lf * .8 + bloom * 1.6
        # the flower
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        if tl >= HIT - .02:
            k = tl - HIT
            grow = [out_back((k - .05 * i) / .55, 2.4) for i in range(4)]
            pulse = 1 + .05 * math.sin(k * 6) * math.exp(-k * 1.8) + .025 * math.sin(max(0, tl - 6) * math.pi * 2) * clamp(tl - 6)
            S = int((Sbig + (Sfin - Sbig) * mv) * pulse)
            rot = -70 * (1 - out_quint(k / 1.1)) + 4 * math.sin(tl * 1.1) * (1 - mv)
            fl = flower(PET, S, rot, grow)
            lay.alpha_composite(fl, (int(c[0] - S / 2), int(c[1] - S / 2)))
        # the letters rise one by one, "tv" drops in last
        for j, (g, gx) in enumerate(glyphs):
            k = clamp((tl - (4.75 + .09 * j + (.2 if j >= 5 else 0))) / .55)
            if k <= 0: continue
            e = out_back(k, 1.8); dy = (1 - e) * (70 if j < 5 else -70)
            q = g.copy(); q.putalpha(q.split()[3].point(lambda v, a=clamp(k * 2.2): int(v * a)))
            lay.alpha_composite(q, (gx, int(ly + dy)))
        # glint across the whole logo, twice
        for g0 in (6.1, 8.0):
            gk = (tl - g0) / .8
            if 0 < gk < 1:
                la = np.asarray(lay, np.float32).copy()
                band = np.exp(-(((xx + yy * .35) - (lx - 300 + gk * (LW + 900))) / 55) ** 2)[..., None]
                la[..., :3] = la[..., :3] + (255 - la[..., :3]) * band * .85
                lay = Image.fromarray(la.astype(np.uint8), "RGBA")
        # glossy floor: a faint mirror image under the logo
        top = ly + LH + 6
        refl = lay.crop((0, 2 * top - H, W, top)).transpose(Image.FLIP_TOP_BOTTOM) if 2 * top - H > 0 else None
        if refl is not None:
            ra = np.asarray(refl, np.float32) / 255
            fade = np.clip(1 - np.arange(refl.height) / 170, 0, 1)[:, None, None] ** 1.6 * .22
            sl = f[top:H]; al = ra[..., 3:4] * fade
            f[top:H] = sl * (1 - al) + ra[..., :3] * al
        f, la = comp(f, lay)
        # the logo glows a little
        f = f + up(blur(la[::4, ::4, :3] * la[::4, ::4, 3:4], 6), W, H) * .35
        f = f * VIGN
        # music credit
        ck = clamp((tl - 5.6) / .5) * (1 - clamp((t - (SECS - .6)) / .4))
        img = Image.fromarray((np.clip(f, 0, 1) * 255).astype(np.uint8), "RGB")
        if ck > 0:
            d = ImageDraw.Draw(img, "RGBA"); txt = credit(MOOD)
            d.text((W - 44 - d.textlength(txt, font=cf), H - 58), txt, font=cf, fill=(255, 255, 255, int(110 * ck)))
        if t < .35:
            img = Image.blend(Image.new("RGB", (W, H)), img, t / .35)
        if t > SECS - .45:
            img = Image.blend(img, Image.new("RGB", (W, H)), clamp((t - (SECS - .45)) / .4))
        img.save(f"{fr}/{n:04d}.png")
    # music: full from the start; the filter closes and opens again while the comets fly in, full hit when they meet
    x = bed(MOOD, SECS + .3, start_bar=20, fade_in=.05, fade_out=1.2)[: int(SECS * SR)]  # from 40 s, like the Spark ads
    a, b = int((OFF + .35) * SR), int((OFF + HIT) * SR)
    x[a:b] = lowpass_sweep(x[a:b], 400, 12000)
    wav = os.path.join(fr, "m.wav"); save(wav, x * .72)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", f"{fr}/%04d.png", "-i", wav,
                    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-tune", "film",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out], check=True)
    Image.open(f"{fr}/{int(16.0 * FPS):04d}.png").convert("RGB").save(out[:-4] + "-poster.jpg", quality=88)
    print("made", out)


if __name__ == "__main__":
    # python3 tools/make_spark_ident.py OUT.mp4 PICTURES_DIR   (our channels' real pictures, any sub-folders)
    make(sys.argv[1], sys.argv[2])
