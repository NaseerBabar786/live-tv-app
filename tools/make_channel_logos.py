from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, os, sys
OUT = sys.argv[1]
B = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
BD = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
def font(p, s): return ImageFont.truetype(p, s)
def grad(size, c1, c2, angle=135):
    w, h = size; im = Image.new("RGBA", size)
    px = im.load(); a = math.radians(angle); dx, dy = math.cos(a), math.sin(a)
    mx = abs(dx)*w + abs(dy)*h
    for y in range(h):
        for x in range(w):
            t = ((x*dx + y*dy) - min(0,dx*w) - min(0,dy*h)) / mx
            t = max(0, min(1, t))
            px[x, y] = tuple(int(c1[i] + (c2[i]-c1[i])*t) for i in range(3)) + (255,)
    return im
def rounded_mask(size, r):
    m = Image.new("L", size, 0); ImageDraw.Draw(m).rounded_rectangle([0,0,size[0]-1,size[1]-1], r, fill=255); return m
def circle_mask(size):
    m = Image.new("L", size, 0); ImageDraw.Draw(m).ellipse([0,0,size[0]-1,size[1]-1], fill=255); return m
def center_text(d, cx, y, text, f, fill):
    w = d.textlength(text, font=f); d.text((cx - w/2, y), text, font=f, fill=fill)
def tv_icon(d, cx, cy, s, fill, play):
    w, h = s, s*0.66
    d.rounded_rectangle([cx-w/2, cy-h/2, cx+w/2, cy+h/2], s*0.12, fill=fill)
    d.polygon([(cx-s*0.1, cy-s*0.16), (cx-s*0.1, cy+s*0.16), (cx+s*0.17, cy)], fill=play)
    d.line([(cx-s*0.18, cy-h/2-s*0.2), (cx, cy-h/2-s*0.02), (cx+s*0.18, cy-h/2-s*0.2)], fill=fill, width=int(s*0.06), joint="curve")

S = 512
def save(im, name): im.save(f"{OUT}/{name}.png")

# 2 BB Live: deep blue circle, big BB, red LIVE pill
im = Image.new("RGBA", (S,S), (0,0,0,0)); bg = grad((S,S), (30,64,175), (15,23,42)); im.paste(bg, (0,0), circle_mask((S,S)))
d = ImageDraw.Draw(im); center_text(d, S/2, 95, "BB", font(B, 230), "white")
d.rounded_rectangle([136, 350, 376, 430], 40, fill=(229,57,53)); center_text(d, S/2+14, 356, "LIVE", font(B, 62), "white")
d.ellipse([152, 381, 170, 399], fill="white")
save(im, "bb-live")

# 3 Apna TV: green to teal rounded square, Apna in script-ish bold
im = Image.new("RGBA", (S,S), (0,0,0,0)); bg = grad((S,S), (16,185,129), (6,95,70)); im.paste(bg, (0,0), rounded_mask((S,S), 256))
d = ImageDraw.Draw(im); center_text(d, S/2, 140, "apna", font(B, 140), "white"); center_text(d, S/2, 300, "TV", font(B, 110), (253,224,71))
save(im, "apna-tv")

# 4 Desi Lehar TV: purple/pink with wave
im = Image.new("RGBA", (S,S), (0,0,0,0)); bg = grad((S,S), (147,51,234), (236,72,153)); im.paste(bg, (0,0), rounded_mask((S,S), 110))
d = ImageDraw.Draw(im); center_text(d, S/2, 110, "DESI", font(B, 120), "white"); center_text(d, S/2, 235, "LEHAR", font(B, 96), "white")
pts = [(60 + x, 400 + 26*math.sin(x/38)) for x in range(0, 393, 4)]; d.line(pts, fill=(255,255,255), width=16, joint="curve")
center_text(d, S/2, 440, "TV", font(BD, 44), (255,230,250))
save(im, "desi-lehar-tv")

# 5 Rang TV: dark badge with colour ring
im = Image.new("RGBA", (S,S), (0,0,0,0)); d = ImageDraw.Draw(im)
cols = [(239,68,68),(249,115,22),(234,179,8),(34,197,94),(59,130,246),(168,85,247)]
for i, c in enumerate(cols): d.pieslice([0,0,S-1,S-1], i*60-90, (i+1)*60-90, fill=c)
d.ellipse([40,40,S-41,S-41], fill=(17,17,27))
center_text(d, S/2, 150, "RANG", font(B, 120), "white"); center_text(d, S/2, 285, "TV", font(B, 90), (250,204,21))
save(im, "rang-tv")



# Our own channels (1.9.47): broadcast-style "action slash" logos. A slanted colour slab with the
# channel word in heavy italic, speed lines on the left and a dark BAZAAR tab on top (a red TV tab
# under Bazaar TV). Wide pictures, so the app and website show them as wide corner logos; each also
# gets a <name>-square.png copy for favicons and title cards.
import numpy as np
from PIL import ImageChops
POP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "Poppins-BlackItalic.ttf")
CHANNELS = [  # file, word, main colour, second colour, tag under the slab
    ("bazaar-tv", "BAZAAR", (255, 120, 0), (214, 20, 40), "TV"),
    ("bazaar-cinema", "CINEMA", (230, 170, 40), (140, 20, 30)),
    ("bazaar-music", "MUSIC", (150, 70, 255), (0, 190, 200)),
    ("bazaar-hits", "HITS", (255, 40, 140), (255, 120, 0)),
    ("bazaar-kids", "KIDS", (60, 200, 60), (255, 200, 0)),
    ("bazaar-sports", "SPORTS", (0, 110, 255), (0, 200, 120)),
    ("bazaar-travel", "TRAVEL", (0, 170, 230), (0, 160, 140)),
    ("bazaar-comedy", "COMEDY", (255, 200, 0), (255, 80, 60)),
    ("bazaar-english", "MOVIES", (230, 40, 60), (25, 45, 140), "ENGLISH"),
    ("bazaar-hindi", "MOVIES", (255, 140, 0), (0, 140, 70), "HINDI"),
    ("bazaar-dramas", "DRAMAS", (190, 70, 230), (230, 40, 110), "URDU"),  # 11: Urdu dramas (2026-10-08)
    ("bazaar-dramas-hindi", "DRAMAS", (255, 70, 150), (120, 40, 200), "HINDI"),  # 16: Hindi dramas (2026-10-08)
    ("bazaar-cooking", "COOKING", (240, 70, 30), (255, 185, 0)),
    ("bazaar-teens", "TEENS", (0, 200, 220), (150, 60, 255)),
    ("bazaar-ads", "ADS", (255, 210, 0), (230, 30, 90)),  # 15: ads and promos round the clock (2026-10-07)
    ("bazaar-shayari", "SHAYARI", (235, 140, 120), (120, 30, 90)),  # 5: Urdu poetry (2026-10-08)
    ("latest-movies", "MOVIES", (255, 190, 0), (200, 30, 40)),  # 13: the owner's wish, no BAZAAR on it
    # One language per channel (2026-10-08): the halves of channels that were mixed.
    ("bazaar-musicur", "MUSIC", (150, 70, 255), (0, 190, 200), "URDU"),
    ("bazaar-cookingur", "COOKING", (240, 70, 30), (255, 185, 0), "URDU"),
    ("bazaar-kidshi", "KIDS", (60, 200, 60), (255, 200, 0), "HINDI"),
    ("bazaar-teenshi", "TEENS", (0, 200, 220), (150, 60, 255), "HINDI"),
    ("bazaar-comedyen", "COMEDY", (255, 200, 0), (255, 80, 60), "ENGLISH"),
    ("bazaar-comedyur", "COMEDY", (255, 200, 0), (255, 80, 60), "URDU"),  # 9
    ("bazaar-comedypa", "COMEDY", (255, 200, 0), (255, 80, 60), "PUNJABI"),  # 65
    ("bazaar-kavi", "KAVI", (235, 140, 120), (120, 30, 90), "HINDI"),  # 27: Hindi poetry, kavi sammelan
    ("bazaar-gurbani", "GURBANI", (255, 150, 0), (20, 60, 160), "PUNJABI"),  # 62
    ("bazaar-moviespa", "MOVIES", (235, 50, 70), (255, 170, 0), "PUNJABI"),  # 63
    ("bazaar-sufi", "SUFI", (0, 170, 140), (40, 40, 120), "PUNJABI"),  # 64: Sufi qawwali
    # Cars (the owner, 2026-10-08): 47 in English, 32 in Hindi.
    ("bazaar-auto", "AUTO", (120, 140, 255), (20, 30, 90)),
    ("bazaar-auto-hindi", "AUTO", (120, 140, 255), (20, 30, 90), "HINDI"),
]
TOP_TAB = {"latest-movies": "LATEST"}  # the dark tab on top, for a channel not called Bazaar ...
OLD_NAMES = {"bazaar-cinema": "sunehra-daur", "bazaar-music": "sur-sukoon", "bazaar-hits": "geet-bahar"}  # links saved before 1.9.41

def mix(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
def dark(c, k): return tuple(int(v * k) for v in c)
def light(c, k): return mix(c, (255, 255, 255), k)

def word_mask(text, size, track=0):
    f = ImageFont.truetype(POP, size)
    m = Image.new("L", (int(sum(f.getlength(ch) for ch in text) + track * len(text) + size), int(size * 1.6)), 0)
    d = ImageDraw.Draw(m); x = size * 0.3
    for ch in text: d.text((x, size * 0.2), ch, font=f, fill=255); x += f.getlength(ch) + track
    return m.crop(m.getbbox())

def grow(m, r):
    return m.filter(ImageFilter.GaussianBlur(r / 2)).point(lambda v: 255 if v > 8 else v * 32)

def shift(m, dx, dy):
    out = Image.new("L", m.size, 0); out.paste(m, (int(dx), int(dy))); return out

def vgrad(size, stops):
    w, h = size; ys = np.linspace(0, 1, h); arr = np.zeros((h, 3))
    for c in range(3): arr[:, c] = np.interp(ys, [s[0] for s in stops], [s[1][c] for s in stops])
    return Image.fromarray(np.repeat(arr[:, None, :], w, axis=1).astype(np.uint8), "RGB").convert("RGBA")

def hgrad(size, stops):
    return vgrad((size[1], size[0]), stops).rotate(90, expand=True).transpose(Image.FLIP_TOP_BOTTOM)

def paint(m, src):
    if isinstance(src, tuple): src = Image.new("RGBA", m.size, src + (255,))
    out = Image.new("RGBA", m.size, (0, 0, 0, 0)); out.paste(src, (0, 0), m); return out

def soft(m, blur, alpha):
    return paint(m.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: v * alpha // 255), (0, 0, 0))

def gloss(m, top, bottom, a):
    w, h = m.size; px = np.zeros((h, w), np.uint8); y0, y1 = int(h * top), int(h * bottom)
    for y in range(y0, y1): px[y, :] = int(a * (1 - (y - y0) / max(1, y1 - y0)))
    return paint(ImageChops.multiply(Image.fromarray(px, "L"), m), (255, 255, 255))

def slab(w, h, sl=0.35):
    m = Image.new("L", (int(w + h * sl), h), 0)
    ImageDraw.Draw(m).polygon([(h * sl, 0), (w + h * sl, 0), (w, h), (0, h)], fill=255); return m

TEXT_W, TEXT_H = 1300, 241  # the same slab for every channel, so all logos are one size (1.9.50)

def fitted_word(word):
    """The channel word at the size that fits the slab: long words shrink, short ones spread out a little."""
    size, track = 330, -6
    m = word_mask(word, size, track)
    while m.width > TEXT_W: size -= 6; m = word_mask(word, size, track)
    if len(word) > 1 and m.width < TEXT_W: m = word_mask(word, size, min(60, track + (TEXT_W - m.width) // (len(word) - 1)))
    return m

def action_logo(key, word, c1, c2, tag=None):
    tw = fitted_word(word)
    s0 = slab(TEXT_W + 140, TEXT_H + 110); sm = Image.new("L", (s0.width + 80, s0.height + 80), 0); sm.paste(s0, (40, 40))
    ph = s0.height
    out = Image.new("RGBA", (sm.width + 900, sm.height + 560), (0, 0, 0, 0)); ox, oy = 200, 320
    st = Image.new("L", out.size, 0); sd = ImageDraw.Draw(st)
    for yy, ln, th in ((0.2, 320, 16), (0.38, 420, 22), (0.56, 260, 14), (0.74, 380, 18)):  # speed lines
        y = oy + sm.height * yy; x2 = ox + 70 + (1 - yy) * ph * 0.35
        sd.polygon([(x2 - ln, y), (x2, y - th / 2), (x2, y + th / 2)], fill=255)
    out.alpha_composite(paint(st, hgrad(out.size, [(0, c1), (0.25, light(c1, .4)), (1, (255, 255, 255))])))
    big = Image.new("L", out.size, 0); big.paste(sm, (ox, oy))
    out.alpha_composite(soft(shift(big, 18, 22), 18, 170))
    out.alpha_composite(paint(grow(big, 12), (255, 255, 255)))
    out.alpha_composite(paint(big, vgrad(out.size, [(0, light(c1, .25)), ((oy + sm.height * .5) / out.height, c1), (1, c2)])))
    hl = Image.new("L", out.size, 0)  # light streak across the slab
    ImageDraw.Draw(hl).polygon([(ox + 40, oy + sm.height * .55), (ox + sm.width, oy + 40), (ox + sm.width, oy + 90), (ox + 40, oy + sm.height * .62)], fill=90)
    out.alpha_composite(paint(ImageChops.multiply(hl, big), (255, 255, 255)))
    out.alpha_composite(gloss(big, oy / out.height, (oy + sm.height * .45) / out.height, 70))
    t = Image.new("L", out.size, 0); t.paste(tw, (ox + (sm.width - tw.width) // 2 + 10, oy + (sm.height - tw.height) // 2))
    out.alpha_composite(paint(shift(t, 10, 12), dark(c2, .5)))
    out.alpha_composite(paint(t, (255, 255, 255)))
    tabs = [] if word == "BAZAAR" else [(TOP_TAB.get(key, "BAZAAR"), 235, 6, False)]  # big enough to read in the TV corner (1.9.49)
    if tag: tabs.append((tag, 190 if len(tag) <= 2 else 175, 0 if len(tag) <= 2 else 6, True))
    for text, size, track, under in tabs:  # dark BAZAAR tab on top, coloured tag (TV, ENGLISH) under the slab
        tm = word_mask(text, size, track=track)
        tab = slab(tm.width + 80, tm.height + 46)
        tx, ty = (ox + sm.width - tab.width - 10, oy + sm.height - 40) if under else (ox + 120, oy - tab.height + 30)
        tl = Image.new("L", out.size, 0); tl.paste(tab, (tx, ty))
        out.alpha_composite(soft(shift(tl, 8, 10), 8, 150))
        out.alpha_composite(paint(grow(tl, 12), (255, 255, 255)))
        out.alpha_composite(paint(tl, c2 if under else (10, 10, 14)))
        tt = Image.new("L", out.size, 0); tt.paste(tm, (tx + (tab.width - tm.width) // 2 + 6, ty + (tab.height - tm.height) // 2))
        out.alpha_composite(paint(tt, (255, 255, 255)))
    return out  # cropped later to one box shared by every channel

drawn = [(key, action_logo(key, word, c1, c2, *tag)) for key, word, c1, c2, *tag in CHANNELS]
boxes = [im.getbbox() for _, im in drawn]
box = (min(b[0] for b in boxes) - 12, min(b[1] for b in boxes) - 12, max(b[2] for b in boxes) + 12, max(b[3] for b in boxes) + 12)
for key, lg in drawn:
    lg = lg.crop(box)  # every logo gets the same canvas, so they show at the same size in the TV corner
    k = 900 / lg.width; wide = lg.resize((900, int(lg.height * k)), Image.LANCZOS)
    wide.save(f"{OUT}/{key}.png", optimize=True)
    sq = Image.new("RGBA", (S, S), (0, 0, 0, 0)); s = lg.resize((S - 16, int(lg.height * (S - 16) / lg.width)), Image.LANCZOS)
    sq.alpha_composite(s, (8, (S - s.height) // 2)); sq.save(f"{OUT}/{key}-square.png", optimize=True)
    if key in OLD_NAMES: wide.save(f"{OUT}/{OLD_NAMES[key]}.png", optimize=True)
