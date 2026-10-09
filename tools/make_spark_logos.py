"""Spark Flower logos for our own channels (owner's picks, 2026-10-08: name Spark, logo "M2 Spark Flower",
language tag style B). Writes docs/channel/logos/spark-<key>.png (the TV corner logo: petals, "spark" with a
small coloured language tag, the channel word under it, all on one shared canvas so every channel shows
at the same size) and spark-<key>-square.png (512x512, for playlists, favicons and title cards).

  python3 tools/make_spark_logos.py            # only the files that are missing
  python3 tools/make_spark_logos.py --all      # redraw every file

Channel numbers are never drawn in (channels may move between number blocks).
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "docs", "channel", "logos")
FONTS = os.path.join(HERE, "fonts")
OUT4, OUT6, OUT7 = (os.path.join(FONTS, f"outfit-latin-{w}-normal.woff") for w in (400, 600, 700))
K = 2  # draw at twice the size and shrink at the end, for smooth edges
WHITE = (255, 255, 255)
PETALS = ((255, 106, 0), (255, 45, 120), (124, 58, 237), (255, 196, 0))
LANG = {"URDU": (0, 150, 80), "HINDI": (255, 120, 0), "ENGLISH": (40, 105, 255), "PUNJABI": (215, 150, 0)}
WORD = {"TV": (150, 156, 170), "CINEMA": (230, 160, 20), "MUSIC": (150, 80, 255), "HITS": (255, 45, 120), "KIDS": (40, 190, 80),
        "SPORTS": (0, 120, 255), "TRAVEL": (0, 175, 220), "COMEDY": (255, 190, 0), "MOVIES": (235, 50, 70), "DRAMAS": (190, 80, 235),
        "COOKING": (245, 90, 40), "TEENS": (0, 200, 200), "ADS": (255, 200, 0), "NEWS": (230, 35, 55), "SHAYARI": (0, 190, 170),
        "KAVI SAMMELAN": (0, 190, 170), "AUTO": (120, 140, 255), "GURBANI": (255, 153, 51), "SUFI QAWWALI": (0, 175, 125)}

# Logo file key -> (channel word, language tag or None). The tag only goes on channels whose name has a language in it.
CHANNELS = {
    "tv": ("TV", None), "dramas": ("DRAMAS", "URDU"), "musicur": ("MUSIC", "URDU"), "cookingur": ("COOKING", "URDU"),
    "shayari": ("SHAYARI", None),
    "cinema": ("CINEMA", None), "hindi": ("MOVIES", "HINDI"), "hits": ("HITS", None), "dramas-hindi": ("DRAMAS", "HINDI"),
    "comedy": ("COMEDY", "HINDI"), "cooking": ("COOKING", "HINDI"), "kavi": ("KAVI SAMMELAN", None), "kidshi": ("KIDS", "HINDI"),
    "teenshi": ("TEENS", "HINDI"), "autohi": ("AUTO", "HINDI"), "auto-hindi": ("AUTO", "HINDI"),
    "english": ("MOVIES", "ENGLISH"), "kids": ("KIDS", "ENGLISH"), "teens": ("TEENS", "ENGLISH"), "travel": ("TRAVEL", None),
    "sports": ("SPORTS", None), "auto": ("AUTO", None), "ads": ("ADS", None), "comedyen": ("COMEDY", "ENGLISH"),
    "comedyur": ("COMEDY", "URDU"), "comedypa": ("COMEDY", "PUNJABI"),
    "music": ("MUSIC", "PUNJABI"), "gurbani": ("GURBANI", None), "moviespa": ("MOVIES", "PUNJABI"), "sufi": ("SUFI QAWWALI", None),
    "news": ("NEWS", None),
    # Spark TV on Google Play (2026-10-09): its comedy and music channels are in no one language.
    "comedy-play": ("COMEDY", None), "music-play": ("MUSIC", None),
    "cinema-urdu": ("CINEMA", "URDU"), "cinema-hindi": ("CINEMA", "HINDI"), "cooking-play": ("COOKING", None),
}


def font(path, size): return ImageFont.truetype(path, int(size))


def mask(text, path, size):
    f = font(path, size * K); m = Image.new("L", (int(f.getlength(text) + size * K * 2), int(size * K * 2.6)), 0)
    ImageDraw.Draw(m).text((size * K, size * K * .5), text, font=f, fill=255); return m.crop(m.getbbox())


def paint(m, col):
    o = Image.new("RGBA", m.size, (0, 0, 0, 0)); o.paste(Image.new("RGBA", m.size, col + (255,)), (0, 0), m); return o


def put(o, m, col, x, y):
    layer = Image.new("RGBA", o.size, (0, 0, 0, 0)); layer.paste(paint(m, col), (int(x), int(y))); o.alpha_composite(layer)


def petals(S):
    """Four petals in four colours meeting in the middle."""
    o = Image.new("RGBA", (S, S), (0, 0, 0, 0)); c = S / 2
    for i, col in enumerate(PETALS):
        p = Image.new("L", (S, S), 0); pw, ph = S * .26, S * .48
        ImageDraw.Draw(p).ellipse([c - pw / 2, c - ph + S * .04, c + pw / 2, c + S * .07], fill=255)
        o.alpha_composite(paint(p.rotate(-90 * i, resample=Image.BICUBIC, center=(c, c)), col))
    return o


def tag(lang):
    h = 118 * K; t = mask(lang, OUT7, 62)
    s = min(1, h * .62 / t.height); t = t.resize((max(1, int(t.width * s)), max(1, int(t.height * s))), Image.LANCZOS)
    w = t.width + 64 * K; p = Image.new("L", (w, h), 0); ImageDraw.Draw(p).rounded_rectangle([0, 0, w - 1, h - 1], h // 2, fill=255)
    o = paint(p, LANG[lang]); o.alpha_composite(paint(t, WHITE), ((w - t.width) // 2, (h - t.height) // 2)); return o


def words(word, lang):
    """'spark' (+ tag) over the channel word, as one transparent picture."""
    w1 = mask("spark", OUT6, 200); size = 170; w2 = mask(word.lower(), OUT4, size)
    while w2.width > w1.width * 1.35: size -= 6; w2 = mask(word.lower(), OUT4, size)
    tg = tag(lang) if lang else None
    W = max(w1.width + (40 * K + tg.width if tg else 0), w2.width + 4 * K); H = w1.height + 30 * K + w2.height
    o = Image.new("RGBA", (W, H), (0, 0, 0, 0)); put(o, w1, WHITE, 0, 0)
    if tg: o.alpha_composite(tg, (w1.width + 40 * K, (w1.height - tg.height) // 2 + 6 * K))
    put(o, w2, WORD.get(word, WORD["TV"]), 4 * K, w1.height + 30 * K); return o


def corner(word, lang):
    S = 330 * K; t = words(word, lang); o = Image.new("RGBA", (S + 40 * K + t.width, max(S, t.height)), (0, 0, 0, 0))
    o.alpha_composite(petals(S), (0, (o.height - S) // 2)); o.alpha_composite(t, (S + 40 * K, (o.height - t.height) // 2)); return o


def square(word, lang):
    N = 1024; o = Image.new("RGBA", (N, N), (0, 0, 0, 0)); t = words(word, lang)
    S = int(N * .5); s = min(1, (N * .86) / t.width, (N * .9 - S - 30) / t.height); t = t.resize((int(t.width * s), int(t.height * s)), Image.LANCZOS)
    top = (N - (S + 30 + t.height)) // 2
    o.alpha_composite(petals(S), ((N - S) // 2, top)); o.alpha_composite(t, ((N - t.width) // 2, top + S + 30))
    return o.resize((512, 512), Image.LANCZOS)


def main():
    redo = "--all" in sys.argv
    # One shared canvas for every corner logo: the widest and tallest of the set, then 900 px wide.
    big = {k: corner(*v) for k, v in CHANNELS.items()}
    BW = max(i.width for i in big.values()); BH = max(i.height for i in big.values())
    BW, BH = max(BW, 1246 * K), max(BH, 390 * K)  # never smaller than the set the owner approved
    for k, (word, lang) in CHANNELS.items():
        path = os.path.join(OUT, f"spark-{k}.png")
        if redo or not os.path.exists(path):
            cv = Image.new("RGBA", (BW, BH), (0, 0, 0, 0)); im = big[k]
            cv.alpha_composite(im, ((BW - im.width) // 2, (BH - im.height) // 2))
            cv.resize((900, round(BH * 900 / BW)), Image.LANCZOS).save(path, optimize=True); print("wrote", path)
        sq = os.path.join(OUT, f"spark-{k}-square.png")
        if redo or not os.path.exists(sq): square(word, lang).save(sq, optimize=True); print("wrote", sq)


if __name__ == "__main__":
    main()
