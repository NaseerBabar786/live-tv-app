#!/usr/bin/env python3
"""
Makes one "coming up" promo for a programme booked on Spark TV, like real channels run: fast cuts
of the programme's own pictures on the beat, its name and time slot, an announcer (Urdu by default)
and free-licence music (tools/music/library.py), then an end card with our logo. Every second has real video moving.

usage: make_promo.py spec.json out.mp4
spec: { "title": "Sintel", "when": "Every Friday · 8 PM", "day": "fri", "time": "20:00",
        "videos": ["https://…/ep1.mp4", …] (episodes: pictures come from the first few),
        "series": true/false, "credit": "Blender Foundation (CC BY)", "mood": "cinematic"|"energetic" (both use tools/music/library.py),
        "secs": 20 or 30, "lang": "ur"|"en", "logo": "docs/channel/logos/spark-tv.png" }

Needs ffmpeg/ffprobe, numpy, pillow; edge-tts for the announcer (left out when it can't be reached).
"""
import json, os, re, subprocess, sys, tempfile, time, urllib.parse, urllib.request, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "music"))
import library as music_lib  # noqa: E402
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
# Full HD (owner, 2026-10-07: the 720p promos looked soft on a big TV). The layout was drawn for
# 1280×720; px() scales those numbers.
W, H, FPS = 1920, 1080, 30
px = lambda n: int(round(n * W / 1280))
FONT = lambda w, size: ImageFont.truetype(os.path.join(HERE, "fonts", f"InterDisplay-{w}.otf"), px(size))
YELLOW = (250, 204, 21)


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def duration(url, tries=3):
    for i in range(tries):
        d = _duration(url)
        if d > 0:
            return d
        time.sleep(3 * (i + 1)) if i < tries - 1 else None
    return 0.0


def _duration(url):
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", url],
                             capture_output=True, text=True, timeout=120).stdout.strip()
        return float(out or 0)
    except (subprocess.TimeoutExpired, ValueError):
        return 0.0


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


SIZES = {}


def size_of(url):
    """The picture's (width, height) once its black bars are cut off."""
    if url not in SIZES:
        c = re.match(r"crop=(\d+):(\d+)", CROPS.get(url, ""))
        if c:
            SIZES[url] = (int(c[1]), int(c[2]))
        else:
            out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                  "-of", "csv=p=0", url], capture_output=True, text=True, timeout=60).stdout.strip().split(",")
            SIZES[url] = (int(out[0]), int(out[1])) if len(out) >= 2 and out[0].isdigit() else (W, H)
    return SIZES[url]


def frames(url, start, secs, w=W, h=H):
    """Raw RGB frames of [secs] from [start], filled to w×h (black bars cut off first).
    An old, small picture (a 1930s cartoon at 480×360) is cleaned and sharpened instead of blown up
    as it is; a square one stays whole in the middle over a soft copy of itself, as channels show old
    films, rather than being cut and zoomed to fill the screen."""
    sw, sh = size_of(url)
    small = sh < 600 and w >= 640
    clean = "hqdn3d=4:3:6:5," if small else ""
    sharp = ",unsharp=5:5:0.7:5:5:0" if small else ""
    if small and sw / sh < 1.5:
        fh = h
        fw = int(h * sw / sh) // 2 * 2
        vf = (f"{CROPS.get(url, '')}{clean}split[a][b];"
              f"[a]scale={w // 8}:{h // 8}:force_original_aspect_ratio=increase,crop={w // 8}:{h // 8},boxblur=4:2,"
              f"scale={w}:{h},eq=brightness=-0.12:saturation=0.8[bg];"
              f"[b]scale={fw}:{fh}:flags=lanczos{sharp}[fg];[bg][fg]overlay=(W-w)/2:0,fps={FPS}")
    else:
        vf = f"{CROPS.get(url, '')}{clean}scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h}{sharp},fps={FPS}"
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


# The Blender Foundation's own full-quality copies of the open films; our channel-media copies are
# small 720p ones made for streaming, too soft for a promo on a big TV.
MASTERS = {"sintel": "https://download.blender.org/durian/movies/Sintel.2010.1080p.mkv",
           "tears": "https://download.blender.org/demo/movies/ToS/tears_of_steel_1080p.mov",
           "bunny": "https://download.blender.org/peach/bigbuckbunny_movies/big_buck_bunny_1080p_h264.mov"}


def archive_best(url):
    """For an archive.org file, the item's biggest video file (often the original scan, sharper than
    the small "512kb" copy we stream); [url] itself when there's nothing better."""
    m = re.match(r"https://archive\.org/download/([^/]+)/", url)
    if not m:
        return url
    try:
        meta = json.load(urllib.request.urlopen(f"https://archive.org/metadata/{m[1]}", timeout=30))
    except Exception as e:
        print("archive.org list not readable:", e, file=sys.stderr)
        return url
    vids = [f for f in meta.get("files", []) if re.search(r"\.(mp4|m4v|mov|mkv|mpe?g|avi|ogv)$", f.get("name", ""), re.I)]
    best = max(vids, key=lambda f: (int(f.get("height") or 0), int(f.get("size") or 0)), default=None)
    if not best:
        return url
    return f"https://archive.org/download/{m[1]}/" + urllib.parse.quote(best["name"])


def best_copy(url):
    """The sharpest copy of [url] we can open: the film maker's master when there is one."""
    better = archive_best(url)
    if better != url and duration(better) > 20:
        print("Using the bigger copy:", better, file=sys.stderr)
        return better
    name = url.rsplit("/", 1)[-1].lower()
    for key, master in MASTERS.items():
        # Not the dubbed copies (sintel-urdu.mp4): they carry our own voices.
        if name.startswith(key) and not re.search(r"-(urdu|hindi|ur|hi)\b", name) and duration(master) > 20:
            print("Using the master copy:", master, file=sys.stderr)
            return master
    return url


def pick_moments(videos, count):
    """[count] (url, start) moments spread through the programme, the best-looking in each part."""
    srcs = [(u, duration(u)) for u in (best_copy(v) for v in videos[:4])]
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
    """"Sintel (fantasy short)" -> "Sintel"; "Raja Harishchandra (1913), India's first …" -> "Raja Harishchandra"."""
    return re.split(r"\s+\(", t, 1)[0].strip(" ,") or t


# ---------- drawing ----------
def text_layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def shadow_text(d, xy, text, font, fill=(255, 255, 255, 255), anchor="la", shadow=6):
    x, y = xy
    for r in (shadow, shadow // 2):
        d.text((x + px(2), y + px(3)), text, font=font, fill=(0, 0, 0, 90), anchor=anchor)
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
        shadow_text(d, (W // 2, H // 2 - px(30)), "COMING UP", f, (255, 255, 255, a), "mm")
        f2 = FONT("Bold", 40)
        shadow_text(d, (W // 2, H // 2 + px(52)), "ON SPARK TV", f2, YELLOW + (a,), "mm")
    # Name, sliding in from the left (from 3.5 s).
    if t >= 3.5:
        k = ease((t - 3.5) / 0.45)
        x = px(-700 + (700 + 64) * k)
        f = fit_font(title.upper(), "Black", 76, W - px(200))
        lines = wrap(title.upper(), f, W - px(200))
        lh = int(f.size * 1.02)
        y0 = H - px(80) - lh * len(lines)
        # Dark wash under the words so they read on any picture.
        gh = px(260)
        grad = Image.new("L", (1, gh), 0)
        for i in range(gh):
            grad.putpixel((0, i), int(170 * (i / (gh - 1)) ** 1.6))
        L.alpha_composite(Image.merge("RGBA", [Image.new("L", (W, gh), 0)] * 3 + [grad.resize((W, gh))]), (0, H - gh))
        d = ImageDraw.Draw(L)
        d.rectangle((x - px(22), y0 + px(8), x - px(12), y0 + lh * len(lines) - px(6)), fill=YELLOW + (255,))
        for i, line in enumerate(lines):
            shadow_text(d, (x, y0 + i * lh), line, f)
        # The time slot, above the name (from 7.5 s).
        if t >= 7.5:
            k2 = ease((t - 7.5) / 0.35)
            fw = FONT("Black", 34)
            label = when.upper()
            tw = int(fw.getlength(label))
            bx = int(-tw - px(80) + (tw + px(80 + 64)) * k2)
            by = y0 - px(66)
            d.rounded_rectangle((bx - px(16), by - px(6), bx + tw + px(16), by + px(46)), px(10), fill=YELLOW + (255,))
            d.text((bx, by), label, font=fw, fill=(17, 17, 17, 255))
            if spec.get("series") and t >= 9.5:
                fs = FONT("Bold", 26)
                shadow_text(d, (bx + tw + px(34), by + px(8)), "A NEW EPISODE EVERY WEEK" if spec.get("day") not in ("all", "weekdays", "weekend") else "A NEW EPISODE EVERY TIME", fs, (255, 255, 255, int(255 * ease((t - 9.5) / 0.3))))
        # Channel line under the name (from 11 s).
        if t >= 11:
            fs = FONT("SemiBold", 26)
            shadow_text(d, (px(64), H - px(64)), "Channel 1  ·  Spark TV  ·  free on the Cable TV app", fs,
                        (255, 255, 255, int(230 * ease((t - 11) / 0.4))))
    return L


def end_card(t, spec, logo):
    """The last 6 s: our logo, the name, the time slot and how to watch, over the programme moving softly."""
    L = text_layer()
    d = ImageDraw.Draw(L)
    k = ease(t / 0.5)
    lw = px(330 * (0.85 + 0.15 * k))
    lg = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    a = np.array(lg)
    a[..., 3] = (a[..., 3] * k).astype(np.uint8)
    L.alpha_composite(Image.fromarray(a), ((W - lw) // 2, px(70 + 20 * (1 - k))))
    title = spec["_title"]
    f = fit_font(title, "Black", 72, W - px(160))
    lines = wrap(title, f, W - px(160))
    y = px(70) + lg.height + px(40)
    k2 = ease((t - 0.3) / 0.5)
    for line in lines:
        shadow_text(d, (W // 2, y + px(30 * (1 - k2))), line, f, (255, 255, 255, int(255 * k2)), "ma")
        y += int(f.size * 1.05)
    k3 = ease((t - 0.7) / 0.4)
    fw = FONT("Black", 44)
    shadow_text(d, (W // 2, y + px(18)), spec["when"].upper(), fw, YELLOW + (int(255 * k3),), "ma")
    k4 = ease((t - 1.2) / 0.4)
    fs = FONT("SemiBold", 30)
    shadow_text(d, (W // 2, y + px(90)), "Channel 1 on the free Cable TV app  ·  tv.bulkbazaar.ca", fs, (255, 255, 255, int(235 * k4)), "ma")
    line = "  ·  ".join(x for x in (spec.get("credit"), music_lib.credit("promo")) if x)
    fc = FONT("SemiBold", 18)
    d.text((W // 2, H - px(34)), line, font=fc, fill=(220, 220, 220, int(200 * k4)), anchor="ma")
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
        return [(3.6, f"{title}. {spec['when']}."), (end + 0.5, "Only on Spark TV, channel one. Free on the Cable TV app.")]
    when = f"{UR_DAYS.get(spec.get('day'), '')}، {urdu_time(spec.get('time', '20:00'))}"
    first = f"دیکھیے {title}۔ {when}۔" + (" ہر بار ایک نئی قسط۔" if spec.get("series") else "")
    return [(3.6, first), (end + 0.5, "صرف اسپارک ٹی وی پر، کیبل ٹی وی ایپ میں، بالکل مفت۔")]


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
    # Real free-licence music (tools/music/library.py), cut on the bar at its own 120 BPM, so the
    # 1-2 s cuts land on the beat. Energetic (kids) and cinematic promos use two different parts of it.
    music = os.path.join(tmp, "music.wav")
    x = music_lib.bed("promo", secs, second=spec.get("mood") != "energetic", fade_in=0.2, fade_out=1.2)
    n = len(x)
    for h in hits[1:]:  # a soft low hit on each cut
        i = int(h * 44100); m = min(int(0.6 * 44100), n - i)
        if m > 0:
            tt = np.arange(m) / 44100
            x[i:i + m] += (0.18 * np.sin(2 * np.pi * np.cumsum(40 + 50 * np.exp(-tt / 0.1)) / 44100) * np.exp(-tt / 0.3))[:, None]
    music_lib.save(music, x / max(np.abs(x).max(), 1e-9) * 0.9)
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
    logo = Image.open(os.path.join(ROOT, spec.get("logo") or "docs/channel/logos/spark-tv.png")).convert("RGBA")
    with tempfile.TemporaryDirectory() as tmp:
        sound, said = soundtrack(spec, hits, tmp)
        silent = os.path.join(tmp, "v.mp4")
        enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                                "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high",
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
            img = Image.fromarray(src).filter(ImageFilter.GaussianBlur(3)).resize((W, H), Image.LANCZOS)
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
