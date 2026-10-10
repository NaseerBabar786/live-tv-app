"""Spark One (the Google Play app, owner's name and logo 2026-10-10): the TV home-screen banner and the Play
listing's TV banner and feature graphic, drawn from the Spark One logo (tools/make_spark_logos.py, key "one").
The tagline is in English and Urdu (all writing in both, owner 2026-10-10).

    python3 tools/make_spark_logos.py && python3 tools/make_spark_one_art.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
LOGO = os.path.join(ROOT, "docs", "channel", "logos", "spark-one.png")
URDU = os.path.join(HERE, "stories", "fonts", "NotoNastaliqUrdu-700.ttf")
LATIN = os.path.join(HERE, "fonts", "outfit-latin-400-normal.woff")
BACK = (16, 17, 24)
TAG_EN = "Films in Urdu and Hindi · Shayari · Stories · Free"
TAG_UR = "اردو اور ہندی میں فلمیں، شاعری اور کہانیاں، مفت"


def logo(width):
    im = Image.open(LOGO).convert("RGBA")
    im = im.crop(im.getbbox())
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def banner(w, h):
    o = Image.new("RGBA", (w, h), BACK + (255,))
    lg = logo(round(w * 0.62))
    o.alpha_composite(lg, ((w - lg.width) // 2, (h - lg.height) // 2))
    return o.convert("RGB")


def feature():
    w, h = 1024, 500
    o = Image.new("RGBA", (w, h), BACK + (255,))
    lg = logo(520)
    o.alpha_composite(lg, ((w - lg.width) // 2, 50))
    d = ImageDraw.Draw(o)
    en, ur = ImageFont.truetype(LATIN, 30), ImageFont.truetype(URDU, 30)
    y = 50 + lg.height + 34
    d.text((w // 2, y), TAG_EN, font=en, fill=(205, 210, 222), anchor="mt")
    d.text((w // 2, y + 52), TAG_UR, font=ur, fill=(255, 196, 0), anchor="mt", direction="rtl", language="ur")
    return o.convert("RGB")


def main():
    banner(640, 360).save(os.path.join(ROOT, "app", "src", "spark", "res", "drawable-nodpi", "spark_banner.png"), optimize=True)
    banner(1280, 720).save(os.path.join(ROOT, "play", "spark-tv", "tv-banner.png"), optimize=True)
    feature().save(os.path.join(ROOT, "play", "spark-tv", "feature-graphic.png"), optimize=True)
    print("wrote the Spark One banners and feature graphic")


if __name__ == "__main__":
    main()
