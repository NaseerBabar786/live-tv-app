#!/usr/bin/env python3
""""Aaj ka Sher" clips for Spark Shayari (channel 17, owner 2026-10-08): one sher by a classic poet whose
work is free to use, in Nastaliq calligraphy with the Hindi (Devanagari) line under it, read aloud twice
by a free AI voice over calm library music (credited on screen). The channel plays one every hour,
between programmes (docs/channel/schedule.js ownClips, ytorder.js withBreaks).

    python3 tools/shayari/make_sher_videos.py OUT_DIR [--only N] [--silent]

Writes OUT_DIR/shayari-sher-NN.mp4 (1280x720, under 60 s) and OUT_DIR/shayari-clips.json. The voice is
Microsoft Edge's free neural voice (edge-tts, hi-IN-SwaraNeural reading the Devanagari text: Uzma's Urdu
voice mispronounced words, the news thread found), so it only runs where edge-tts can connect (GitHub
Actions); --silent makes the pictures with a quiet track instead, to check the look anywhere.
Needs ffmpeg, numpy, Pillow (with raqm) and, online, edge-tts.
"""
import argparse, asyncio, hashlib, json, os, subprocess, sys, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(HERE, "..", "music"))
import library as music  # noqa: E402

URDU = os.path.join(HERE, "..", "stories", "fonts", "NotoNastaliqUrdu-700.ttf")
DEVA = os.path.join(HERE, "fonts", "noto-sans-devanagari-devanagari-600-normal.woff")
LOGO = os.path.join(ROOT, "docs", "channel", "logos", "spark-shayari-urdu.png")
VOICE, RATE = "hi-IN-SwaraNeural", "-12%"
W, H, FPS, SR = 1280, 720, 25, 44100
REL = "https://github.com/NaseerBabar786/live-tv-app/releases/download/channel-media/"
GOLD, CREAM = (232, 190, 110), (250, 244, 232)
# One colour pair per clip, in turn: deep night colours, so the gold and white writing reads well.
SKIES = [((14, 16, 38), (70, 22, 60)), ((10, 30, 40), (24, 70, 80)), ((30, 14, 30), (92, 40, 30)),
         ((16, 18, 30), (40, 50, 96)), ((12, 28, 22), (60, 70, 30))]


def run(*cmd):
    subprocess.run(cmd, check=True)


def font(path, size):
    return ImageFont.truetype(path, size)


def fitted(text, path, size, width, **kw):
    """The biggest font up to [size] that fits [text] in [width]."""
    d = ImageDraw.Draw(Image.new("L", (8, 8)))
    while size > 18:
        f = font(path, size)
        if d.textlength(text, font=f, **kw) <= width:
            return f
        size -= 2
    return font(path, size)


def layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def glow_text(img, xy, text, f, fill, **kw):
    """Text with a soft dark shadow under it, so it stays clear on any part of the background."""
    sh = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh).text((xy[0] + 3, xy[1] + 4), text, font=f, fill=200, anchor="mm", **kw)
    img.alpha_composite(Image.merge("RGBA", [Image.new("L", (W, H), 0)] * 3 + [sh.filter(ImageFilter.GaussianBlur(6))]))
    ImageDraw.Draw(img).text(xy, text, font=f, fill=fill + (255,), anchor="mm", **kw)


def background(k):
    """Night sky with a soft glow and a thin gold frame: the picture behind the writing."""
    top, low = SKIES[k % len(SKIES)]
    y = np.linspace(0, 1, H)[:, None, None]
    sky = np.array(top)[None, None] * (1 - y) + np.array(low)[None, None] * y
    xs, ys = np.meshgrid(np.linspace(-1, 1, W), np.linspace(-1, 1, H))
    glow = np.exp(-((xs * 1.1) ** 2 + ((ys + 0.15) * 1.6) ** 2))[..., None]
    img = np.clip(sky + glow * 38, 0, 255).astype(np.uint8)
    bg = Image.fromarray(img).convert("RGBA")
    # A few faint stars.
    rnd = np.random.default_rng(k + 7)
    d = ImageDraw.Draw(bg)
    for _ in range(90):
        x, yy, r = rnd.integers(0, W), rnd.integers(0, int(H * 0.5)), rnd.choice([1, 1, 1, 2])
        d.ellipse([x - r, yy - r, x + r, yy + r], fill=(255, 245, 220, int(rnd.integers(60, 160))))
    return bg


def head_layer(poets_credit):
    """Always on: the heading, our Urdu logo and the music credit."""
    im = layer()
    glow_text(im, (W // 2, 92), "آج کا شعر", font(URDU, 46), GOLD, direction="rtl", language="ur")
    glow_text(im, (W // 2, 166), "आज का शेर", font(DEVA, 24), GOLD)
    d = ImageDraw.Draw(im)
    # A thin gold frame that stays still while the sky behind it drifts.
    d.rounded_rectangle([28, 28, W - 29, H - 29], 18, outline=GOLD + (150,), width=2)
    d.rounded_rectangle([38, 38, W - 39, H - 39], 14, outline=GOLD + (60,), width=1)
    d.line([(W // 2 - 170, 194), (W // 2 + 170, 194)], fill=GOLD + (170,), width=2)
    if os.path.exists(LOGO):
        lg = Image.open(LOGO).convert("RGBA")
        lg = lg.resize((int(lg.width * 54 / lg.height), 54), Image.LANCZOS)
        im.alpha_composite(lg, (W - lg.width - 58, 52))
    small = latin(15)
    d.text((W // 2, H - 44), poets_credit, font=small, fill=(220, 210, 190, 200), anchor="mm")
    return im


def latin(size):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
              "/usr/share/fonts/opentype/inter/Inter-Bold.otf"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def line_layer(ur, hi, y):
    """One misra: Nastaliq big, its Devanagari under it."""
    im = layer()
    glow_text(im, (W // 2, y), ur, fitted(ur, URDU, 54, W - 220, direction="rtl", language="ur"), CREAM, direction="rtl", language="ur")
    hi = hi.replace(",", "")  # (the Devanagari font has no comma; the voice still pauses on it)
    glow_text(im, (W // 2, y + 92), hi, fitted(hi, DEVA, 28, W - 240), GOLD)
    return im


def poet_layer(p):
    im = layer()
    glow_text(im, (W // 2, 592), p["ur"], font(URDU, 32), GOLD, direction="rtl", language="ur")
    glow_text(im, (W // 2, 636), p["hi"], font(DEVA, 22), GOLD)
    return im


async def _say(text, path):
    import edge_tts
    await edge_tts.Communicate(text, VOICE, rate=RATE).save(path)


def speech(text, work, name, silent):
    """Mono float32 at SR: the voice reading [text] (or a quiet stand-in of about the same length)."""
    if silent:
        return np.zeros(int(SR * max(1.5, len(text) * 0.085)), np.float32)
    mp3, wav = os.path.join(work, name + ".mp3"), os.path.join(work, name + ".wav")
    for attempt in range(3):
        try:
            asyncio.run(_say(text, mp3))
            break
        except Exception:  # noqa: BLE001
            if attempt == 2:
                raise
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", mp3, "-ac", "1", "-ar", str(SR), wav)
    with wave.open(wav) as w:
        return np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768


def make(s, poets, k, out, silent):
    p = poets[s["poet"]]
    work = tempfile.mkdtemp()
    l1, l2 = speech(s["hi"][0], work, "l1", silent), speech(s["hi"][1], work, "l2", silent)
    name = speech(p["hi"], work, "poet", silent)
    gap = lambda secs: np.zeros(int(SR * secs), np.float32)  # noqa: E731
    # Heading, line 1, line 2, both again, the poet's name; the writing appears as each line is read.
    parts = [gap(2.0), l1, gap(0.9), l2, gap(1.6), l1, gap(0.7), l2, gap(1.0), name, gap(2.2)]
    starts, t = [], 0.0
    for x in parts:
        starts.append(t)
        t += len(x) / SR
    voice = np.concatenate(parts)
    secs = len(voice) / SR
    if secs > 58:  # the clip stays under a minute
        raise SystemExit(f"sher {s['n']} is {secs:.0f} s: too long")
    bed = music.bed("calm", secs, fade_in=1.5, fade_out=2.5).mean(1)[: len(voice)]
    mix = voice * 0.95 + bed[: len(voice)] * 0.16
    mix = np.clip(mix / max(1.0, np.abs(mix).max() / 0.95), -1, 1)
    wav = os.path.join(work, "mix.wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype("<i2").tobytes())
    files = {"bg": background(k), "head": head_layer(music.credit("calm")),
             "a": line_layer(s["ur"][0], s["hi"][0], 262), "b": line_layer(s["ur"][1], s["hi"][1], 440), "p": poet_layer(p)}
    for key, im in files.items():
        im.save(os.path.join(work, key + ".png"))
    t_a, t_b, t_p = starts[1], starts[3], starts[9]
    frames = int(secs * FPS) + 1
    fade = lambda i, at: f"[{i}:v]format=rgba,fade=t=in:st={at:.2f}:d=0.8:alpha=1[l{i}]"  # noqa: E731
    graph = ";".join([
        # The background drifts in slowly the whole time (never a still picture).
        f"[0:v]scale={W * 1.12:.0f}:{H * 1.12:.0f},zoompan=z='min(1.0+on*0.00035,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}[bg]",
        "[1:v]format=rgba,fade=t=in:st=0.2:d=1.0:alpha=1[l1]",
        fade(2, t_a), fade(3, t_b), fade(4, t_p),
        "[bg][l1]overlay=0:0[v1]", "[v1][l2]overlay=0:0[v2]", "[v2][l3]overlay=0:0[v3]",
        f"[v3][l4]overlay=0:0,fade=t=out:st={secs - 0.8:.2f}:d=0.8,format=yuv420p[v]",
    ])
    mp4 = os.path.join(out, f"shayari-sher-{s['n']:02d}.mp4")
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y",
        "-loop", "1", "-framerate", str(FPS), "-i", os.path.join(work, "bg.png"),
        *sum([["-loop", "1", "-framerate", str(FPS), "-i", os.path.join(work, f + ".png")] for f in ("head", "a", "b", "p")], []),
        "-i", wav, "-filter_complex", graph, "-map", "[v]", "-map", "5:a", "-t", f"{secs:.2f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-r", str(FPS), "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", mp4)
    return {"n": s["n"], "src": REL + os.path.basename(mp4), "secs": int(np.ceil(secs)),
            "title": f"Aaj ka Sher · {p['en']}", "poet": p["en"]}


def source_hash():
    h = hashlib.sha256()
    for f in (os.path.join(HERE, "shers.json"), os.path.abspath(__file__), os.path.join(HERE, "..", "music", "library.py")):
        h.update(open(f, "rb").read())
    return h.hexdigest()[:16]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--only", type=int)
    ap.add_argument("--silent", action="store_true")
    ap.add_argument("--hash", action="store_true")
    a = ap.parse_args()
    if a.hash:
        return print(source_hash())
    data = json.load(open(os.path.join(HERE, "shers.json"), encoding="utf-8"))
    os.makedirs(a.out, exist_ok=True)
    clips = []
    for k, s in enumerate(data["shers"]):
        if a.only and s["n"] != a.only:
            continue
        clips.append(make(s, data["poets"], k, a.out, a.silent))
        print(f"sher {s['n']:2}: {clips[-1]['secs']} s, {clips[-1]['poet']}", flush=True)
    json.dump({"source": source_hash(), "clips": clips}, open(os.path.join(a.out, "shayari-clips.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
