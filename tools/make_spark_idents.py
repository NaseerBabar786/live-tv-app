"""5-second animated logo idents for the Spark channels (owner, 2026-10-08: "the channel logo graphically
playing ... give us the feel of a true television transmission").

The four Spark Flower petals fly in from the corners and lock together on the beat with a burst of sparks,
then the flower slides left while the channel name comes out from behind it, a light glint runs across the
words and the Urdu name settles underneath. Music is a real CC BY recording from tools/music/library.py
(the owner's rule: no home-made synth music), credited on screen. No channel numbers (they may move).

Usage: python3 tools/make_spark_idents.py OUT_DIR [channel ...]     (default: tv)
Needs Pillow (with raqm for Urdu), numpy and ffmpeg. Logos: tools/spark_logos/spark-<id>.png (wide M2).
"""
import math, os, random, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "music"))
from library import bed, credit, lowpass_sweep, save, SR  # noqa: E402

W, H, FPS, SECS = 1920, 1080, 25, 5.0
N = int(FPS * SECS)
MOOD = "energetic"           # Upbeat Sitar, 130 BPM: a beat is 0.4615 s
BEAT = 60 / 130
LAND = 3 * BEAT              # the petals lock together on the third beat
ORG, PNK, VIO, YEL = (255, 106, 0), (255, 45, 120), (124, 58, 237), (255, 196, 0)
PETALS = (ORG, PNK, VIO, YEL)
BG = (10, 11, 18)
LOGOS = os.environ.get("SPARK_LOGOS", os.path.join(HERE, "spark_logos"))
UR = os.path.join(HERE, "fonts", "NotoNastaliqUrdu.ttf")
LATIN = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
# Urdu names under the logo (Spark TV One is an Urdu channel; on-screen writing in Urdu)
URDU = {"tv": "اسپارک ٹی وی", "cinema": "اسپارک سنیما", "music": "اسپارک میوزک", "hits": "اسپارک ہٹس",
        "kids": "اسپارک کڈز", "sports": "اسپارک اسپورٹس", "travel": "اسپارک ٹریول", "comedy": "اسپارک کامیڈی",
        "english": "اسپارک مووِیز انگلش", "hindi": "اسپارک مووِیز ہندی", "dramas": "اسپارک ڈرامے",
        "cooking": "اسپارک کوکنگ", "teens": "اسپارک ٹینز", "ads": "اسپارک ایڈز", "news": "اسپارک نیوز"}


def clamp(x): return max(0.0, min(1.0, x))
def out_cubic(k): return 1 - (1 - clamp(k)) ** 3
def out_back(k, s=1.7):
    k = clamp(k) - 1
    return 1 + (s + 1) * k ** 3 + s * k ** 2
def inout(k):
    k = clamp(k)
    return 4 * k ** 3 if k < .5 else 1 - (-2 * k + 2) ** 3 / 2


def font(path, size, wght=None):
    try:
        f = ImageFont.truetype(path, size)
        if wght: f.set_variation_by_axes([wght])
        return f
    except OSError:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size)


def petal(S, i, col):
    """One Spark Flower petal on an SxS canvas, the same shape as the logo (logos3.petal_mark)."""
    K = 2; s = S * K; c = s / 2
    m = Image.new("L", (s, s), 0); pw, ph = s * .26, s * .48
    ImageDraw.Draw(m).ellipse([c - pw / 2, c - ph + s * .04, c + pw / 2, c + s * .07], fill=255)
    m = m.rotate(-90 * i, resample=Image.BICUBIC, center=(c, c)).resize((S, S), Image.LANCZOS)
    o = Image.new("RGBA", (S, S), col + (0,)); o.putalpha(m)
    return o


def glow(size, col, alpha):
    """Soft round light, drawn small and blown up (cheap blur)."""
    y, x = np.mgrid[-1:1:64j, -1:1:64j]
    g = Image.fromarray((255 * np.exp(-(x * x + y * y) * 4.5) * np.clip(1 - (x * x + y * y), 0, 1)).astype(np.uint8), "L")
    g = g.resize((size, size), Image.BILINEAR)
    o = Image.new("RGBA", (size, size), col + (0,)); o.putalpha(g.point(lambda v: int(v * alpha)))
    return o


def background(t, rng_dust):
    """Deep night blue with slow colour lights drifting, a light floor and floating dust."""
    small = np.zeros((135, 240, 3), np.float32) + np.array(BG, np.float32)
    ys, xs = np.mgrid[0:135, 0:240].astype(np.float32)
    for j, col in enumerate(PETALS):
        a = t * .35 + j * 1.57
        cx, cy = 120 + 95 * math.cos(a), 67 + 45 * math.sin(a * 1.3)
        d = ((xs - cx) ** 2 + (ys - cy) ** 2) / (2 * 55 ** 2)
        small += np.exp(-d)[..., None] * np.array(col, np.float32) * .16
    v = 1 - .55 * (((xs - 120) / 120) ** 2 + ((ys - 67) / 67) ** 2)  # vignette
    small *= np.clip(v, .25, 1)[..., None]
    im = Image.fromarray(np.clip(small, 0, 255).astype(np.uint8), "RGB").resize((W, H), Image.BICUBIC).convert("RGBA")
    d = ImageDraw.Draw(im, "RGBA")
    for (x0, y0, sp, r, ph) in rng_dust:  # dust drifting up and to the right
        x = (x0 + sp * 40 * t) % W; y = (y0 - sp * 25 * t) % H
        a = int(70 + 60 * math.sin(t * 3 + ph))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 230, 200, a))
    return im


def make(ch, out_dir):
    wide = Image.open(os.path.join(LOGOS, f"spark-{ch}.png")).convert("RGBA")
    a = np.array(wide)[..., 3]; cols = np.where((a > 8).any(0))[0]
    # the mark is the first block of columns, the words start after the first gap of 25+ px
    gaps = np.where(np.diff(cols) > 25)[0]; mark_r = cols[gaps[0]] + 1; text_l = cols[gaps[0] + 1]
    scale = min(1080 / wide.width, 1.0) if ch == "tv" else min(1500 / wide.width, 1.0)
    LW, LH = int(wide.width * scale), int(wide.height * scale)
    logo = wide.resize((LW, LH), Image.LANCZOS)
    words = logo.crop((int(text_l * scale) - 4, 0, LW, LH))
    lx, ly = (W - LW) // 2, int(H * .42 - LH / 2)       # where the finished logo sits
    mark_box = int((mark_r - cols[0]) * scale)           # final mark width on screen
    mark_c_final = (lx + int(cols[0] * scale) + mark_box / 2, ly + LH / 2)
    # petals: drawn so their bounding box matches the logo's mark at size Sfin
    probe = Image.new("RGBA", (400, 400)); [probe.alpha_composite(petal(400, i, c)) for i, c in enumerate(PETALS)]
    bb = probe.getbbox(); ratio = (bb[2] - bb[0]) / 400
    Sfin = int(mark_box / ratio); Sbig = int(Sfin * 1.9)
    BIG = [petal(Sbig, i, c) for i, c in enumerate(PETALS)]
    urdu = URDU.get(ch)
    uf = font(UR, 64, 700); cf = font(LATIN, 22)
    rnd = random.Random(7)
    dust = [(rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(.5, 1.5), rnd.uniform(1, 2.6), rnd.uniform(0, 6)) for _ in range(70)]
    sparks = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(350, 1100), rnd.choice(PETALS + ((255, 255, 255),)), rnd.uniform(2, 4.5)) for _ in range(90)]
    starts = [0.10, 0.25, 0.40, 0.55]
    fr = tempfile.mkdtemp()
    for n in range(N):
        t = n / FPS
        f = background(t, dust)
        # where the flower is and how big: centred and big, then it slides into its place in the logo
        mv = inout((t - 1.85) / .75)
        cx = W / 2 + (mark_c_final[0] - W / 2) * mv; cy = H / 2 + (mark_c_final[1] - H / 2) * mv
        punch = 1 + .14 * math.exp(-max(0, t - LAND) * 9) * (t >= LAND)
        S = (Sbig + (Sfin - Sbig) * mv) * punch
        # light behind the flower: grows when the petals lock
        gl = .35 + .65 * math.exp(-max(0, t - LAND) * 2.5) if t >= LAND else .35 * clamp(t / LAND)
        g = glow(int(S * 2.6), (255, 150, 90), gl * .9); f.alpha_composite(g, (int(cx - g.width / 2), int(cy - g.height / 2)))
        # petals
        for i, p in enumerate(BIG):
            k = clamp((t - starts[i]) / (LAND - starts[i]))
            if k <= 0: continue
            e = out_cubic(k) if k < 1 else 1
            ang = -90 * i - 45 + 40                      # flies in from its own corner, a little off-line
            dist = (1 - e) * 1100
            spin = (1 - e) * (220 if i % 2 else -220)
            pi = p.resize((max(2, int(S)), max(2, int(S))), Image.BILINEAR) if abs(S - Sbig) > 1 else p
            if spin: pi = pi.rotate(spin, resample=Image.BICUBIC)
            if k < 1:
                pi.putalpha(pi.split()[3].point(lambda v, a=clamp(k * 4): int(v * a)))
            if k < 1:  # motion trail: fainter copies where the petal just was
                for g_ in (3, 2, 1):
                    eg = out_cubic(clamp(k - g_ * .035)); dg = (1 - eg) * 1100
                    gi = p.rotate((1 - eg) * (220 if i % 2 else -220), resample=Image.BILINEAR)
                    gi.putalpha(gi.split()[3].point(lambda v, a=.22 / g_ * clamp(k * 4): int(v * a)))
                    f.alpha_composite(gi, (int(cx + dg * math.cos(math.radians(ang)) - gi.width / 2),
                                           int(cy - dg * math.sin(math.radians(ang)) - gi.height / 2)))
            px = cx + dist * math.cos(math.radians(ang)) - pi.width / 2
            py = cy - dist * math.sin(math.radians(ang)) - pi.height / 2
            f.alpha_composite(pi, (int(px), int(py)))
        # burst of sparks and a ring when the petals lock
        if t >= LAND:
            dt = t - LAND; d = ImageDraw.Draw(f, "RGBA")
            for a_, v, col, w_ in sparks:
                r0 = v * dt * (1 - dt * .35); r1 = r0 + 40 * math.exp(-dt * 2)
                al = int(255 * math.exp(-dt * 2.8))
                if al < 6: continue
                d.line([(cx + r0 * math.cos(a_), cy + r0 * math.sin(a_)), (cx + r1 * math.cos(a_), cy + r1 * math.sin(a_))],
                       fill=col + (al,), width=int(w_))
            rr = 120 + dt * 1500; ra = int(200 * math.exp(-dt * 5))
            if ra > 4: d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(255, 255, 255, ra), width=6)
            if dt < .25:  # flash
                f.alpha_composite(Image.new("RGBA", (W, H), (255, 240, 220, int(150 * (1 - dt / .25)))))
        # the words come out from behind the flower
        rv = out_cubic((t - 1.9) / .85)
        if rv > 0:
            wd = words.copy(); wx = cx + (lx + LW - words.width - mark_c_final[0]) - (1 - rv) * words.width  # slides out to the right, tied to the flower
            edge = cx + S * .25 - wx    # the words come out from under the flower's right side
            m = Image.new("L", wd.size, 0)
            ImageDraw.Draw(m).rectangle([min(wd.width, max(0, int(edge))), 0, wd.width, wd.height], fill=255)
            m = m.filter(ImageFilter.GaussianBlur(6))
            wa = np.minimum(np.array(wd.split()[3], np.float32), np.array(m, np.float32)).astype(np.uint8)
            # glint: a bright slanted band runs across the letters
            gk = (t - 3.05) / .7
            if 0 < gk < 1:
                xs = np.arange(wd.width)[None, :] + np.arange(wd.height)[:, None] * .45
                band = np.exp(-((xs - (-200 + gk * (wd.width + 400))) / 45) ** 2)
                rgb = np.array(wd.convert("RGB"), np.float32); rgb += band[..., None] * (255 - rgb) * .9
                wd = Image.fromarray(rgb.astype(np.uint8), "RGB").convert("RGBA")
            wd.putalpha(Image.fromarray(wa, "L"))
            # keep the words off the flower while it is still moving in
            f.alpha_composite(wd, (int(wx), ly))
            if mv < 1:  # redraw the flower on top so the words slide out from under it
                for i, p in enumerate(BIG):
                    pi = p.resize((max(2, int(S)), max(2, int(S))), Image.BILINEAR)
                    f.alpha_composite(pi, (int(cx - pi.width / 2), int(cy - pi.height / 2)))
        # Urdu name underneath
        uk = out_cubic((t - 2.55) / .6)
        if uk > 0 and urdu:
            d = ImageDraw.Draw(f, "RGBA"); kw = {"direction": "rtl", "language": "ur"}
            x0, y0, x1, y1 = d.textbbox((0, 0), urdu, font=uf, **kw)
            d.text(((W - (x1 - x0)) / 2 - x0, ly + LH + 40 + (1 - uk) * 30 - y0), urdu, font=uf, fill=(255, 255, 255, int(225 * uk)), **kw)
        # music credit (CC BY)
        ck = clamp((t - 2.8) / .5)
        if ck > 0:
            d = ImageDraw.Draw(f, "RGBA"); c = credit(MOOD)
            d.text((W - 40 - d.textlength(c, font=cf), H - 56), c, font=cf, fill=(255, 255, 255, int(130 * ck)))
        # fade to black at the very end
        if t > SECS - .35:
            f.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(255 * clamp((t - (SECS - .35)) / .3)))))
        f.convert("RGB").save(f"{fr}/{n:04d}.png")
    # music: the filter opens while the petals fly in, full sound on the lock
    x = bed(MOOD, SECS + .2, fade_in=.05, fade_out=.6)[: int(SECS * SR)]
    a = int(LAND * SR); x[:a] = lowpass_sweep(x[:a], 250, 6000) * np.linspace(.6, 1, a)[:, None]
    wav = os.path.join(fr, "m.wav"); save(wav, x * .85)
    out = os.path.join(out_dir, f"ident-spark-{ch}.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", f"{fr}/%04d.png", "-i", wav,
                    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out], check=True)
    Image.open(f"{fr}/{int(4.2 * FPS):04d}.png").convert("RGB").save(out[:-4] + "-poster.jpg", quality=85)
    print("made", out)


if __name__ == "__main__":
    os.makedirs(sys.argv[1], exist_ok=True)
    for ch in sys.argv[2:] or ["tv"]:
        make(ch, sys.argv[1])
