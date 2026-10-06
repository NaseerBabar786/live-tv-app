from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, sys
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

# 1 Bazaar TV: orange to red rounded square, white TV + wordmark
im = Image.new("RGBA", (S,S), (0,0,0,0)); bg = grad((S,S), (255,153,0), (220,38,38)); im.paste(bg, (0,0), rounded_mask((S,S), 110))
d = ImageDraw.Draw(im); tv_icon(d, S/2, 185, 190, (255,255,255,255), (220,38,38,255))
center_text(d, S/2, 300, "BAZAAR", font(B, 96), "white"); center_text(d, S/2, 400, "TV", font(B, 70), (255,236,179))
save(im, "bazaar-tv")

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


# Our extra channels, drawn at double size and scaled down for smooth edges.
L = 1024
def save_big(im, name): im.resize((S, S), Image.LANCZOS).save(f"{OUT}/{name}.png")
def text_fit(d, cx, y, text, path, size, fill, width):
    f = font(path, size)
    while d.textlength(text, font=f) > width: size -= 4; f = font(path, size)
    center_text(d, cx, y, text, f, fill)

# 6 Bazaar Cinema, 00 (golden-era films; was Sunehra Daur until 1.9.41): maroon disc, gold ring and film sprockets, gold play mark
im = Image.new("RGBA", (L,L), (0,0,0,0)); im.paste(grad((L,L), (127,29,29), (40,8,8)), (0,0), circle_mask((L,L)))
d = ImageDraw.Draw(im)
d.ellipse([20,20,L-21,L-21], outline=(245,190,60), width=56)
for i in range(24):  # film sprockets along the gold band
    a = math.radians(i*15); cx, cy = L/2 + 464*math.cos(a), L/2 + 464*math.sin(a)
    d.rounded_rectangle([cx-12, cy-12, cx+12, cy+12], 4, fill=(60,12,12))
d.ellipse([L/2-118, 150, L/2+118, 386], fill=(245,190,60))
d.polygon([(L/2-38, 212), (L/2-38, 324), (L/2+62, 268)], fill=(127,29,29))
text_fit(d, L/2, 410, "BAZAAR", B, 180, (253,230,138), 700)
text_fit(d, L/2, 600, "CINEMA", B, 190, (255,255,255), 640)
text_fit(d, L/2, 812, "CLASSIC FILMS", BD, 48, (253,230,138), 420)
save_big(im, "bazaar-cinema")

# 7 Bazaar Music, 000 (calm music; was Sur Sukoon until 1.9.41): indigo to teal disc, sound waves round a glowing dot
im = Image.new("RGBA", (L,L), (0,0,0,0)); im.paste(grad((L,L), (49,46,129), (15,118,110)), (0,0), circle_mask((L,L)))
d = ImageDraw.Draw(im)
cx, cy = L/2, 300
d.ellipse([cx-66, cy-66, cx+66, cy+66], fill=(253,224,71))
for r, w, a in ((120, 20, 255), (185, 18, 190), (250, 16, 120)):  # sound spreading out both ways
    d.arc([cx-r, cy-r, cx+r, cy+r], 140, 220, fill=(255,255,255,a), width=w)
    d.arc([cx-r, cy-r, cx+r, cy+r], -40, 40, fill=(255,255,255,a), width=w)
text_fit(d, L/2, 470, "BAZAAR", B, 250, (255,255,255), 640)
text_fit(d, L/2, 680, "MUSIC", B, 190, (153,246,228), 560)
save_big(im, "bazaar-music")

# 8 Bazaar Hits, 0000 (film songs; was Geet Bahar until 1.9.41): pink to orange rounded square, a flower of petals with a note inside
im = Image.new("RGBA", (L,L), (0,0,0,0)); im.paste(grad((L,L), (219,39,119), (249,115,22)), (0,0), rounded_mask((L,L), 220))
d = ImageDraw.Draw(im)
cx, cy = L/2, 300
for i in range(8):
    a = math.radians(i*45); px, py = cx + 112*math.cos(a), cy + 112*math.sin(a)
    d.ellipse([px-78, py-78, px+78, py+78], fill=(253,224,71))
d.ellipse([cx-104, cy-104, cx+104, cy+104], fill=(255,255,255))
d.ellipse([cx-58, cy+6, cx-6, cy+48], fill=(219,39,119)); d.ellipse([cx+10, cy-14, cx+62, cy+28], fill=(219,39,119))
d.rectangle([cx-17, cy-66, cx-5, cy+30], fill=(219,39,119)); d.rectangle([cx+50, cy-86, cx+62, cy+10], fill=(219,39,119))
d.polygon([(cx-17, cy-66), (cx+62, cy-86), (cx+62, cy-58), (cx-17, cy-38)], fill=(219,39,119))
text_fit(d, L/2, 500, "BAZAAR", B, 210, (255,255,255), 700)
text_fit(d, L/2, 710, "HITS", B, 200, (255,247,237), 600)
save_big(im, "bazaar-hits")

# 9 Bazaar Kids, 00000 (cartoons, 1.9.41): green to sky-blue rounded square, a smiling sun with rays
im = Image.new("RGBA", (L,L), (0,0,0,0)); im.paste(grad((L,L), (34,197,94), (14,165,233)), (0,0), rounded_mask((L,L), 220))
d = ImageDraw.Draw(im)
cx, cy = L/2, 290
for i in range(12):  # rays
    a = math.radians(i*30); d.line([(cx + 120*math.cos(a), cy + 120*math.sin(a)), (cx + 185*math.cos(a), cy + 185*math.sin(a))], fill=(253,224,71), width=26)
d.ellipse([cx-110, cy-110, cx+110, cy+110], fill=(253,224,71))
d.ellipse([cx-50, cy-40, cx-22, cy-8], fill=(30,41,59)); d.ellipse([cx+22, cy-40, cx+50, cy-8], fill=(30,41,59))
d.arc([cx-62, cy-30, cx+62, cy+68], 20, 160, fill=(30,41,59), width=16)
text_fit(d, L/2, 500, "BAZAAR", B, 210, (255,255,255), 700)
text_fit(d, L/2, 710, "KIDS", B, 210, (254,249,195), 600)
save_big(im, "bazaar-kids")
