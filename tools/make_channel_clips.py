"""Makes the short clips for the owner's test channel: idents, promos and ads (1280x720 MP4).

Usage: python3 tools/make_channel_clips.py <bulk-bazaar-ad-16x9.png> <out dir>
Needs Pillow and ffmpeg. The films come from .github/workflows/build-channel-media.yml.
"""
import os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

AD_PICTURE, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "..", "docs", "channel", "logos", "bazaar-tv-square.png")
B = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
BD = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
# Bazaar TV is an Urdu channel (the owner, 2026-10-07): the idents and our own ad are in Urdu.
# Noto Nastaliq Urdu (SIL Open Font Licence); Pillow needs raqm to join the letters.
UR = os.path.join(HERE, "fonts", "NotoNastaliqUrdu.ttf")
W, H = 1280, 720
def f(p, s):
    font = ImageFont.truetype(p, s)
    if p == UR:
        font.set_variation_by_axes([700])
    return font

def grad(c1, c2):
    im = Image.new("RGB", (W, H)); d = ImageDraw.Draw(im)
    for x in range(W):
        t = x / W
        d.line([(x, 0), (x, H)], fill=tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)))
    return im

def centered(d, y, text, font, fill="white"):
    urdu = any("\u0600" <= ch <= "\u06ff" for ch in text)
    kw = {"direction": "rtl", "language": "ur"} if urdu else {}
    if not urdu:
        d.text(((W - d.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)
        return font.size
    # Nastaliq sits low and stands tall: place it by its drawn box.
    x0, y0, x1, y1 = d.textbbox((0, 0), text, font=font, **kw)
    d.text(((W - (x1 - x0)) / 2 - x0, y - y0), text, font=font, fill=fill, **kw)
    return y1 - y0

def slide(c1, c2, lines, logo=True):
    im = grad(c1, c2); d = ImageDraw.Draw(im)
    y = 70
    if logo:
        lg = Image.open(LOGO).resize((230, 230)); im.paste(lg, ((W - 230) // 2, y), lg); y += 260
    for text, font, fill in lines:
        y += centered(d, y, text, font, fill) + 26
    return im

def render(still, seconds, name, zoom=True):
    tmp = os.path.join(tempfile.mkdtemp(), "s.png"); still.save(tmp)
    frames = seconds * 25
    vf = (f"scale=2560:1440,zoompan=z='min(1+0.0006*on,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps=25,"
          if zoom else f"fps=25,") + f"fade=t=in:st=0:d=0.6,fade=t=out:st={seconds - 0.6}:d=0.6,format=yuv420p"
    # A soft three-note chord, so the breaks aren't silent.
    music = (f"aevalsrc='0.08*sin(2*PI*261.6*t)*(1+0.3*sin(2*PI*0.5*t))+0.06*sin(2*PI*329.6*t)+0.05*sin(2*PI*392*t)'"
             f":s=44100:d={seconds},afade=t=in:d=1,afade=t=out:st={seconds - 1.2}:d=1.2")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", str(seconds), "-i", tmp,
                    "-f", "lavfi", "-i", music, "-vf", vf, "-t", str(seconds),
                    "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-r", "25",
                    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
                    os.path.join(OUT, name)], check=True)

os.makedirs(OUT, exist_ok=True)
ORANGE, RED, NAVY, BLUE, GREEN, TEAL = (255, 153, 0), (220, 38, 38), (15, 23, 42), (30, 64, 175), (16, 185, 129), (6, 95, 70)

render(slide(ORANGE, RED, [("آپ دیکھ رہے ہیں بازار ٹی وی", f(UR, 54), "white"),
                           ("کیبل ٹی وی پر", f(UR, 34), (255, 236, 179))]), 10, "ident-welcome.mp4")
render(slide(NAVY, BLUE, [("اگلا پروگرام", f(UR, 62), "white"),
                          ("بازار ٹی وی کے ساتھ رہیے", f(UR, 34), (191, 219, 254))]), 8, "ident-coming-up.mp4")
render(slide(NAVY, BLUE, [("وقفہ", f(UR, 62), "white"),
                          ("ہم ابھی واپس آتے ہیں", f(UR, 34), (191, 219, 254))]), 5, "ident-break.mp4", zoom=False)

ad = Image.open(AD_PICTURE).convert("RGB").resize((W, H))
render(ad, 20, "ad-bulk-bazaar.mp4")

render(slide(GREEN, TEAL, [("آپ کا اشتہار یہاں ہو سکتا ہے!", f(UR, 50), "white"),
                           ("بازار ٹی وی پر اشتہار دیں", f(UR, 36), (253, 224, 71)),
                           ("WhatsApp 437 602 6500  ·  tv.bulkbazaar.ca/advertise", f(BD, 32), "white")]), 15, "ad-advertise-here.mp4")
render(slide(RED, ORANGE, [("Cable TV", f(B, 72), "white"),
                           ("Up to 6 channels at once on one TV. Free.", f(BD, 38), "white"),
                           ("Download at tv.bulkbazaar.ca", f(BD, 38), (255, 236, 179))]), 15, "promo-free-live-tv.mp4")
