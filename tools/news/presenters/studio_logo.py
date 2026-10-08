"""Puts our Bazaar TV News logo on the studio wall behind a newsreader (left side, clear of the reader,
the app's top corners and the bottom strip), so the clip feels like it comes from our own newsroom.
Usage: python3 tools/news/presenters/studio_logo.py <in.mp4> <out.mp4>   (or a .jpg/.png for a still check)"""
import os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import make_news as m

X, Y, BW, BH = 52, 128, 300, 150   # panel box on a 1280x720 frame

def logo_png(path):
    im = Image.new("RGBA", (m.W, m.H), (0, 0, 0, 0))
    glow = Image.new("RGBA", im.size, (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
    g.rounded_rectangle((X - 10, Y - 10, X + BW + 10, Y + BH + 10), 26, fill=(60, 140, 255, 110))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(16)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((X, Y, X + BW, Y + BH), 18, fill=(8, 22, 60, 215), outline=(120, 180, 255, 200), width=2)
    d.rounded_rectangle((X + 18, Y + 18, X + BW - 18, Y + 84), 12, fill=(200, 16, 32, 245))
    m.text(d, X + BW // 2, Y + 49, m.BRAND, 36, (255, 255, 255, 255), align="m")
    f = m.font(True, 26)
    w = d.textlength("BAZAAR TV NEWS", font=f)
    d.text((X + (BW - w) / 2, Y + 100), "BAZAAR TV NEWS", font=f, fill=(225, 235, 255, 240))
    im = im.filter(ImageFilter.GaussianBlur(0.6))   # a touch soft, like a screen behind the reader
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
