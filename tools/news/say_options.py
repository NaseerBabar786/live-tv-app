"""
Pronunciation choices for the owner (2026-10-10: the newsreader says "Assalam o Alaikum" and "Independent" wrongly).
Reads each way of writing a word with the on-air newsreader's voice, numbered ("one ... two ..."), into one MP3, so
the owner can say which number sounds right; the winner goes into make_news.SAY.

    python3 tools/news/say_options.py OUT.mp3
"""
import asyncio
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_news as N  # noqa: E402

NUMBERS = ["ایک", "دو", "تین", "چار", "پانچ"]
CHOICES = [
    ("السلام علیکم، اور یہ ہے اسپارک ٹی وی نیوز۔",
     ["السلام علیکم", "اَلسّلامُ عَلَیکُم", "اَسّلام و علیکم", "اَسَّلامُ عَلَیکُم", "Assalam o Alaikum"]),
    ("{} اردو کے مطابق۔",
     ["انڈپینڈنٹ", "اِنڈی پینڈنٹ", "اِن ڈی پَین ڈَنٹ", "Independent"]),
]


def main(out):
    work = os.path.join(os.path.dirname(os.path.abspath(out)) or ".", "say-work")
    os.makedirs(work, exist_ok=True)
    voice = N.voice_of({"name": "Ayesha", "voice": N.VOICE_A})   # the reader the owner heard
    files, k = [], 0
    for line, ways in CHOICES:
        for i, way in enumerate(ways):
            said = line.format(way) if "{}" in line else line.replace("السلام علیکم", way)
            for text in (f"نمبر {NUMBERS[i]}۔", said):
                mp3 = os.path.join(work, f"{k:03d}.mp3"); k += 1
                # Straight to the voice, without make_news's own SAY spellings.
                asyncio.run(edge(text, voice, mp3))
                files.append(mp3)
        files.append("pause")
    lst = os.path.join(work, "list.txt")
    silence = os.path.join(work, "silence.mp3")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.8",
                    "-c:a", "libmp3lame", silence], check=True)
    with open(lst, "w") as f:
        for p in files:
            f.write(f"file '{silence if p == 'pause' else p}'\nfile '{silence}'\n")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-ar", "24000", "-ac", "1",
                    "-c:a", "libmp3lame", "-b:a", "64k", out], check=True)
    print("wrote", out)


async def edge(text, voice, path):
    import edge_tts
    name, pitch, rate = (voice.split("|") + ["+0Hz", N.RATE])[:3]
    await edge_tts.Communicate(text, name, rate=N._shift(rate, N.PACE, "%"), pitch=pitch).save(path)


if __name__ == "__main__":
    main(sys.argv[1])
