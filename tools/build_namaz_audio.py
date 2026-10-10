"""Builds the teacher-voice recordings of Learn Namaz (Iqra Quran and NextGen Cable's Iqra Quran section):
docs/quran/namaz/<voice>/<id>.mp3, served at tv.bulkbazaar.ca/quran/namaz/.

Every recitation in qurankit's data/Namaz.kt that is not a whole Quran verse (those are recited by the
chosen Quran reciter) is read in each teacher voice with Microsoft Edge's free Arabic neural voices
(edge-tts), a little slower than normal so learners can follow. The voice ids here must match
NamazVoice in qurankit's data/Namaz.kt.

    python3 tools/build_namaz_audio.py      # needs ffmpeg and internet (runs in build-namaz-audio.yml)
"""
import asyncio, json, os, re, subprocess, sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "qurankit", "src", "main", "java", "com", "iqraquran", "app", "data", "Namaz.kt")
QURAN = os.path.join(ROOT, "qurankit", "src", "main", "assets", "quran", "quran.json")
OUT = os.path.join(ROOT, "docs", "quran", "namaz")

# id (as in the app), edge-tts voice, speed.
VOICES = [
    ("hamed", "ar-SA-HamedNeural", "-15%"),
    ("shakir", "ar-EG-ShakirNeural", "-15%"),
    ("moaz", "ar-QA-MoazNeural", "-15%"),
    ("zariyah", "ar-SA-ZariyahNeural", "-15%"),
]


def recitations():
    """(id, arabic) for every recitation the teacher reads, taken from Namaz.kt."""
    src = open(SRC, encoding="utf-8").read()
    quran = json.load(open(QURAN, encoding="utf-8"))["surahs"]
    out = []
    for block in re.findall(r"Recitation\((.*?)\n        \),", src, re.S):
        rid = re.search(r'id = "([^"]+)"', block).group(1)
        arabic = re.search(r'arabic = ((?:"[^"]*"\s*\+?\s*)+)', block)
        if arabic:
            text = "".join(re.findall(r'"([^"]*)"', arabic.group(1)))
        else:
            ayahs = re.findall(r"(\d+) to (\d+)", block.split("ayahs =", 1)[1].split("\n", 1)[0])
            word = re.search(r'fromWord = "([^"]+)"', block)
            if not word:
                continue  # whole Quran verses: the reciter reads them
            text = " ".join(quran[int(s) - 1]["ayahs"][int(a) - 1] for s, a in ayahs)
            text = text[text.index(word.group(1).encode().decode("unicode_escape")):]
        # Verse-end marks and pause signs are not read aloud.
        text = re.sub(r"[ۖ-ۜ۝۞]", "", text).replace("۔", "،").strip()
        out.append((rid, text))
    return out


async def say(text, voice, rate, path):
    import edge_tts
    tmp = path + ".raw.mp3"
    await edge_tts.Communicate(text, voice, rate=rate).save(tmp)
    # One loudness for every voice, small mono files.
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-af", "loudnorm=I=-16:TP=-1.5",
                    "-ac", "1", "-ar", "24000", "-b:a", "48k", path], check=True)
    os.remove(tmp)


async def main():
    items = recitations()
    if len(items) < 10:
        sys.exit(f"only {len(items)} recitations found in Namaz.kt")
    for vid, voice, rate in VOICES:
        os.makedirs(os.path.join(OUT, vid), exist_ok=True)
        for rid, text in items:
            path = os.path.join(OUT, vid, rid + ".mp3")
            for attempt in range(3):
                try:
                    await say(text, voice, rate, path)
                    break
                except Exception as e:  # the free service sometimes drops a request
                    print("retry", vid, rid, e)
                    await asyncio.sleep(5)
            else:
                sys.exit(f"could not make {vid}/{rid}")
            print("made", vid, rid)
    json.dump({"voices": [v[0] for v in VOICES], "items": [i for i, _ in items]},
              open(os.path.join(OUT, "namaz.json"), "w"), indent=1)


asyncio.run(main())
