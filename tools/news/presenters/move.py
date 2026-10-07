"""Makes a MOVING newsreader sample (head, shoulders, hands, expressions) instead of a still photo with lips.

1. waist-up picture from Pollinations (free), 2. two 5 s parts from the free Wan 2.2 image-to-video Space
(the second starts from the last frame of the first), 3. joined and slowed to cover the voice line.
Usage: python3 tools/news/presenters/move.py <anchor id> <outdir>   -> <outdir>/<id>.jpg, <id>-move.mp4, line.mp3
"""
import asyncio, json, os, shutil, subprocess, sys, time, urllib.parse, urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SPACES = ["zerogpu-aoti/wan2-2-fp8da-aoti-faster", "multimodalart/wan2-1-fast"]
NEG = ("blurry, distorted face, deformed hands, extra fingers, extra people, text, subtitles, watermark, logo, "
       "static, frozen, cartoon, plastic skin, camera shake, zoom")

def sh(*a):
    subprocess.run(list(a), check=True)

def length(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                          "-of", "csv=p=0", f]).decode().strip())

def picture(p, out):
    url = ("https://image.pollinations.ai/prompt/" + urllib.parse.quote(p["prompt"]) +
           f"?width=1280&height=768&seed={p['seed']}&nologo=true&model=flux")
    for a in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "BazaarTV-news/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r, open(out, "wb") as f:
                f.write(r.read())
            im = Image.open(out).convert("RGB")
            im = im.crop((0, 0, im.width, int(im.height * 0.93))).resize((1280, 720), Image.LANCZOS)
            im.save(out, quality=95); print("picture", out, flush=True); return
        except Exception as e:
            print("picture retry", a, e, flush=True); time.sleep(15 * (a + 1))
    raise SystemExit("no picture")

def clip(img, prompt, dst):
    from gradio_client import Client, handle_file
    for space in SPACES:
        for a in range(2):
            try:
                c = Client(space, verbose=False)
                if "wan2-1" in space:
                    res = c.predict(handle_file(img), prompt, 480, 832, NEG, 5, 1, 4, 42, False, api_name="/generate_video")
                else:
                    res = c.predict(handle_file(img), prompt, 6, NEG, 5, 1, 1, 42, False, api_name="/generate_video")
                v = res[0]; v = v.get("video") if isinstance(v, dict) else v
                shutil.copy(v, dst); print("clip", dst, "from", space, flush=True); return
            except Exception as e:
                print("clip fail", space, a, repr(e)[:300], flush=True); time.sleep(20)
    raise SystemExit("no clip")

def main():
    pid, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    cfg = json.load(open(os.path.join(HERE, "presenters.json")))
    mv = cfg["moving"]; p = next(x for x in mv["people"] if x["id"] == pid)
    asyncio.run(__import__("edge_tts").Communicate(cfg["line"], cfg["voice"]).save(f"{out}/line.mp3"))
    img = f"{out}/{pid}.jpg"
    if not os.path.exists(img):
        picture(p, img)
    clip(img, mv["motion"], f"{out}/a.mp4")
    sh("ffmpeg", "-v", "error", "-y", "-sseof", "-0.1", "-i", f"{out}/a.mp4", "-frames:v", "1", "-q:v", "2", f"{out}/a-last.jpg")
    try:
        clip(f"{out}/a-last.jpg", mv["motion2"], f"{out}/b.mp4"); parts = ["a", "b"]
    except SystemExit:
        parts = ["a"]
    with open(f"{out}/parts.txt", "w") as f:
        for x in parts:
            f.write(f"file '{x}.mp4'\n")
    sh("ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", f"{out}/parts.txt", "-an",
       "-vf", "scale=1280:720:flags=lanczos,fps=25,setsar=1", "-c:v", "libx264", "-crf", "16", f"{out}/joined.mp4")
    need = length(f"{out}/line.mp3") + 0.8; have = length(f"{out}/joined.mp4")
    # Slow down a little if the parts are shorter than the line (never more than 1.35x).
    k = max(1.0, min(1.35, need / have))
    sh("ffmpeg", "-v", "error", "-y", "-i", f"{out}/joined.mp4", "-vf", f"setpts={k:.3f}*PTS,fps=25",
       "-c:v", "libx264", "-crf", "16", f"{out}/{pid}-move.mp4")
    print("move", pid, "parts", parts, "line", need, "video", have * k, flush=True)

if __name__ == "__main__":
    main()
