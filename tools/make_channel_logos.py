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

# 6 Purani Filmein: sepia film reel badge, gold wordmark
im = Image.new("RGBA", (S,S), (0,0,0,0)); bg = grad((S,S), (120,53,15), (41,22,8)); im.paste(bg, (0,0), circle_mask((S,S)))
d = ImageDraw.Draw(im)
d.ellipse([18,18,S-19,S-19], outline=(234,179,8), width=10)
for i in range(12):  # sprocket holes around the edge, like a film reel
    a = math.radians(i*30); cx, cy = S/2 + 205*math.cos(a), S/2 + 205*math.sin(a)
    d.rounded_rectangle([cx-13, cy-13, cx+13, cy+13], 5, fill=(28,15,5))
d.polygon([(S/2-34, 104), (S/2-34, 176), (S/2+30, 140)], fill=(234,179,8))
center_text(d, S/2, 196, "PURANI", font(B, 92), (254,243,199)); center_text(d, S/2, 300, "FILMEIN", font(B, 78), (234,179,8))
center_text(d, S/2, 396, "CLASSICS", font(BD, 30), (254,243,199))
save(im, "purani-filmein")
