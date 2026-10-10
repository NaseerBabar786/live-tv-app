"""A livelier newsreader voice (owner 2026-10-10: the reader speaks too slowly and flat; real people speed up and slow
down and put feeling in). edge-tts has one speed per call, so each phrase is spoken separately with its own speed and
pitch, then joined with short natural pauses.

  python lively_voice.py out.mp3 voice "+12%|+2Hz|phrase one" "+20%|+0Hz|phrase two" ...
"""
import asyncio
import os
import subprocess
import sys
import tempfile

import edge_tts

out, voice, parts = sys.argv[1], sys.argv[2], sys.argv[3:]
tmp = tempfile.mkdtemp()
files = []
for i, part in enumerate(parts):
    rate, pitch, text = part.split("|", 2)
    f = os.path.join(tmp, f"{i}.mp3")
    asyncio.run(edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(f))
    files.append(f)
# 0.18 s breath between phrases (edge already ends each phrase with a little silence).
gap = os.path.join(tmp, "gap.mp3")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.18",
                "-q:a", "4", gap], check=True)
lst = os.path.join(tmp, "list.txt")
with open(lst, "w") as fh:
    for i, f in enumerate(files):
        if i:
            fh.write(f"file '{gap}'\n")
        fh.write(f"file '{f}'\n")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-ar", "24000", "-ac", "1",
                "-b:a", "96k", out], check=True)
print("saved", out)
