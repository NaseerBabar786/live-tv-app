#!/usr/bin/env python3
"""
Makes one "coming up" promo for a programme booked on Bazaar TV, like real channels run: fast cuts
of the programme's own pictures on the beat, its name and time slot, an announcer (Urdu by default)
and original music, then an end card with our logo. Every second has real video moving.

usage: make_promo.py spec.json out.mp4
spec: { "title": "Sintel", "when": "Every Friday · 8 PM", "day": "fri", "time": "20:00",
        "videos": ["https://…/ep1.mp4", …] (episodes: pictures come from the first few),
        "series": true/false, "credit": "Blender Foundation (CC BY)", "mood": "cinematic"|"energetic",
        "secs": 20 or 30, "lang": "ur"|"en", "logo": "docs/channel/logos/bazaar-tv.png" }

Needs ffmpeg/ffprobe, numpy, pillow; edge-tts for the announcer (left out when it can't be reached).
"""
import json, os, re, subprocess, sys, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
W, H, FPS = 1280, 720, 30
FONT = lambda w, size: ImageFont.truetype(os.path.join(HERE, "fonts", f"InterDisplay-{w}.otf"), size)
YELLOW = (250, 204, 21)


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def duration(url):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", url],
                         capture_output=True, text=True, timeout=120).stdout.strip()
    return float(out or 0)


CROPS = {}


def black_bars(url, d):
    """ffmpeg's crop for the black bars a film has baked in (e.g. "crop=1920:816:0:132"), or ""."""
    if url not in CROPS:
        found = {}
        for t in (d * 0.3, d * 0.5, d * 0.7):
            p = subprocess.run(["ffmpeg", "-v", "info", "-ss", f"{t:.1f}", "-i", url, "-t", "1.5", "-an",
                                "-vf", "cropdetect=limit=24:round=2", "-f", "null", "-"], capture_output=True, text=True, timeout=180)
            for m in re.findall(r"crop=(\d+:\d+:\d+:\d+)", p.stderr)[-3:]:
                found[m] = found.get(m, 0) + 1
        best = max(found, key=found.get) if found else ""
        # Only real bars (at least 4% gone), not a dark scene.
        if best:
            cw, ch = (int(x) for x in best.split(":")[:2])
            full = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                   "-of", "csv=p=0", url], capture_output=True, text=True, timeout=60).stdout.strip().split(",")
            fw, fh = (int(x) for x in full[:2]) if len(full) >= 2 and full[0] else (cw, ch)
            if ch > fh * 0.96 and cw > fw * 0.96:
                best = ""
        CROPS[url] = f"crop={best}," if best else ""
    return CROPS[url]


def frames(url, start, secs, w=W, h=H):
    """Raw RGB frames of [secs] from [start], filled to w×h (black bars cut off first)."""
    vf = f"{CROPS.get(url, '')}scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={FPS}"
    p = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{start:.2f}", "-i", url, "-t", f"{secs:.3f}", "-an",
                        "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, timeout=300)
    a = np.frombuffer(p.stdout, np.uint8)
    n = len(a) // (w * h * 3)
    return a[: n * w * h * 3].reshape(n, h, w, 3)


def score(url, t):
    """How good a moment looks: bright enough, with detail (not a black or plain frame)."""
    f = frames(url, t, 0.05, 64, 36)
    if not len(f):
        return -1
    g = f[0].astype(float).mean(2)
    return (min(g.mean(), 140) / 140) * min(g.std() / 50, 1.5)


def pick_moments(videos, count):
    """[count] (url, start) moments spread through the programme, the best-looking in each part."""
    srcs = [(u, duration(u)) for u in videos[:4]]
    srcs = [(u, d) for u, d in srcs if d > 20]
    if not srcs:
        raise RuntimeError("couldn't open the programme's video: " + ", ".join(videos[:4]))
    for u, d in srcs:
        black_bars(u, d)
    out = []
    for i in range(count):
        u, d = srcs[i % len(srcs)]
        part = i // len(srcs)
        parts = (count + len(srcs) - 1) // len(srcs)
        lo = d * (0.07 + 0.83 * part / parts)
        hi = d * (0.07 + 0.83 * (part + 1) / parts) - 3
        tries = [lo + (hi - lo) * k / 3 for k in range(3)]
        best = max(tries, key=lambda t: score(u, t))
        out.append((u, best))
    return out


def clean_title(t):
    """"Sintel (fantasy short)" -> "Sintel"; "Trailer: X" stays."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", t).strip() or t


# ---------- drawing ----------
def text_layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def shadow_text(d, xy, text, font, fill=(255, 255, 255, 255), anchor="la", shadow=6):
    x, y = xy
    for r in (shadow, shadow // 2):
        d.text((x + 2, y + 3), text, font=font, fill=(0, 0, 0, 90), anchor=anchor)
    d.text((x, y), text, font=font, fill=fill, anchor=anchor)


def ease(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def wrap(text, font, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if font.getlength(trial) <= width or not cur:
            cur = trial
        else:
            lines.append(cur); cur = w
    lines.append(cur)
    return lines[:2] if len(lines) <= 2 else [lines[0], " ".join(lines[1:])[:40] + "…"]


def fit_font(text, weight, size, width, lines=2):
    while size > 30:
        f = FONT(weight, size)
        if len(wrap(text, f, width)) <= lines and all(f.getlength(l) <= width for l in wrap(text, f, width)):
            return f
        size -= 4
    return FONT(weight, 30)


def overlay_main(t, spec, cut_start):
    """Words over the fast cuts: COMING UP, then the name and the time slot."""
    L = text_layer()
    d = ImageDraw.Draw(L)
    title, when = spec["_title"], spec["when"]
    # Beat flash on each cut.
    since_cut = t - cut_start
    if since_cut < 2 / FPS and t > 0.1:
        d.rectangle((0, 0, W, H), fill=(255, 255, 255, 70))
    # COMING UP (0 - 1.6 s), slammed in.
    if t < 1.6:
        k = ease(t / 0.25)
        a = int(255 * (1 if t < 1.3 else max(0, (1.6 - t) / 0.3)))
        size = int(118 * (1.25 - 0.25 * k))
        f = FONT("Black", size)
        shadow_text(d, (W // 2, H // 2 - 30), "COMING UP", f, (255, 255, 255, a), "mm")
        f2 = FONT("Bold", 40)
        shadow_text(d, (W // 2, H // 2 + 52), "ON BAZAAR TV", f2, YELLOW + (a,), "mm")
    # Name, sliding in from the left (from 3.5 s).
    if t >= 3.5:
        k = ease((t - 3.5) / 0.45)
        x = int(-700 + (700 + 64) * k)
        f = fit_font(title.upper(), "Black", 76, W - 200)
        lines = wrap(title.upper(), f, W - 200)
        lh = int(f.size * 1.02)
        y0 = H - 80 - lh * len(lines)
        # Dark wash under the words so they read on any picture.
        grad = Image.new("L", (1, 260), 0)
        for i in range(260):
            grad.putpixel((0, i), int(170 * (i / 259) ** 1.6))
        L.alpha_composite(Image.merge("RGBA", [Image.new("L", (W, 260), 0)] * 3 + [grad.resize((W, 260))]), (0, H - 260))
        d = ImageDraw.Draw(L)
        d.rectangle((x - 22, y0 + 8, x - 12, y0 + lh * len(lines) - 6), fill=YELLOW + (255,))
        for i, line in enumerate(lines):
            shadow_text(d, (x, y0 + i * lh), line, f)
        # The time slot, above the name (from 7.5 s).
        if t >= 7.5:
            k2 = ease((t - 7.5) / 0.35)
            fw = FONT("Black", 34)
            label = when.upper()
            tw = int(fw.getlength(label))
            px = int(-tw - 80 + (tw + 80 + 64) * k2)
            py = y0 - 66
            d.rounded_rectangle((px - 16, py - 6, px + tw + 16, py + 46), 10, fill=YELLOW + (255,))
            d.text((px, py), label, font=fw, fill=(17, 17, 17, 255))
            if spec.get("series") and t >= 9.5:
                fs = FONT("Bold", 26)
                shadow_text(d, (px + tw + 34, py + 8), "A NEW EPISODE EVERY WEEK" if spec.get("day") not in ("all", "weekdays", "weekend") else "A NEW EPISODE EVERY TIME", fs, (255, 255, 255, int(255 * ease((t - 9.5) / 0.3))))
        # Channel line under the name (from 11 s).
        if t >= 11:
            fs = FONT("SemiBold", 26)
            shadow_text(d, (64, H - 64), "Channel 1  ·  Bazaar TV  ·  free on the Cable TV app", fs,
                        (255, 255, 255, int(230 * ease((t - 11) / 0.4))))
    return L


def end_card(t, spec, logo):
    """The last 6 s: our logo, the name, the time slot and how to watch, over the programme moving softly."""
    L = text_layer()
    d = ImageDraw.Draw(L)
    k = ease(t / 0.5)
    lw = int(330 * (0.85 + 0.15 * k))
    lg = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    a = np.array(lg)
    a[..., 3] = (a[..., 3] * k).astype(np.uint8)
    L.alpha_composite(Image.fromarray(a), ((W - lw) // 2, 70 + int(20 * (1 - k))))
    title = spec["_title"]
    f = fit_font(title, "Black", 72, W - 160)
    lines = wrap(title, f, W - 160)
    y = 70 + lg.height + 40
    k2 = ease((t - 0.3) / 0.5)
    for line in lines:
        shadow_text(d, (W // 2, y + int(30 * (1 - k2))), line, f, (255, 255, 255, int(255 * k2)), "ma")
        y += int(f.size * 1.05)
    k3 = ease((t - 0.7) / 0.4)
    fw = FONT("Black", 44)
    shadow_text(d, (W // 2, y + 18), spec["when"].upper(), fw, YELLOW + (int(255 * k3),), "ma")
    k4 = ease((t - 1.2) / 0.4)
    fs = FONT("SemiBold", 30)
    shadow_text(d, (W // 2, y + 90), "Channel 1 on the free Cable TV app  ·  tv.bulkbazaar.ca", fs, (255, 255, 255, int(235 * k4)), "ma")
    if spec.get("credit"):
        fc = FONT("SemiBold", 18)
        d.text((W // 2, H - 34), spec["credit"], font=fc, fill=(220, 220, 220, int(200 * k4)), anchor="ma")
    return L


# ---------- sound ----------
UR_DAYS = {"mon": "ہر پیر", "tue": "ہر منگل", "wed": "ہر بدھ", "thu": "ہر جمعرات", "fri": "ہر جمعہ", "sat": "ہر ہفتے",
           "sun": "ہر اتوار", "all": "روزانہ", "weekdays": "پیر سے جمعہ", "weekend": "ہفتہ اور اتوار"}


def urdu_time(hhmm):
    h, m = (int(x) for x in hhmm.split(":"))
    part = "صبح" if 4 <= h < 12 else "دوپہر" if h < 16 else "شام" if h < 19 else "رات"
    h12 = h % 12 or 12
    if m == 0:
        return f"{part} {h12} بجے"
    if m == 30:
        return f"{part} ساڑھے {h12} بجے"
    return f"{part} {h12} بج کر {m} منٹ پر"


def lines_for(spec):
    """What the announcer says: [(start seconds, text)]."""
    title, end = spec["_title"], spec["secs"] - 6
    if spec.get("lang", "ur") == "en":
        return [(3.6, f"{title}. {spec['when']}."), (end + 0.5, "Only on Bazaar TV, channel one. Free on the Cable TV app.")]
    when = f"{UR_DAYS.get(spec.get('day'), '')}، {urdu_time(spec.get('time', '20:00'))}"
    first = f"دیکھیے {title}۔ {when}۔" + (" ہر بار ایک نئی قسط۔" if spec.get("series") else "")
    return [(3.6, first), (end + 0.5, "صرف بازار ٹی وی پر، کیبل ٹی وی ایپ میں، بالکل مفت۔")]


def voice(text, path, lang):
    v = "en-US-AndrewMultilingualNeural" if lang == "en" else "ur-PK-AsadNeural"
    run([sys.executable, "-m", "edge_tts", "--voice", v, "--rate", "+4%", "--text", text, "--write-media", path],
        capture_output=True, timeout=120)
    wav = path + ".wav"
    run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ar", "44100", "-ac", "2", wav])
    return wav


def read_wav(p):
    with wave.open(p) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32768
        return a.reshape(-1, w.getnchannels())


def soundtrack(spec, hits, tmp):
    secs = spec["secs"]
    music = os.path.join(tmp, "music.wav")
    if spec.get("mood") == "energetic":
        cfg = os.path.join(tmp, "m.json")
        bars = int(secs / 2)
        json.dump({"bpm": 120, "nbars": bars, "dur": float(secs), "seed": 23,
                   "prog": [[57, [69, 72, 76]], [53, [69, 72, 77]], [48, [67, 72, 76]], [55, [67, 71, 74]]],
                   "intro": 1, "intro_kick": 0, "full": [[1, bars - 3]], "fill": [bars - 4], "final": bars - 3,
                   "drops": [1], "arp": [[1, bars - 3]], "risers": [[bars - 4, 1]], "cuts": [], "stamps": [[0, 0.7], [1.75, 0.5]], "blips": []},
                  open(cfg, "w"))
        run([sys.executable, os.path.join(HERE, "music_gen.py"), music, cfg], capture_output=True)
    else:
        hj = os.path.join(tmp, "hits.json")
        json.dump(hits, open(hj, "w"))
        run([sys.executable, os.path.join(HERE, "cinematic.py"), music, str(secs), hj], capture_output=True)
    mix = read_wav(music)[: int(secs * 44100)]
    vo = np.zeros_like(mix)
    said = False
    for i, (at, text) in enumerate(lines_for(spec)):
        try:
            v = read_wav(voice(text, os.path.join(tmp, f"vo{i}.mp3"), spec.get("lang", "ur")))
        except Exception as e:  # no internet for the voice: music only
            print("voice skipped:", e, file=sys.stderr)
            continue
        j = int(at * 44100)
        v = v[: max(0, len(vo) - j)]
        vo[j:j + len(v)] += v
        said = True
    if said:
        # Music dips under the announcer.
        envl = np.abs(vo).max(1)
        k = 4410
        envl = np.convolve(envl, np.ones(k) / k, "same")
        duck = 1 - 0.6 * np.clip(envl / (envl.max() + 1e-9) * 4, 0, 1)
        mix = mix * duck[:, None] * 0.8 + vo * 1.6
    mix /= max(np.abs(mix).max(), 1e-9) / 0.95
    out = os.path.join(tmp, "sound.wav")
    with wave.open(out, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100)
        w.writeframes((mix * 32767).astype("<i2").tobytes())
    return out, said


# ---------- the promo ----------
CUTS = {20: [1.5, 1, 1, 1.5, 1, 1, 2, 1, 1, 1, 2],
        30: [1.5, 1, 1, 1.5, 1, 1, 2, 1, 1, 1, 2, 1.5, 1, 1, 1.5, 1, 1, 2, 1, 1]}


def make(spec, out):
    spec = dict(spec)
    spec["secs"] = 30 if spec.get("secs", 20) > 25 else 20
    spec["_title"] = clean_title(spec.get("show") or spec["title"])
    cuts = CUTS[spec["secs"]]
    end = spec["secs"] - 6
    moments = pick_moments(spec["videos"], len(cuts) + 1)
    hits, t = [], 0.0
    for c in cuts:
        hits.append(t); t += c
    logo = Image.open(os.path.join(ROOT, spec.get("logo") or "docs/channel/logos/bazaar-tv.png")).convert("RGBA")
    with tempfile.TemporaryDirectory() as tmp:
        sound, said = soundtrack(spec, hits, tmp)
        silent = os.path.join(tmp, "v.mp4")
        enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                                "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                                "-pix_fmt", "yuv420p", silent], stdin=subprocess.PIPE)
        frame_no = 0
        empty = 0
        for i, c in enumerate(cuts):
            u, start = moments[i]
            n = int(round(c * FPS))
            # A little larger than the screen, so each cut drifts slowly (a camera push).
            big = frames(u, start, c + 0.2, int(W * 1.06) // 2 * 2, int(H * 1.06) // 2 * 2)
            if not len(big):
                empty += 1
                if empty > len(cuts) // 3:
                    enc.kill()
                    raise RuntimeError("too many parts of the video couldn't be read")
                big = np.zeros((1, int(H * 1.06) // 2 * 2, int(W * 1.06) // 2 * 2, 3), np.uint8)
            dx, dy = big.shape[2] - W, big.shape[1] - H
            for f in range(n):
                src = big[min(f, len(big) - 1)]
                k = f / max(1, n - 1)
                ox, oy = int(dx * (k if i % 2 else 1 - k)), int(dy / 2)
                img = Image.fromarray(np.ascontiguousarray(src[oy:oy + H, ox:ox + W])).convert("RGBA")
                tt = frame_no / FPS
                img.alpha_composite(overlay_main(tt, spec, hits[i]))
                enc.stdin.write(img.convert("RGB").tobytes())
                frame_no += 1
        # End card over the programme, softened and dimmed.
        u, start = moments[-1]
        n = int(round(6 * FPS))
        bg = frames(u, start, 6.2, W // 2, H // 2)
        for f in range(n):
            src = bg[min(f, len(bg) - 1)] if len(bg) else np.zeros((H // 2, W // 2, 3), np.uint8)
            img = Image.fromarray(src).filter(ImageFilter.GaussianBlur(3)).resize((W, H), Image.BILINEAR)
            img = Image.blend(img, Image.new("RGB", (W, H), (8, 10, 24)), 0.55).convert("RGBA")
            img.alpha_composite(end_card(f / FPS, spec, logo))
            enc.stdin.write(img.convert("RGB").tobytes())
        enc.stdin.close()
        enc.wait()
        run(["ffmpeg", "-v", "error", "-y", "-i", silent, "-i", sound, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
             "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-ar", "44100", "-shortest", "-movflags", "+faststart", out])
    return {"secs": spec["secs"], "voice": said}


if __name__ == "__main__":
    print(json.dumps(make(json.load(open(sys.argv[1])), sys.argv[2])))
