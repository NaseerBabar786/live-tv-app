#!/usr/bin/env python3
"""AI dubbing test for the owner's channel (Spark TV).

Only for films we may change and show again: the Blender open movies (CC BY) already on the
"channel-media" release. Two steps, run by .github/workflows/ai-dub.yml:

  prepare  download the film, split the voices from the music and effects (Demucs) and write
           down what is said with timings (Whisper). Uploads dubwork-<film>.en.json plus the
           two sound stems to the release.
  voice    reads the translated lines in tools/dub/<film>.<lang>.json, speaks them with
           Microsoft Edge neural voices, fits each line into its time, lays them over the music
           and effects (original voices kept very quietly underneath) and makes
           <film>-<language>.mp4 plus .srt subtitles.
  credit   puts the credit card (Urdu and English, owner 2026-10-10) over the first 8 seconds of the
           dubbed MP4 already on the release, covering the old English-only one; the sound is kept as it is.
"""
import asyncio, json, math, os, subprocess, sys, wave

import numpy as np

REPO = os.environ.get("GITHUB_REPOSITORY", "NaseerBabar786/live-tv-app")
BASE = f"https://github.com/{REPO}/releases/download/channel-media"
RATE = 44100
OUT = "out"

# Title, credit, licence and (for films not on the release yet) where to download them.
FILMS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "dub", "films.json"), encoding="utf-8"))


def credits(film):
    f = FILMS[film]
    return f["title"], f["holder"], f["licence"]


LANGS = {
    # m / f = main man and woman, m2 / f2 / m3 = other voices (older or deeper).
    "ur": ("urdu", "Urdu", "urd", {"m": ("ur-PK-AsadNeural", 0), "f": ("ur-PK-UzmaNeural", 0),
                                   "m2": ("ur-IN-SalmanNeural", -4), "f2": ("ur-IN-GulNeural", 0),
                                   "m3": ("ur-PK-AsadNeural", -14)}),
    "hi": ("hindi", "Hindi", "hin", {"m": ("hi-IN-MadhurNeural", 0), "f": ("hi-IN-SwaraNeural", 0),
                                     "m2": ("hi-IN-MadhurNeural", -14), "f2": ("hi-IN-SwaraNeural", 8),
                                     "m3": ("hi-IN-MadhurNeural", -24)}),
}


def run(*cmd):
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def fetch(url, path):
    if not os.path.exists(path):
        run("curl", "-fsSL", "--retry", "3", "-o", path, url)
    return path


def read_audio(path, channels):
    """Any audio file -> float32 array (frames, channels) at RATE."""
    raw = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", path, "-f", "f32le",
                          "-ac", str(channels), "-ar", str(RATE), "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, channels).copy()


def write_wav(path, data):
    pcm = (np.clip(data, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(pcm.shape[1]); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm.tobytes())


def srt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def write_srt(path, lines, credit):
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"1\n{srt_time(0)} --> {srt_time(5)}\n{credit}\n\n")
        for i, s in enumerate(lines, 2):
            f.write(f"{i}\n{srt_time(s['start'])} --> {srt_time(s['end'])}\n{s['text'].strip()}\n\n")


# ---------------------------------------------------------------- prepare

def get_film(film):
    """The film from the release, or (first time) from its source, made into a 720p MP4 that is
    also uploaded to the release with the dubbed copies."""
    path = f"{film}.mp4"
    if os.path.exists(path):
        return path
    if subprocess.run(["curl", "-fsSL", "--retry", "3", "-o", path, f"{BASE}/{film}.mp4"]).returncode == 0:
        return path
    for url in FILMS[film].get("sources", []):
        if subprocess.run(["curl", "-fsSL", "--retry", "3", "-o", f"src_{film}", url]).returncode != 0:
            continue
        run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", f"src_{film}",
            "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=25,format=yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-maxrate", "2500k", "-bufsize", "5000k", "-g", "50",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", path)
        os.makedirs(OUT, exist_ok=True)
        subprocess.run(["cp", path, f"{OUT}/{film}.mp4"], check=True)
        return path
    raise RuntimeError(f"no source worked for {film}")


def prepare(film):
    os.makedirs(OUT, exist_ok=True)
    src = get_film(film)
    voices = f"{film}-voices.m4a"
    # The sound stems are kept on the release; only split them again when they aren't there.
    if subprocess.run(["curl", "-fsSL", "-o", voices, f"{BASE}/dubwork-{film}-voices.m4a"]).returncode != 0:
        run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", src, "-vn", "-ac", "2", "-ar", str(RATE), f"{film}.wav")
        run(sys.executable, "-m", "demucs", "--two-stems", "vocals", "-n", "htdemucs", "-o", "sep", f"{film}.wav")
        stems = f"sep/htdemucs/{film}"
        for stem, name in (("no_vocals", "music"), ("vocals", "voices")):
            run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", f"{stems}/{stem}.wav",
                "-c:a", "aac", "-b:a", "192k", f"{OUT}/dubwork-{film}-{name}.m4a")
        voices = f"{stems}/vocals.wav"
        length = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src],
                                      check=True, capture_output=True, text=True).stdout)
        run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-ss", str(int(length * 0.3)), "-i", src, "-frames:v", "1",
            "-vf", "scale=640:-2", "-q:v", "4", f"{OUT}/{film}-poster.jpg")

    from faster_whisper import WhisperModel
    model = WhisperModel("medium.en", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(voices, language="en", beam_size=5, vad_filter=True, word_timestamps=True,
                               condition_on_previous_text=False)
    words = [w for s in segs for w in (s.words or [])]
    lines = to_lines(words)
    with open(f"{OUT}/dubwork-{film}.en.json", "w", encoding="utf-8") as f:
        json.dump({"film": film, "segments": lines}, f, ensure_ascii=False, indent=1)
    write_srt(f"{OUT}/{film}-english.srt", lines, credit_line(film, "English"))
    print(f"{film}: {len(lines)} lines")


def to_lines(words):
    """Words with timings -> short lines that start when the speaking starts: a new line after a
    pause, or after the end of a sentence once the line is long enough."""
    lines, cur = [], []
    for w in words:
        if cur:
            gap = w.start - cur[-1].end
            text = cur[-1].word.strip()
            long_enough = cur[-1].end - cur[0].start > 1.2
            if gap > 0.7 or (text[-1:] in ".?!" and long_enough) or cur[-1].end - cur[0].start > 7:
                lines.append(cur); cur = []
        cur.append(w)
    if cur:
        lines.append(cur)
    return [{"start": round(l[0].start, 2), "end": round(l[-1].end, 2), "text": "".join(w.word for w in l).strip()} for l in lines]


def credit_line(film, lang_name):
    title, holder, licence = credits(film)
    return f"{title} {holder}, {licence}. AI {lang_name} voices added by Spark TV."


# ---------------------------------------------------------------- voice

async def speak(text, voice, rate, path):
    import edge_tts
    name, pitch = voice
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, name, rate=f"+{rate}%", pitch=f"{pitch:+d}Hz").save(path)
            return
        except Exception as e:  # the service sometimes drops a request
            print(f"retry {attempt + 1} for {path}: {e}", flush=True)
            await asyncio.sleep(3 * (attempt + 1))
    raise RuntimeError(f"no voice for {path}")


def trim_silence(clip, level=0.01):
    loud = np.where(np.abs(clip).max(axis=1) > level)[0]
    return clip[max(0, loud[0] - 400): loud[-1] + 2000] if len(loud) else clip[:0]


def voice(film, lang):
    folder, lang_name, iso, voices = LANGS[lang]
    script = json.load(open(f"tools/dub/{film}.{lang}.json", encoding="utf-8"))
    lines = script["segments"]
    os.makedirs(OUT, exist_ok=True); os.makedirs("tts", exist_ok=True)
    src = get_film(film)
    music = read_audio(fetch(f"{BASE}/dubwork-{film}-music.m4a", f"{film}-music.m4a"), 2)
    orig = read_audio(fetch(f"{BASE}/dubwork-{film}-voices.m4a", f"{film}-voices.m4a"), 2)
    n = min(len(music), len(orig))
    dub = np.zeros((n, 1), dtype=np.float32)

    cursor = 0.0  # where the previous line really ended, so lines never talk over each other
    report = []
    for i, s in enumerate(lines):
        nxt = lines[i + 1]["start"] if i + 1 < len(lines) else s["end"] + 3
        start = max(s["start"], cursor)
        room = max(s["end"], nxt - 0.15) - start
        voice_name = voices[s.get("v", "m")]
        rate, clip = 0, None
        for _ in range(3):
            path = f"tts/{film}-{lang}-{i:03}-{rate}.mp3"
            asyncio.run(speak(s["text"], voice_name, rate, path))
            clip = trim_silence(read_audio(path, 1))
            length = len(clip) / RATE
            if length <= room or rate >= 45:
                break
            rate = min(45, rate + max(8, math.ceil((length / room - 1) * 100) + 3))
        length = len(clip) / RATE
        if length > room * 1.02 and room > 0.3:
            # still too long: squeeze a little more without changing the pitch
            tempo = min(1.25, length / room)
            path2 = path.replace(".mp3", "-fast.wav")
            run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", path, "-filter:a", f"atempo={tempo:.3f}", path2)
            clip = trim_silence(read_audio(path2, 1))
            length = len(clip) / RATE
        at = int(start * RATE)
        end = min(n, at + len(clip))
        dub[at:end] += clip[: end - at]
        cursor = start + length + 0.1
        report.append(f"{i:3} {s['start']:7.2f} room {room:5.2f}s spoke {length:5.2f}s rate +{rate}% late {start - s['start']:4.2f}s")
    print("\n".join(report))

    peak = float(np.abs(dub).max()) or 1.0
    dub = dub / peak * 0.85
    speaking = np.convolve((np.abs(dub[:, 0]) > 0.02).astype(np.float32), np.ones(RATE // 4) / (RATE // 4), "same")
    duck = 1.0 - 0.35 * np.clip(speaking * 4, 0, 1)  # music dips a little while the dub talks
    mix = music[:n] * duck[:, None] + orig[:n] * 0.10 + np.repeat(dub, 2, axis=1)
    mix /= max(1.0, float(np.abs(mix).max()) / 0.98)
    write_wav(f"{film}-{lang}-mix.wav", mix)

    title, holder, licence = credits(film)
    credit = credit_line(film, lang_name)
    write_srt(f"{OUT}/{film}-{folder}.srt", lines, credit)
    # The credit sits on screen for the first 8 seconds (CC BY asks for credit and a note of what changed).
    card = credit_card(film, lang, *video_size(src))
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", src, "-i", f"{film}-{lang}-mix.wav", "-i", card,
        "-map", "[v]", "-map", "1:a:0", "-filter_complex", "[0:v:0][2:v]overlay=0:0:enable='lt(t,8)'[v]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-maxrate", "2500k", "-bufsize", "5000k", "-g", "50",
        "-c:a", "aac", "-b:a", "160k", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-metadata", f"title={title} ({lang_name} AI dub)", "-metadata", f"comment={credit} Original: {licence}.",
        "-metadata:s:a:0", f"language={iso}", "-movflags", "+faststart", "-shortest",
        f"{OUT}/{film}-{folder}.mp4")


# ---------------------------------------------------------------- credit card

URDU_FONT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stories", "fonts", "NotoNastaliqUrdu-700.ttf")
LATIN_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
LANG_UR = {"ur": "اردو", "hi": "ہندی"}  # the Nastaliq font has no "·", ":" or brackets: Urdu commas only


def video_size(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                          "-of", "csv=p=0", path], check=True, capture_output=True, text=True).stdout
    w, h = out.strip().split(",")[:2]
    return int(w), int(h)


def credit_card(film, lang, w, h, cover_old=False):
    """A see-through picture the size of the film with the credit in Urdu and English at the bottom left.
    [cover_old]: the box also hides the English-only credit the earlier dubs drew there (22 px DejaVu at
    x=30, 40 px above the bottom, in a 12 px box)."""
    from PIL import Image, ImageDraw, ImageFont
    folder, lang_name, _, _ = LANGS[lang]
    f = FILMS[film]
    k = h / 720
    ur = ImageFont.truetype(URDU_FONT, round(26 * k))
    en = ImageFont.truetype(LATIN_FONT, round(20 * k))
    small = ImageFont.truetype(LATIN_FONT, round(16 * k))
    rows = [(f"{f.get('titleUr', f['title'])}، {LANG_UR[lang]} میں اسپارک ٹی وی کی اے آئی آوازیں", ur, {"direction": "rtl", "language": "ur"}),
            (f"{f['title']} · AI {lang_name} voices by Spark TV", en, {}),
            (f"{f['holder']} · {f['licence']}", small, {})]
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad, gap = round(14 * k), round(12 * k)
    sizes = [d.textbbox((0, 0), t, font=fo, **kw) for t, fo, kw in rows]
    bw = max(b[2] - b[0] for b in sizes) + 2 * pad
    bh = sum(b[3] - b[1] for b in sizes) + gap * (len(rows) - 1) + 2 * pad
    x0, y1 = round(24 * k), h - round(28 * k)
    box = [x0, y1 - bh, x0 + bw, y1]
    if cover_old:
        old = f"{f['title']} - AI {lang_name} dub (test)\n{f['holder']}\n{f['licence']}  -  voices changed by Bazaar TV"
        ob = d.multiline_textbbox((0, 0), old, font=ImageFont.truetype(LATIN_FONT, 22), spacing=6)
        tw, th = ob[2] - ob[0], ob[3] - ob[1]
        box = [min(box[0], 30 - 16), min(box[1], h - 40 - th - 16), max(box[2], 30 + tw + 16), max(box[3], h - 40 + 16)]
    d.rounded_rectangle(box, radius=round(10 * k), fill=(12, 14, 24, 255 if cover_old else 215))
    y = box[3] - bh + pad
    for (t, fo, kw), b in zip(rows, sizes):
        if kw:  # Urdu reads from the right edge of the box
            d.text((box[2] - pad - (b[2] - b[0]), y - b[1]), t, font=fo, fill=(255, 224, 140, 255), **kw)
        else:
            d.text((box[0] + pad, y - b[1]), t, font=fo, fill=(245, 245, 245, 255))
        y += b[3] - b[1] + gap
    path = f"{film}-{lang}-credit.png"
    img.save(path)
    return path


def recredit(film, lang):
    """The dubbed MP4 on the release with the new credit card over its first 8 seconds; the sound is copied."""
    folder = LANGS[lang][0]
    os.makedirs(OUT, exist_ok=True)
    src = fetch(f"{BASE}/{film}-{folder}.mp4", f"old-{film}-{folder}.mp4")
    card = credit_card(film, lang, *video_size(src), cover_old=True)
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", src, "-i", card,
        "-map", "[v]", "-map", "0:a:0", "-filter_complex", "[0:v:0][1:v]overlay=0:0:enable='lt(t,8)'[v]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-maxrate", "2500k", "-bufsize", "5000k", "-g", "50",
        "-c:a", "copy", "-map_metadata", "0", "-movflags", "+faststart", f"{OUT}/{film}-{folder}.mp4")


if __name__ == "__main__":
    step, films = sys.argv[1], sys.argv[2].split(",")
    for film in films:
        film = film.strip()
        if step == "prepare":
            prepare(film)
        elif step == "credit":
            for lang in sys.argv[3].split(","):
                recredit(film, lang.strip())
        else:
            for lang in sys.argv[3].split(","):
                voice(film, lang.strip())
