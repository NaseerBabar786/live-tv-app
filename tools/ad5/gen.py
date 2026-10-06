# Makes the raw parts of Cable TV Video Ad 5 in GitHub Actions:
# a key picture per scene (Pollinations, free), a 4-5 s acted clip from it (Wan 2.2 image-to-video
# on a free Hugging Face Space), and the Urdu voice lines (Edge TTS). Everything goes to out/.
import json, os, sys, time, shutil, asyncio, urllib.parse, urllib.request
from PIL import Image

S = json.load(open("scenes.json"))
ONLY = os.environ.get("ONLY", "").split(",") if os.environ.get("ONLY") else None
SEED = int(os.environ.get("SEED", "5151"))
os.makedirs("out", exist_ok=True)

def prompt_for(sc):
    p = sc["image"].format(**S["people"])
    return p + ". " + S["style"]

def picture(sc):
    path = f"out/{sc['id']}.jpg"
    keep = f"keep/{sc['id']}.jpg"
    if os.path.exists(keep):
        shutil.copy(keep, path); return path
    url = ("https://image.pollinations.ai/prompt/" + urllib.parse.quote(prompt_for(sc)) +
           f"?width=1280&height=768&seed={SEED + int(sc['id'][1:])}&nologo=true&model=flux")
    for a in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "BazaarTV-ad5/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r, open(path, "wb") as f:
                f.write(r.read())
            im = Image.open(path).convert("RGB")
            im = im.crop((0, 0, im.width, int(im.height * 0.93))).resize((1280, 720), Image.LANCZOS)
            im.save(path, quality=95)
            print("picture", path, flush=True)
            return path
        except Exception as e:
            print("picture retry", a, e, flush=True); time.sleep(15 * (a + 1))
    raise SystemExit("no picture for " + sc["id"])

SPACES = [s for s in os.environ.get("SPACES", "zerogpu-aoti/wan2-2-fp8da-aoti-faster,multimodalart/wan2-1-fast,Lightricks/ltx-video-distilled").split(",") if s]

def clip(sc, img):
    from gradio_client import Client, handle_file
    neg = "blurry, distorted face, deformed hands, extra fingers, text, subtitles, watermark, logo, static, frozen, cartoon"
    for space in SPACES:
        for a in range(2):
            try:
                c = Client(space, verbose=False)
                if "ltx" in space.lower():
                    res = c.predict(sc["motion"], neg, handle_file(img), None, 448, 800, "image-to-video",
                                    min(sc["dur"], 5), 9, 42, False, 1, True, api_name="/image_to_video")
                elif "wan2-1" in space:
                    res = c.predict(handle_file(img), sc["motion"], 480, 832, neg, min(sc["dur"], 5), 1, 4, 42, False,
                                    api_name="/generate_video")
                else:
                    res = c.predict(handle_file(img), sc["motion"], 6, neg, min(sc["dur"], 5), 1, 1, 42, False,
                                    api_name="/generate_video")
                v = res[0]
                v = v.get("video") if isinstance(v, dict) else v
                dst = f"out/{sc['id']}.mp4"
                shutil.copy(v, dst)
                print("clip", dst, "from", space, flush=True)
                return dst
            except Exception as e:
                print("clip fail", sc["id"], space, a, repr(e)[:300], flush=True)
                time.sleep(20)
    return None

async def voices():
    import edge_tts
    lines = [(sc["id"], sc["voice"], sc["ur"]) for sc in S["scenes"]] + [("end", S["end"]["voice"], S["end"]["ur"])]
    for sid, who, text in lines:
        name, pitch, rate = S["voices"][who]
        for a in range(4):
            try:
                await edge_tts.Communicate(text, name, pitch=pitch, rate=rate).save(f"out/{sid}.mp3")
                print("voice", sid, flush=True); break
            except Exception as e:
                print("voice retry", sid, e, flush=True); time.sleep(5)

asyncio.run(voices())
for sc in S["scenes"]:
    if ONLY and sc["id"] not in ONLY: continue
    img = picture(sc)
    if os.environ.get("PICTURES_ONLY") != "1":
        clip(sc, img)
