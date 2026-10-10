"""Makes a narrated story video (1280x720 MP4) for Spark TV from a story.json.

Usage: python3 tools/stories/make_story_video.py <story folder> <out dir> [--offline]

Each scene has an English picture prompt and Urdu lines. The script
  1. reads every line aloud with Microsoft Edge's free neural voice (edge-tts),
  2. gets one AI picture per scene from Pollinations (free, no key), or reuses
     <story folder>/images/NN.jpg when it is already there,
  3. moves slowly over each picture (pan and zoom), timed to the voice,
  4. adds soft background music (Kevin MacLeod, CC BY 3.0, credited at the end) and Urdu subtitles, each with its English line
     under it (story.json "en"; the title and lesson cards get English lines too).
--offline skips the internet (silent voice of guessed length, plain pictures) to test the layout.
Needs ffmpeg, numpy, Pillow and (online) edge-tts.
"""
import asyncio, json, math, os, random, shutil, subprocess, sys, time, urllib.parse, urllib.request, wave
import numpy as np
from PIL import Image, ImageDraw

W, H, FPS, SR = 1280, 720, 25, 44100
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "fonts")

def run(*cmd):
    subprocess.run(cmd, check=True)

def secs(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         check=True, capture_output=True, text=True).stdout
    return float(out.strip())

def write_wav(path, samples):
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

def read_wav(path):
    with wave.open(path, "rb") as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32767

# ---------- voice ----------
async def _tts(text, voice, rate, path):
    import edge_tts
    await edge_tts.Communicate(text, voice, rate=rate).save(path)

def speak(text, voice, rate, mp3, wav, offline):
    if offline:
        write_wav(wav, np.zeros(int(SR * (0.8 + len(text) * 0.075)), np.float32)); return
    for attempt in range(5):
        try:
            asyncio.run(_tts(text, voice, rate, mp3))
            if os.path.getsize(mp3) > 1000: break
        except Exception as e:
            print("voice retry", attempt, e)
        time.sleep(5 * (attempt + 1))
    else:
        raise SystemExit("Voice failed for: " + text)
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", mp3, "-ac", "1", "-ar", str(SR), wav)

# ---------- pictures ----------
def plain_picture(path, i):
    random.seed(i)
    c1 = (random.randint(20, 70), random.randint(60, 110), random.randint(30, 70))
    c2 = (random.randint(150, 220), random.randint(120, 180), random.randint(60, 110))
    im = Image.new("RGB", (1920, 1080)); d = ImageDraw.Draw(im)
    for y in range(1080):
        t = y / 1080
        d.line([(0, y), (1920, y)], fill=tuple(int(c1[k] + (c2[k] - c1[k]) * t) for k in range(3)))
    im.save(path, quality=92)

def ai_picture(prompt, seed, path):
    url = ("https://image.pollinations.ai/prompt/" + urllib.parse.quote(prompt) +
           f"?width=1920&height=1080&seed={seed}&nologo=true&model=flux")
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "BazaarTV-stories/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r, open(path, "wb") as f:
                f.write(r.read())
            im = Image.open(path).convert("RGB")
            print("picture", os.path.basename(path), im.size)
            # Cut off the bottom strip, where the free service puts its small logo.
            im = im.crop((0, 0, im.width, int(im.height * 0.93)))
            im.save(path, quality=95)
            return True
        except Exception as e:
            print("picture retry", attempt, e)
            time.sleep(20 * (attempt + 1))
    return False

# ---------- music (free-licence recording, tools/music/library.py; credited at the end) ----------
sys.path.insert(0, os.path.join(HERE, "..", "music"))
import library as music_lib  # noqa: E402
MUSIC_CREDIT = 'Music: "Vadodora Chill Mix" by Kevin MacLeod (incompetech.com), CC BY 3.0'

def music(total):
    """Soft background music for the whole story (loops on the bar), mono at SR, peak 1."""
    m = music_lib.bed("calm", total, fade_in=3.0, fade_out=3.0).mean(1)
    return (m / max(1e-6, np.abs(m).max())).astype(np.float32)

# ---------- subtitles ----------
def ts(s):
    s = max(0, s); h = int(s // 3600); m = int(s % 3600 // 60)
    return f"{h}:{m:02d}:{s % 60:05.2f}"

ASS_HEAD = """[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Noto Nastaliq Urdu,44,&H00FFFFFF,&H00FFFFFF,&H00101010,&H99000000,0,0,0,0,100,100,0,0,1,3.5,2,2,90,90,62,1
Style: SubEn,DejaVu Sans,24,&H00F0F0F0,&H00F0F0F0,&H00101010,&H99000000,0,0,0,0,100,100,0,0,1,2.5,1.5,2,90,90,24,1
Style: Big,Noto Nastaliq Urdu,74,&H0066E0FF,&H0066E0FF,&H00101010,&HAA000000,0,0,0,0,100,100,0,0,1,5,3,8,60,60,70,1
Style: Small,Noto Nastaliq Urdu,40,&H00FFFFFF,&H00FFFFFF,&H00101010,&HAA000000,0,0,0,0,100,100,0,0,1,3,2,8,60,60,246,1
Style: BigEn,DejaVu Sans,40,&H0066E0FF,&H0066E0FF,&H00101010,&HAA000000,1,0,0,0,100,100,0,0,1,3,2,8,60,60,184,1
Style: SmallEn,DejaVu Sans,24,&H00FFFFFF,&H00FFFFFF,&H00101010,&HAA000000,0,0,0,0,100,100,0,0,1,2,1.5,8,60,60,316,1
Style: Credit,DejaVu Sans,16,&H00DDDDDD,&H00DDDDDD,&H00101010,&H99000000,0,0,0,0,100,100,0,0,1,1.5,1,2,40,40,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

def source_hash(folder):
    """Changes when the story or this script changes, so the workflow knows to make the video again."""
    import hashlib
    h = hashlib.sha256()
    for p in (os.path.join(folder, "story.json"), os.path.abspath(__file__), os.path.join(HERE, "..", "music", "library.py")):
        h.update(open(p, "rb").read())
    return h.hexdigest()[:16]

def main():
    if "--hash" in sys.argv:
        print(source_hash(sys.argv[1])); return
    folder, out = sys.argv[1], sys.argv[2]
    offline = "--offline" in sys.argv
    story = json.load(open(os.path.join(folder, "story.json"), encoding="utf-8"))
    work = os.path.join(out, "work"); os.makedirs(work, exist_ok=True)
    imgdir = os.path.join(out, "images"); os.makedirs(imgdir, exist_ok=True)
    events, clips, voice_parts, now = [], [], [], 0.0
    gap, ai_ok = 0.45, 0
    for i, sc in enumerate(story["scenes"]):
        # picture
        img = os.path.join(imgdir, f"{i:02d}.jpg")
        keep = os.path.join(folder, "images", f"{i:02d}.jpg")
        if os.path.exists(keep):
            shutil.copy(keep, img); ai_ok += 1
        elif offline or not ai_picture(story["style"] + ", " + sc["prompt"], story["seed"] + i, img):
            plain_picture(img, i)
        else:
            ai_ok += 1
            time.sleep(8)
        # voice
        lead = 2.0 if sc.get("card") == "title" else 0.6
        parts, t = [np.zeros(int(SR * lead), np.float32)], lead
        for j, line in enumerate(sc["lines"]):
            wav = os.path.join(work, f"v{i:02d}_{j}.wav")
            speak(line, story["voice"], story.get("rate", "+0%"), wav[:-4] + ".mp3", wav, offline)
            a = read_wav(wav); d = len(a) / SR
            events.append((now + t - 0.1, now + t + d + 0.25, "Sub", line))
            if sc.get("en"):  # every line in English too (owner 2026-10-10: all writing in Urdu and English)
                events.append((now + t - 0.1, now + t + d + 0.25, "SubEn", sc["en"][j]))
            parts += [a, np.zeros(int(SR * gap), np.float32)]
            t += d + gap
        tail = 2.5 if i == len(story["scenes"]) - 1 else 0.7
        parts.append(np.zeros(int(SR * tail), np.float32))
        scene = np.concatenate(parts)
        n = int(math.ceil(len(scene) / SR * FPS)); dur = n / FPS
        scene = np.concatenate([scene, np.zeros(int(dur * SR) - len(scene), np.float32)])
        voice_parts.append(scene)
        if sc.get("card") == "title":
            events.append((now + 0.3, now + dur - 0.3, "Big", story["title"]))
            events.append((now + 0.8, now + dur - 0.3, "Small", story.get("subtitle", "")))
            if story.get("titleEnCard"):
                events.append((now + 0.3, now + dur - 0.3, "BigEn", story["titleEnCard"]))
                events.append((now + 0.8, now + dur - 0.3, "SmallEn", story.get("subtitleEn", "")))
        elif sc.get("card") == "moral":
            events.append((now + 0.3, now + dur - 0.3, "Big", sc.get("cardText", "")))
            if sc.get("cardTextEn"):
                events.append((now + 0.3, now + dur - 0.3, "BigEn", sc["cardTextEn"]))
        # pan and zoom: alternate zoom in / out and drift direction
        zin = i % 2 == 0
        px = ["0.5", "on/{n}", "1-on/{n}", "0.5"][i % 4].format(n=n)
        py = ["0.5", "0.4", "0.6", "0.35+0.3*on/{n}"][i % 4].format(n=n)
        z = f"1+0.14*on/{n}" if zin else f"1.14-0.14*on/{n}"
        clip = os.path.join(work, f"c{i:02d}.mp4")
        fade_out = max(0, dur - 0.5)
        run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", img, "-vf",
            f"scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,"
            f"zoompan=z='{z}':x='(iw-iw/zoom)*({px})':y='(ih-ih/zoom)*({py})':d={n}:s={W}x{H}:fps={FPS},"
            f"fade=t=in:st=0:d=0.5,fade=t=out:st={fade_out:.2f}:d=0.5,format=yuv420p",
            "-frames:v", str(n), "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", clip)
        clips.append(clip); now += dur
        print(f"scene {i}: {dur:.1f}s")
    total = now
    voice = np.concatenate(voice_parts)
    mix = voice * 0.95 + music(len(voice) / SR) * 0.07
    write_wav(os.path.join(work, "audio.wav"), mix / max(1.0, np.abs(mix).max()))
    with open(os.path.join(work, "list.txt"), "w") as f:
        f.writelines(f"file '{os.path.abspath(c)}'\n" for c in clips)
    ass = os.path.join(work, "subs.ass")
    with open(ass, "w", encoding="utf-8") as f:
        f.write(ASS_HEAD)
        for a, b, style, text in events + [(max(0, total - 6), total, "Credit", MUSIC_CREDIT)]:
            f.write(f"Dialogue: 0,{ts(a)},{ts(b)},{style},,0,0,0,,{text}\n")
    mp4 = os.path.join(out, story["id"] + ".mp4")
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", os.path.join(work, "list.txt"),
        "-i", os.path.join(work, "audio.wav"), "-vf", f"ass={ass}:fontsdir={FONTS}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-maxrate", "2500k", "-bufsize", "5000k", "-g", "50",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-shortest", "-movflags", "+faststart", mp4)
    real = secs(mp4)
    json.dump({"id": story["id"], "title": story["titleEn"], "secs": int(round(real)), "aiPictures": ai_ok, "source": source_hash(folder),
               "scenes": len(story["scenes"])}, open(os.path.join(out, story["id"] + ".json"), "w"), indent=1)
    print(f"Done: {mp4} {real:.1f}s, AI pictures {ai_ok}/{len(story['scenes'])}")

if __name__ == "__main__":
    main()
