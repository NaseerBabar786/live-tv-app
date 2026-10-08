"""Puts our Bazaar TV channel logo on a back screen in the studio behind a newsreader (left side, clear of the reader,
the app's top corners and the bottom strip), so the clip feels like it comes from our own newsroom.
Usage: python3 tools/news/presenters/studio_logo.py <in.mp4> <out.mp4>   (or a .jpg/.png for a still check)"""
import os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import make_news as m

X, Y, BW, BH = 52, 120, 320, 180   # back screen on a 1280x720 frame (clear of the reader and the app corners)
LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "docs", "channel", "logos", "bazaar-tv.png")

def logo_png(path):
    """Our Bazaar TV channel logo shown on a studio back screen: dark glass screen, soft glow, the logo inside."""
    im = Image.new("RGBA", (m.W, m.H), (0, 0, 0, 0))
    glow = Image.new("RGBA", im.size, (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
    g.rounded_rectangle((X - 8, Y - 8, X + BW + 8, Y + BH + 8), 14, fill=(255, 140, 40, 70))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(18)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((X, Y, X + BW, Y + BH), 8, fill=(10, 14, 28, 225), outline=(70, 80, 100, 220), width=3)
    lg = Image.open(LOGO).convert("RGBA")
    lg = lg.crop(lg.getbbox())
    lw = BW - 40; lh = int(lg.height * lw / lg.width)
    if lh > BH - 30: lh = BH - 30; lw = int(lg.width * lh / lg.height)
    lg = lg.resize((lw, lh), Image.LANCZOS)
    im.alpha_composite(lg, (X + (BW - lw) // 2, Y + (BH - lh) // 2))
    sheen = Image.new("RGBA", im.size, (0, 0, 0, 0)); sd = ImageDraw.Draw(sheen)   # faint glass reflection
    sd.polygon([(X + 6, Y + 6), (X + BW * 0.45, Y + 6), (X + BW * 0.25, Y + BH - 6), (X + 6, Y + BH - 6)], fill=(255, 255, 255, 14))
    im.alpha_composite(sheen)
    im = im.filter(ImageFilter.GaussianBlur(0.7))   # a touch soft, like a screen behind the reader
    im.save(path)

def main():
    src, out = sys.argv[1:3]
    logo_png("studio-logo.png")
    if src.lower().endswith((".jpg", ".png")):
        bg = Image.open(src).convert("RGBA").resize((m.W, m.H)); bg.alpha_composite(Image.open("studio-logo.png"))
        bg.convert("RGB").save(out); return
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", src, "-i", "studio-logo.png", "-filter_complex",
                    f"[0:v]scale={m.W}:{m.H}:force_original_aspect_ratio=decrease,pad={m.W}:{m.H}:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];[v0][1:v]overlay=0:0,format=yuv420p[v]",
                    "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-c:a", "copy", out], check=True)

if __name__ == "__main__":
    main()
