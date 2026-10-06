#!/usr/bin/env python3
"""AI dubbing test for the owner's channel (Bazaar TV).

Only for films we may change and show again: the Blender open movies (CC BY) already on the
"channel-media" release. Two steps, run by .github/workflows/ai-dub.yml:

  prepare  download the film, split the voices from the music and effects (Demucs) and write
           down what is said with timings (Whisper). Uploads dubwork-<film>.en.json plus the
           two sound stems to the release.
  voice    reads the translated lines in tools/dub/<film>.<lang>.json, speaks them with
           Microsoft Edge neural voices, fits each line into its time, lays them over the music
           and effects (original voices kept very quietly underneath) and makes
           <film>-<language>.mp4 plus .srt subtitles.
"""
import asyncio, json, math, os, subprocess, sys, wave

import numpy as np

REPO = os.environ.get("GITHUB_REPOSITORY", "NaseerBabar786/live-tv-app")
BASE = f"https://github.com/{REPO}/releases/download/channel-media"
RATE = 44100
OUT = "out"

CREDITS = {
    "tears-of-steel": ("Tears of Steel", "(CC) Blender Foundation | mango.blender.org", "CC BY 3.0"),
    "elephants-dream": ("Elephants Dream", "(c) copyright 2006, Blender Foundation / Netherlands Media Art Institute / www.elephantsdream.org", "CC BY 2.5"),
    "sintel": ("Sintel", "(c) copyright Blender Foundation | durian.blender.org", "CC BY 3.0"),
}
LANGS = {
    "ur": ("urdu", "Urdu", "urd", {"m": "ur-PK-AsadNeural", "f": "ur-PK-UzmaNeural"}),
    "hi": ("hindi", "Hindi", "hin", {"m": "hi-IN-MadhurNeural", "f": "hi-IN-SwaraNeural"}),
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

def prepare(film):
    os.makedirs(OUT, exist_ok=True)
    src = fetch(f"{BASE}/{film}.mp4", f"{film}.mp4")
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", src, "-vn", "-ac", "2", "-ar", str(RATE), f"{film}.wav")
    run(sys.executable, "-m", "demucs", "--two-stems", "vocals", "-n", "htdemucs", "-o", "sep", f"{film}.wav")
    stems = f"sep/htdemucs/{film}"
    for stem, name in (("no_vocals", "music"), ("vocals", "voices")):
        run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", f"{stems}/{stem}.wav",
            "-c:a", "aac", "-b:a", "192k", f"{OUT}/dubwork-{film}-{name}.m4a")

    from faster_whisper import WhisperModel
    model = WhisperModel("medium.en", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(f"{stems}/vocals.wav", language="en", beam_size=5, vad_filter=True,
                               condition_on_previous_text=False)
    lines = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segs]
    with open(f"{OUT}/dubwork-{film}.en.json", "w", encoding="utf-8") as f:
        json.dump({"film": film, "segments": lines}, f, ensure_ascii=False, indent=1)
    write_srt(f"{OUT}/{film}-english.srt", lines, credit_line(film, "English"))
    print(f"{film}: {len(lines)} lines")


def credit_line(film, lang_name):
    title, holder, licence = CREDITS[film]
    return f"{title} {holder}, {licence}. AI {lang_name} voices added by Bazaar TV."


# ---------------------------------------------------------------- voice

async def speak(text, voice, rate, path):
    import edge_tts
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, voice, rate=f"+{rate}%").save(path)
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
    src = fetch(f"{BASE}/{film}.mp4", f"{film}.mp4")
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

    title, holder, licence = CREDITS[film]
    credit = credit_line(film, lang_name)
    write_srt(f"{OUT}/{film}-{folder}.srt", lines, credit)
    font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    label = f"{title} - AI {lang_name} dub (test)\\n{holder.replace(':', '')}\\n{licence}  -  voices changed by Bazaar TV"
    label = label.replace("'", "")
    draw = (f"drawtext=fontfile={font}:text='{label}':fontcolor=white:fontsize=22:line_spacing=6:"
            f"box=1:boxcolor=black@0.55:boxborderw=12:x=30:y=h-th-40:enable='lt(t,8)'")
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", src, "-i", f"{film}-{lang}-mix.wav",
        "-map", "0:v:0", "-map", "1:a:0", "-vf", draw,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-maxrate", "2500k", "-bufsize", "5000k", "-g", "50",
        "-c:a", "aac", "-b:a", "160k", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-metadata", f"title={title} ({lang_name} AI dub)", "-metadata", f"comment={credit} Original: {licence}.",
        "-metadata:s:a:0", f"language={iso}", "-movflags", "+faststart", "-shortest",
        f"{OUT}/{film}-{folder}.mp4")


if __name__ == "__main__":
    step, films = sys.argv[1], sys.argv[2].split(",")
    for film in films:
        film = film.strip()
        if step == "prepare":
            prepare(film)
        else:
            for lang in sys.argv[3].split(","):
                voice(film, lang.strip())
