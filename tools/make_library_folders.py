"""Folder pictures for the Library's main page (owner, 2026-10-09): Spark TV (our Spark Flower logo) and MTA,
next to the language folders. 16:9, drawn into the app so they show at once, even offline.

  python3 tools/make_library_folders.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

import make_spark_logos as spark

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "app", "src", "main", "res", "drawable-nodpi")
W, H = 960, 540


def gradient(top, bottom):
    g = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(g)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,))
    return g


def glows(im, spots):
    """Soft coloured lights behind the logo."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for (x, y, r, col) in spots:
        d.ellipse([x - r, y - r, x + r, y + r], fill=col + (110,))
    im.alpha_composite(layer.filter(ImageFilter.GaussianBlur(90)))


def frame(im):
    """A thin light edge, so the picture reads as a card."""
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([10, 10, W - 11, H - 11], 26, outline=(255, 255, 255, 60), width=3)


def fit(logo, max_w, max_h):
    s = min(max_w / logo.width, max_h / logo.height)
    return logo.resize((int(logo.width * s), int(logo.height * s)), Image.LANCZOS)


def spark_folder():
    im = gradient((24, 18, 52), (8, 8, 20))
    glows(im, [(250, 170, 190, spark.PETALS[0]), (720, 160, 170, spark.PETALS[1]), (300, 420, 170, spark.PETALS[2]), (700, 420, 180, spark.PETALS[3])])
    logo = spark.corner("TV", None).crop(spark.corner("TV", None).getbbox())
    logo = fit(logo, W * .74, H * .56)
    im.alpha_composite(logo, ((W - logo.width) // 2, (H - logo.height) // 2))
    frame(im)
    return im


def mta_folder():
    im = gradient((10, 70, 50), (4, 22, 16))
    glows(im, [(260, 200, 200, (40, 170, 110)), (720, 360, 200, (210, 170, 60))])
    word = spark.mask("MTA", spark.OUT7, 190)
    sub = spark.mask("Programmes", spark.OUT4, 64)
    word = fit(word, W * .6, H * .4); sub = fit(sub, W * .5, H * .12)
    gap = 26; top = (H - word.height - gap - sub.height) // 2
    spark.put(im, word, (255, 255, 255), (W - word.width) // 2, top)
    spark.put(im, sub, (230, 205, 130), (W - sub.width) // 2, top + word.height + gap)
    frame(im)
    return im


def news_poster():
    """The 2:3 poster of the Spark TV One News folder inside Spark TV (docs/channel/logos/spark-news-poster.png)."""
    global W, H
    W, H = 600, 900
    im = gradient((24, 18, 52), (8, 8, 20))
    glows(im, [(150, 220, 170, spark.PETALS[0]), (460, 300, 160, spark.PETALS[1]), (180, 700, 170, spark.PETALS[2]), (450, 760, 170, spark.PETALS[3])])
    logo = spark.square("NEWS", None)
    logo = fit(logo.crop(logo.getbbox()), W * .78, H * .62)
    im.alpha_composite(logo, ((W - logo.width) // 2, (H - logo.height) // 2))
    frame(im)
    W, H = 960, 540
    return im


def main():
    for name, im in (("library_spark_tv", spark_folder()), ("library_mta", mta_folder())):
        path = os.path.join(OUT, name + ".png")
        im.convert("RGB").save(path, optimize=True)
        print("wrote", path)
    path = os.path.join(HERE, "..", "docs", "channel", "logos", "spark-news-poster.png")
    news_poster().convert("RGB").save(path, optimize=True)
    print("wrote", path)


if __name__ == "__main__":
    main()
