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
       "static, frozen, cartoon, plastic skin, camera shake, zoom, waving, hand gestures, raising hands, pointing")

def sh(*a):
    subprocess.run(list(a), check=True)

def length(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                          "-of", "csv=p=0", f]).decode().strip())

EDIT_SPACES = ["black-forest-labs/FLUX.1-Kontext-Dev", "Qwen/Qwen-Image-Edit", "multimodalart/Qwen-Image-Edit-Fast"]

def edit_with_space(p, out):
    """Same woman, different clothes: a free image-editing Space (FLUX Kontext / Qwen Image Edit) changes only
    the outfit of her own picture. Fills each Space's API by component: image -> picture, textbox -> instruction."""
    from gradio_client import Client, handle_file
    src = f"https://github.com/{os.environ.get('GITHUB_REPOSITORY', 'NaseerBabar786/live-tv-app')}/releases/download/channel-media/{p['picture']}.jpg"
    base = out + ".src.jpg"
    urllib.request.urlretrieve(src, base)
    for space in EDIT_SPACES:
        try:
            c = Client(space, verbose=False)
            api = c.view_api(return_format="dict", print_info=False)["named_endpoints"]
            for name, ep in api.items():
                comps = [(x.get("component") or "").lower() for x in ep["parameters"]]
                if "image" in comps and "textbox" in comps: break
            else:
                print("edit: no image+text endpoint in", space, list(api), flush=True); continue
            args, text_done = [], False
            for x, comp in zip(ep["parameters"], comps):
                if comp == "image": args.append(handle_file(base))
                elif comp == "textbox" and not text_done: args.append(p["edit"]); text_done = True
                elif x.get("parameter_has_default"): args.append(x["parameter_default"])
                else: args.append(None)
            res = c.predict(*args, api_name=name)
            def find(r):
                if isinstance(r, str) and r.lower().endswith((".png", ".jpg", ".jpeg", ".webp")): return r
                if isinstance(r, dict):
                    for v in r.values():
                        f = find(v)
                        if f: return f
                if isinstance(r, (list, tuple)):
                    for v in r:
                        f = find(v)
                        if f: return f
            f = find(res)
            if not f: print("edit: no picture from", space, repr(res)[:300], flush=True); continue
            Image.open(f).convert("RGB").resize((1280, 720), Image.LANCZOS).save(out, quality=95)
            print("edited picture with", space, flush=True); return True
        except Exception as e:
            print("edit fail", space, repr(e)[:300], flush=True)
    return False

def picture(p, out):
    url = ("https://image.pollinations.ai/prompt/" + urllib.parse.quote(p["prompt"]) +
           f"?width=1280&height=768&seed={p['seed']}&nologo=true&model=flux")
    if p.get("edit") and edit_with_space(p, out):
        return
    if p.get("edit"):
        # Same woman in a different outfit: edit her own picture (Pollinations kontext), keeping the face.
        src = f"https://github.com/{os.environ.get('GITHUB_REPOSITORY', 'NaseerBabar786/live-tv-app')}/releases/download/channel-media/{p['picture']}.jpg"
        edit = ("https://image.pollinations.ai/prompt/" + urllib.parse.quote(p["edit"]) +
                f"?model=kontext&image={urllib.parse.quote(src, safe='')}&width=1280&height=720&seed={p['seed']}&nologo=true")
        try:
            req = urllib.request.Request(edit, headers={"User-Agent": "BazaarTV-news/1.0"})
            with urllib.request.urlopen(req, timeout=240) as r, open(out, "wb") as f:
                f.write(r.read())
            im = Image.open(out).convert("RGB").resize((1280, 720), Image.LANCZOS)
            im.save(out, quality=95); print("edited picture", out, flush=True); return
        except Exception as e:
            print("edit failed, making a new picture instead:", e, flush=True)
            url = ("https://image.pollinations.ai/prompt/" + urllib.parse.quote(p["prompt"] + ". " + p["edit"]) +
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
    asyncio.run(__import__("edge_tts").Communicate(p.get("line", cfg["line"]), p.get("voice", cfg["voice"])).save(f"{out}/line.mp3"))
    img = f"{out}/{pid}.jpg"
    if not os.path.exists(img):
        picture(p, img)
    clip(img, p.get("motion", mv["motion"]), f"{out}/a.mp4")
    sh("ffmpeg", "-v", "error", "-y", "-sseof", "-0.1", "-i", f"{out}/a.mp4", "-frames:v", "1", "-q:v", "2", f"{out}/a-last.jpg")
    try:
        clip(f"{out}/a-last.jpg", p.get("motion2", mv["motion2"]), f"{out}/b.mp4"); parts = ["a", "b"]
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
