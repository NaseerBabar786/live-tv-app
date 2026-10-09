"""Three SAMPLE openings for Spark TV News (owner 2026-10-08: our TV logo with a small movement instead of a still slide).

    python3 tools/news/intro_ideas.py out/
      -> out/news-intro-1.mp4  Light sweep: the logo grows in, a shine passes over it, a red "News" bar slides under it
         out/news-intro-2.mp4  Rings: glowing rings turn around the logo like a globe, the title types in below
         out/news-intro-3.mp4  Headline wall: lines of Urdu headlines drift behind, the logo lands with a flash
                               (made with the Spark TV logo, the name being previewed)
Music: tools/music/library.py "promo" (CC BY 3.0, credited).
"""
import math, os, subprocess, sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_news as N
from make_news import W, H, FPS, SR, text, font

HERE = os.path.dirname(os.path.abspath(__file__))
SPARK = os.path.join(HERE, "..", "..", "docs", "channel", "logos", "spark-tv.png")
SPARK = os.path.join(HERE, "intro", "spark-tv.png")
SECS = 7.0
RED, GOLD, ORANGE = (210, 30, 45), (245, 190, 40), (240, 120, 20)


def ease(x):
    x = min(1.0, max(0.0, x)); return 1 - (1 - x) ** 3


def back(x):  # overshoot then settle
    x = min(1.0, max(0.0, x)); c = 1.7
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


def bg_frame(t, hue=(10, 22, 55)):
    """Deep navy with two slow soft lights."""
    w, h = 320, 180
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    img = np.stack([np.full((h, w), hue[0]), hue[1] + 18 * y / h, hue[2] + 30 * y / h], -1)
    for cx, cy, r, col, ph in [(0.3, 0.4, 90, (40, 80, 170), 0), (0.75, 0.6, 100, (130, 30, 50), 2)]:
        px = w * (cx + 0.08 * math.cos(t * 0.6 + ph)); py = h * (cy + 0.06 * math.sin(t * 0.6 + ph))
        img += np.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * r * r))[..., None] * np.array(col, np.float32) * 0.8
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).convert("RGBA")


def place(im, logo, scale, cx, cy, alpha=1.0):
    lw, lh = int(logo.width * scale), int(logo.height * scale)
    if lw < 2: return
    l = logo.resize((lw, lh), Image.LANCZOS)
    if alpha < 1: l.putalpha(l.getchannel("A").point(lambda v: int(v * alpha)))
    im.alpha_composite(l, (int(cx - lw / 2), int(cy - lh / 2)))
    return (int(cx - lw / 2), int(cy - lh / 2), lw, lh, l.getchannel("A"))


def shine(im, box, p):
    """A white diagonal gleam crossing the logo (p 0..1), kept inside the logo's shape."""
    x, y, w, h, shape = box
    band = Image.new("L", (w, h), 0); d = ImageDraw.Draw(band)
    cx = -w * 0.3 + p * w * 1.6
    d.polygon([(cx, 0), (cx + w * 0.12, 0), (cx - h * 0.4 + w * 0.12, h), (cx - h * 0.4, h)], fill=150)
    band = band.filter(ImageFilter.GaussianBlur(8))
    region = im.crop((x, y, x + w, y + h)); mask = Image.fromarray(np.minimum(np.array(band), np.array(shape)))
    white = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    region.paste(white, (0, 0), mask); im.paste(region, (x, y))


def news_bar(d, p, y=520):
    """Red bar sliding in from the right with 'خبریں' and the date."""
    if p <= 0: return
    w = 520 * ease(p); x1 = W / 2 + 260; x0 = x1 - w
    d.rectangle([x0, y - 34, x1, y + 34], fill=RED)
    d.rectangle([x0 - 10, y - 34, x0, y + 34], fill=GOLD)
    if p > 0.6: text(d, W / 2, y, "خبریں • NEWS", 40, "white", "m")   # Urdu and English (owner, 2026-10-09)


def idea1(t, logo):
    im = bg_frame(t); d = ImageDraw.Draw(im)
    s = 0.85 * back(t / 1.1)
    box = place(im, logo, s, W / 2, 290, min(1, t / 0.4))
    if box and 1.3 < t < 2.5: shine(im, box, (t - 1.3) / 1.2)
    news_bar(d, (t - 2.2) / 0.7)
    return im


def idea2(t, logo):
    im = bg_frame(t, (6, 16, 40)); d = ImageDraw.Draw(im)
    cx, cy = W / 2, 300
    for k, (r, col, sp) in enumerate([(300, ORANGE, 40), (250, RED, -60), (350, GOLD, 25), (205, (90, 160, 255), 80)]):
        a = ease((t - k * 0.15) / 0.8)
        if a <= 0: continue
        rr = r * a; start = t * sp + k * 70
        for seg in range(3):
            st = start + seg * 120
            d.arc([cx - rr, cy - rr * 0.42, cx + rr, cy + rr * 0.42], st, st + 70, fill=col, width=4)
    place(im, logo, 0.7 * ease((t - 0.6) / 0.8), cx, cy, min(1, max(0, (t - 0.6) / 0.5)))
    title = "اسپارک ٹی وی نیوز"
    if t > 2.0:
        toks = N.tokens(title); n = max(1, int(len(toks) * min(1, (t - 2.0) / 0.9)))
        fs = N.fonts(48)
        N.draw_line(d, W / 2 + N.line_len(d, toks, fs) / 2, 560, toks[:n], fs, "white")
        lw = 360 * ease((t - 2.4) / 0.6); d.rectangle([W / 2 - lw / 2, 600, W / 2 + lw / 2, 605], fill=RED)
    return im


HEADS = ["پاکستان", "Canada", "دنیا", "India", "کھیل", "Showbiz", "موسم", "Latest news", "اہم سرخیاں", "Business",
         "کینیڈا", "Pakistan", "بھارت", "World", "شوبز", "Sports", "تازہ ترین خبریں", "Weather", "معیشت", "Headlines"]


def idea3(t, logo):
    im = bg_frame(t, (12, 12, 30)); d = ImageDraw.Draw(im)
    for row in range(7):
        y = 70 + row * 95; sp = (60 + 25 * (row % 3)) * (1 if row % 2 else -1)
        line = " • ".join(HEADS[(row * 3 + k) % len(HEADS)] for k in range(8))
        x = (W / 2 + 900 + t * sp) % 1800 - 300
        text(d, x + 900, y, line, 34, (60, 75, 110), "r")
    land = 1.2
    if t < land:
        s = 2.4 - 1.6 * ease(t / land); place(im, logo, s, W / 2, 330, ease(t / land))
    else:
        shake = 6 * math.exp(-(t - land) * 6) * math.sin((t - land) * 60)
        place(im, logo, 0.8, W / 2 + shake, 330 + shake * 0.5)
        if t < land + 0.25:
            flash = Image.new("RGBA", (W, H), (255, 255, 255, int(200 * (1 - (t - land) / 0.25))))
            im.alpha_composite(flash)
    d = ImageDraw.Draw(im)
    news_bar(d, (t - 2.0) / 0.6, 560)
    return im


def make(out, name, draw, logo_path, work):
    logo = Image.open(logo_path).convert("RGBA")
    sys.path.insert(0, os.path.join(HERE, "..", "music"))
    import library
    m = library.bed("promo", SECS, fade_in=0.05, fade_out=1.5).mean(axis=1).astype(np.float32)
    N.write_wav(os.path.join(work, name + ".wav"), 0.9 * m / max(1e-6, np.abs(m).max()))
    mp4 = os.path.join(out, name + ".mp4")
    p = subprocess.Popen(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba",
                          "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", os.path.join(work, name + ".wav"),
                          "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                          "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", mp4], stdin=subprocess.PIPE)
    for f in range(int(SECS * FPS)):
        t = f / FPS
        im = draw(t, logo)
        if t > SECS - 0.6:   # fade to the studio
            im.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(255 * (t - SECS + 0.6) / 0.6))))
        p.stdin.write(im.convert("RGBA").tobytes())
    p.stdin.close(); p.wait()
    print("made", mp4, library.credit("promo"))


def opening(path, secs=6.0, logo_path=None):
    """The chosen opening (owner 2026-10-08: idea 3, headline wall), silent, for make_news.py to lay over
    the first seconds of every bulletin; the bulletin's own sting music plays under it."""
    global SECS
    SECS = secs
    logo = Image.open(logo_path or (SPARK if os.environ.get("NEWS_LOGO") == "spark" else SPARK)).convert("RGBA")
    p = subprocess.Popen(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba",
                          "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast",
                          "-crf", "20", "-pix_fmt", "yuv420p", path], stdin=subprocess.PIPE)
    for f in range(int(secs * FPS)):
        t = f / FPS
        im = idea3(t, logo)
        if t > secs - 0.6:   # fade into the bulletin
            im.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(255 * (t - secs + 0.6) / 0.6))))
        p.stdin.write(im.tobytes())
    p.stdin.close(); p.wait()


def main():
    out = sys.argv[1]; work = os.path.join(out, "work-intro"); os.makedirs(work, exist_ok=True)
    make(out, "news-intro-1", idea1, SPARK, work)
    make(out, "news-intro-2", idea2, SPARK, work)
    make(out, "news-intro-3", idea3, SPARK, work)


if __name__ == "__main__":
    main()
