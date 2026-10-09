"""Voice samples for the owner (2026-10-09): every newsreader on camera saying a few lines in their own voice
(tools/news/presenters/voices.json). Needs edge-tts + ffmpeg and the readers' clips in tools/news/presenters/clips/.

    python3 tools/news/voice_samples.py out/   -> out/news-voice-<Name>.mp4 (854x480)
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_news as N

READERS = [("Sana", "ثنا", "anchor-1f"), ("Ayesha", "عائشہ", "anchor-5f"), ("Zara", "زارا", "anchor-6f"),
           ("Hina", "حنا", "anchor-7f"), ("Mehwish", "مہوش", "anchor-8f"), ("Areeba", "اریبہ", "anchor-9n2"),
           ("Priya", "پریا", "anchor-3hf"), ("Imran", "عمران", "anchor-m1f"), ("Faisal", "فیصل", "anchor-m6f"),
           ("Kamran", "کامران", "anchor-m7f"), ("Tariq", "طارق", "anchor-m8f"), ("Saad", "سعد", "anchor-m10f"),
           ("Hassan", "حسن", "anchor-m11f")]

def main(out):
    os.makedirs(out, exist_ok=True)
    clips = os.path.join(N.HERE, "presenters", "clips")
    for name, ur, cid in READERS:
        say = (f"السلام علیکم، میں {ur} ہوں، اور اسپارک ٹی وی نیوز میں آپ کا خیر مقدم ہے۔ "
               "آج کی اہم خبروں میں، ٹورنٹو میں موسم خوشگوار رہے گا، اور پاکستان میں کرکٹ کی تیاریاں زور و شور سے جاری ہیں۔")
        voice = N.voice_of({"name": name})
        base = os.path.join(out, f"v-{name}")
        N.speak(say, voice, base, False)
        clip = os.path.join(clips, f"{cid}.mp4")
        loop = N.boomerang(clip) if os.path.exists(clip) else None
        mp4 = os.path.join(out, f"news-voice-{name}.mp4")
        vin = ["-stream_loop", "-1", "-i", loop] if loop else ["-f", "lavfi", "-i", "color=c=0x101a33:s=854x480:r=25"]
        N.run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", *vin, "-i", base + ".wav",
              "-vf", "scale=854:480:force_original_aspect_ratio=increase,crop=854:480,fps=25,format=yuv420p",
              "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-c:a", "aac", "-b:a", "96k",
              "-movflags", "+faststart", mp4)
        print("made", mp4, voice)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "out")
