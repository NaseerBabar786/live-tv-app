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
W, H = 1280, 720
f = lambda p, s: ImageFont.truetype(p, s)

def grad(c1, c2):
    im = Image.new("RGB", (W, H)); d = ImageDraw.Draw(im)
    for x in range(W):
        t = x / W
        d.line([(x, 0), (x, H)], fill=tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)))
    return im

def centered(d, y, text, font, fill="white"):
    d.text(((W - d.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)

def slide(c1, c2, lines, logo=True):
    im = grad(c1, c2); d = ImageDraw.Draw(im)
    y = 70
    if logo:
        lg = Image.open(LOGO).resize((230, 230)); im.paste(lg, ((W - 230) // 2, y), lg); y += 260
    for text, font, fill in lines:
        centered(d, y, text, font, fill); y += font.size + 22
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

render(slide(ORANGE, RED, [("You're watching Bazaar TV", f(B, 64), "white"),
                           ("on Free Live TV", f(BD, 40), (255, 236, 179))]), 10, "ident-welcome.mp4")
render(slide(NAVY, BLUE, [("Coming up next", f(B, 72), "white"),
                          ("Stay with Bazaar TV", f(BD, 40), (191, 219, 254))]), 8, "ident-coming-up.mp4")
render(slide(NAVY, BLUE, [("Commercial break", f(B, 64), "white"),
                          ("We'll be right back", f(BD, 40), (191, 219, 254))]), 5, "ident-break.mp4", zoom=False)

ad = Image.open(AD_PICTURE).convert("RGB").resize((W, H))
render(ad, 20, "ad-bulk-bazaar.mp4")

render(slide(GREEN, TEAL, [("Your ad could be here!", f(B, 64), "white"),
                           ("Advertise on Bazaar TV", f(BD, 44), (253, 224, 71)),
                           ("WhatsApp 437 602 6500  ·  tv.bulkbazaar.ca/advertise", f(BD, 32), "white")]), 15, "ad-advertise-here.mp4")
render(slide(RED, ORANGE, [("Free Live TV", f(B, 72), "white"),
                           ("Up to 6 channels at once on one TV. Free.", f(BD, 38), "white"),
                           ("Download at tv.bulkbazaar.ca", f(BD, 38), (255, 236, 179))]), 15, "promo-free-live-tv.mp4")
