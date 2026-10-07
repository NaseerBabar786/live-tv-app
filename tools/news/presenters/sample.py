"""Turns a talking clip (SadTalker or moving Wan clip) into a Bazaar TV News sample: 1280x720, clean voice, our Urdu lower bar.

Usage: python3 tools/news/presenters/sample.py <talking.mp4> <voice.mp3> <presenter id> <out.mp4>
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import make_news as m

def main():
    talking, voice, pid, out = sys.argv[1:5]
    cfg = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "presenters.json")))
    p = next(x for x in cfg["presenters"] + cfg.get("moving", {}).get("people", []) if x["id"] == pid)
    im = Image.new("RGBA", (m.W, m.H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    m.lower_bar(d, f"نیوز ریڈر {p['ur']} • مصنوعی ذہانت")
    im.save("bar.png")
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", talking, "-i", "bar.png", "-i", voice,
                    "-filter_complex", f"[0:v]scale={m.W}:{m.H}:force_original_aspect_ratio=decrease,pad={m.W}:{m.H}:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];[v0][1:v]overlay=0:0,format=yuv420p[v]",
                    "-map", "[v]", "-map", "2:a", "-shortest", "-c:v", "libx264", "-crf", "20", "-c:a", "aac",
                    "-b:a", "128k", "-movflags", "+faststart", out], check=True)

if __name__ == "__main__":
    main()
