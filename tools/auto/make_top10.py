#!/usr/bin/env python3
""""Top 10 of the week" for Spark Auto (channel 47, owner 2026-10-08): our own short countdown of the ten
most-watched car videos posted in the last week on the channel's sources (docs/channel/yt-auto.json),
read by a free AI voice over library music (credited on screen). The channel plays it in a break once an
hour (docs/channel/schedule.js ownClips, ytorder.js withBreaks), and the videos themselves play in its
blocks during the week.

    python3 tools/auto/make_top10.py OUT_DIR [--silent] [--today YYYY-MM-DD]

Writes OUT_DIR/auto-top10.mp4 (1280x720, under 2 minutes) and OUT_DIR/auto-clips.json. Only our own
artwork: text cards with the rank, title and source, no YouTube pictures or logos. Views come from each
video's watch page, so ranking needs YouTube (GitHub Actions); without it the newest videos go first.
The voice is Microsoft Edge's free neural voice (edge-tts); --silent makes the pictures with a quiet
track instead, to check the look anywhere. Needs ffmpeg, numpy, Pillow and, online, edge-tts.
"""
import argparse, asyncio, datetime, json, os, re, subprocess, sys, tempfile, urllib.request, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(HERE, "..", "music"))
import library as music  # noqa: E402

LIST = os.path.join(ROOT, "docs", "channel", "yt-auto.json")
LOGO = os.path.join(ROOT, "docs", "channel", "logos", "spark-auto.png")
VOICE, RATE = "en-GB-RyanNeural", "+4%"
MOOD = "energetic"
W, H, FPS, SR = 1280, 720, 25, 44100
MAX_SECS = 118  # one break is at most 120 s
REL = "https://github.com/NaseerBabar786/live-tv-app/releases/download/channel-media/"
RED, WHITE, GREY = (232, 52, 44), (246, 246, 246), (170, 176, 186)
PER_SOURCE = 2


def run(*cmd):
    subprocess.run(cmd, check=True)


def latin(size, bold=True):
    names = ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"]
    for d in ["/usr/share/fonts/truetype/dejavu/", "/usr/share/fonts/dejavu/"]:
        for n in names:
            if os.path.exists(d + n):
                return ImageFont.truetype(d + n, size)
    return ImageFont.load_default()


def clean(title):
    """A title that reads well on screen and aloud: no hashtags, emojis, '| 4K' tails or channel names."""
    t = re.sub(r"#\w+", "", title)
    t = "".join(c for c in t if ord(c) < 0x2000 or c in "’‘“”–—…")
    t = t.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("…", "...")
    parts = [p.strip() for p in re.split(r"\s[|•]\s", t) if p.strip()]
    parts = [p for p in parts if not re.fullmatch(r"(4K|8K|HD|UHD|\d{3,4}p|Ep\.?\s*\d+|.*\b(TV|Autocar|MotorTrend|Top Gear|Fifth Gear|carwow)\b)", p, re.I)] or parts[:1]
    t = " - ".join(parts[:2])
    t = re.sub(r"\s+", " ", t).strip(" -:")
    # Shouting words become normal case so the voice does not spell them out.
    t = re.sub(r"\b([A-Z]{4,})\b", lambda m: m.group(1).capitalize(), t)
    return t[:90].rstrip() + ("..." if len(t) > 90 else "")


def views(vid):
    """The video's view count from its watch page, or None when YouTube can't be reached."""
    try:
        req = urllib.request.Request(f"https://www.youtube.com/watch?v={vid}", headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"})
        html = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace")
        m = re.search(r'"viewCount":"(\d+)"', html)
        return int(m.group(1)) if m else None
    except Exception:  # noqa: BLE001
        return None


def pick(today, online):
    vids = json.load(open(LIST, encoding="utf-8"))["videos"]
    for days in (7, 14, 30):
        since = (today - datetime.timedelta(days=days)).isoformat()
        cand = [v for v in vids if (v.get("posted") or "") >= since and (v.get("mins") or 99) >= 3]
        if len(cand) >= 15:
            break
    for v in cand:
        v["views"] = views(v["id"]) if online else None
    cand.sort(key=lambda v: (v["views"] or 0, v.get("posted") or ""), reverse=True)
    out, per = [], {}
    for v in cand:
        if per.get(v["label"], 0) >= PER_SOURCE:
            continue
        per[v["label"]] = per.get(v["label"], 0) + 1
        out.append(v)
        if len(out) == 10:
            break
    return out, days


def short_views(n):
    if not n:
        return ""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M views".replace(".0M", "M")
    if n >= 1000:
        return f"{n // 1000}K views"
    return f"{n} views"


async def _say(text, path):
    import edge_tts
    await edge_tts.Communicate(text, VOICE, rate=RATE).save(path)


def speech(text, work, name, silent):
    if silent:
        return np.zeros(int(SR * max(1.5, len(text) * 0.062)), np.float32)
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


def background(k):
    """Dark carbon grey with a red speed streak, a little different on every card."""
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    base = 14 + 22 * (1 - y) * (0.6 + 0.4 * x)
    img = np.repeat(base[..., None], 3, 2)
    rnd = np.random.default_rng(k + 3)
    stripes = (np.sin((x * 9 + y * 3 + rnd.random()) * np.pi * 14) > 0.96) * 6
    img += stripes[..., None]
    a = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert("RGBA")
    d = ImageDraw.Draw(a)
    off = int(rnd.integers(-20, 20))  # low on the picture, under the writing
    for i, al in enumerate((200, 120, 60)):
        d.polygon([(-40, 700 + off - i * 22), (W + 40, 560 + off - i * 22), (W + 40, 570 + off - i * 22), (-40, 710 + off - i * 22)],
                  fill=RED + (al,))
    return a.filter(ImageFilter.GaussianBlur(1.2))


def wrap(text, f, width, lines=3):
    d = ImageDraw.Draw(Image.new("L", (8, 8)))
    out, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= width:
            cur = t
        else:
            out.append(cur)
            cur = w
    out.append(cur)
    return out[:lines]


def shadow_text(img, xy, text, f, fill, anchor="la"):
    sh = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh).text((xy[0] + 3, xy[1] + 4), text, font=f, fill=210, anchor=anchor)
    img.alpha_composite(Image.merge("RGBA", [Image.new("L", (W, H), 0)] * 3 + [sh.filter(ImageFilter.GaussianBlur(5))]))
    ImageDraw.Draw(img).text(xy, text, font=f, fill=fill + (255,), anchor=anchor)


def frame(k, credit, header=True):
    """Background plus what is always on: our logo, the show's name and the music credit."""
    im = background(k)
    d = ImageDraw.Draw(im)
    if os.path.exists(LOGO):
        lg = Image.open(LOGO).convert("RGBA")
        lg = lg.resize((int(lg.width * 56 / lg.height), 56), Image.LANCZOS)
        im.alpha_composite(lg, (W - lg.width - 48, 40))
    if header:
        d.text((52, 52), "TOP 10 OF THE WEEK", font=latin(26), fill=RED + (255,))
    d.text((W // 2, H - 30), credit, font=latin(15, False), fill=GREY + (210,), anchor="mm")
    return im


def title_card(k, credit, week):
    im = frame(k, credit, header=False)
    shadow_text(im, (W // 2, 270), "SPARK AUTO", latin(92), WHITE, "mm")
    shadow_text(im, (W // 2, 380), "Top 10 of the week", latin(56), RED, "mm")
    shadow_text(im, (W // 2, 460), week, latin(30, False), GREY, "mm")
    return im


def entry_card(k, credit, n, v):
    im = frame(k, credit)
    shadow_text(im, (70, 360), str(n), latin(250), RED, "lm")
    x = 70 + (300 if n == 10 else 200)
    f = latin(46)
    lines = wrap(clean(v["title"]), f, W - x - 70)
    y0 = 330 - (len(lines) - 1) * 30
    for i, ln in enumerate(lines):
        shadow_text(im, (x, y0 + i * 60), ln, f, WHITE, "lm")
    meta = v["label"] + (f"  ·  {short_views(v.get('views'))}" if v.get("views") else "")
    shadow_text(im, (x, y0 + len(lines) * 60 + 18), meta, latin(30, False), GREY, "lm")
    return im


def end_card(k, credit):
    im = frame(k, credit)
    shadow_text(im, (W // 2, 300), "Watch them all this week", latin(58), WHITE, "mm")
    shadow_text(im, (W // 2, 390), "only on Spark Auto", latin(48), RED, "mm")
    return im


def make(out, today, silent, online):
    top, days = pick(today, online)
    if len(top) < 10:
        raise SystemExit(f"only {len(top)} videos from the last {days} days")
    work = tempfile.mkdtemp()
    credit = music.credit(MOOD)
    week = f"Week of {(today - datetime.timedelta(days=7)).strftime('%B %-d')}"
    lead, tail = 0.5, 0.7
    for with_source in (True, False):  # if it runs long, the source names are only shown, not read
        say = [("intro", "Spark Auto. The top ten car videos of the week.", title_card(0, credit, week))]
        for i, v in enumerate(reversed(top)):
            n = 10 - i
            word = "And number one" if n == 1 else f"Number {n}"
            text = f"{word}. {clean(v['title'])}." + (f" From {v['label']}." if with_source else "")
            say.append((f"n{n}", text, entry_card(i + 1, credit, n, v)))
        say.append(("outro", "Watch them all this week, only on Spark Auto.", end_card(11, credit)))
        voices = [speech(t, work, name, silent) for name, t, _ in say]
        secs_each = [lead + len(v) / SR + tail for v in voices]
        if sum(secs_each) <= MAX_SECS:
            break
    else:
        raise SystemExit(f"show is {sum(secs_each):.0f} s, more than {MAX_SECS}")
    voice = np.concatenate([np.concatenate([np.zeros(int(SR * lead), np.float32), v, np.zeros(int(SR * tail), np.float32)])
                            for v in voices])
    bed = music.bed(MOOD, len(voice) / SR + 0.1, fade_in=0.8, fade_out=2.0).mean(1)[: len(voice)]
    mix = voice * 0.95 + bed * 0.22
    mix = np.clip(mix / max(1.0, np.abs(mix).max() / 0.95), -1, 1)
    wav = os.path.join(work, "mix.wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype("<i2").tobytes())
    # Each card drifts in slowly (never a still picture) and fades into the next.
    parts = []
    for (name, _, im), secs in zip(say, secs_each):
        png, mp4 = os.path.join(work, name + ".png"), os.path.join(work, name + ".mp4")
        im.convert("RGB").save(png)
        frames = int(round(secs * FPS))
        run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-i", png,
            "-vf", f"scale={W * 1.08:.0f}:{H * 1.08:.0f},zoompan=z='min(1.0+on*0.0006,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                   f":d={frames}:s={W}x{H}:fps={FPS},fade=t=in:st=0:d=0.25,fade=t=out:st={secs - 0.25:.2f}:d=0.25,format=yuv420p",
            "-frames:v", str(frames), "-c:v", "libx264", "-preset", "medium", "-crf", "22", mp4)
        parts.append(mp4)
    lst = os.path.join(work, "parts.txt")
    open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    mp4 = os.path.join(out, "auto-top10.mp4")
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-i", wav,
        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", mp4)
    clip = {"src": REL + "auto-top10.mp4?w=" + today.isoformat(), "secs": int(np.ceil(len(mix) / SR)),
            "title": "Spark Auto Top 10 of the week"}
    json.dump({"made": today.isoformat(), "clips": [clip],
               "top10": [{"n": i + 1, "id": v["id"], "title": v["title"], "label": v["label"], "views": v.get("views")}
                         for i, v in enumerate(top)]},
              open(os.path.join(out, "auto-clips.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return clip, top


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--silent", action="store_true")
    ap.add_argument("--offline", action="store_true", help="don't look up views")
    ap.add_argument("--today")
    a = ap.parse_args()
    today = datetime.date.fromisoformat(a.today) if a.today else datetime.date.today()
    os.makedirs(a.out, exist_ok=True)
    clip, top = make(a.out, today, a.silent, not a.offline)
    for i, v in enumerate(top):
        print(f"{i + 1:2}. {v.get('views') or '-':>9}  {v['label']}: {clean(v['title'])}")
    print(f"{clip['secs']} s -> {clip['src']}")


if __name__ == "__main__":
    main()
