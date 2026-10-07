"""Tries one free Hugging Face Space on our newsreader: picture + Urdu voice line -> talking video.
Fills the Space's own API automatically: image inputs get the picture, audio inputs the voice, a prompt box
a short newsreader description, everything else its default. Usage: try_space.py <space> <picture> <voice.wav> <out.mp4>"""
import json, shutil, sys, time
from gradio_client import Client, handle_file

space, pic, wav, out = sys.argv[1:5]
PROMPT = ("A professional female TV news anchor sitting at a news desk reads the news to the camera with natural "
          "expressions, subtle head movements, blinking and small hand gestures, realistic, static camera.")
log = {"space": space}
# Known values for Spaces whose API has no defaults (LongCat demo: resolution, seed, steps, guidance).
EXTRA = {}

def kind(p):
    comp = (p.get("component") or "").lower()
    lab = ((p.get("label") or "") + " " + (p.get("parameter_name") or "")).lower()
    if comp == "image": return "image"
    if comp == "audio": return "audio"
    if comp == "video": return "video"
    if comp == "textbox": return "text"
    if comp == "api":  # no component info: go by position labels / names
        if "1st" in lab or "image" in lab: return "image"
        if "2nd" in lab or "audio" in lab: return "audio"
        if "3rd" in lab or "prompt" in lab: return "text"
    return "other"

def choices(p):
    t = p.get("type") or {}
    return t.get("enum") or [x.get("const") for x in t.get("anyOf", []) if isinstance(x, dict) and "const" in x] or None

c = Client(space, verbose=False)
api = c.view_api(return_format="dict", print_info=False)["named_endpoints"]
if "/start_session" in api:
    try: c.predict(api_name="/start_session")
    except Exception as e: log["session"] = repr(e)[:200]
best = None
for name, ep in api.items():
    ks = [kind(p) for p in ep["parameters"]]
    if "image" in ks and "audio" in ks:
        best = (name, ep); break
if not best: raise SystemExit("no image+audio endpoint: " + ", ".join(api))
name, ep = best
args = []
for p in ep["parameters"]:
    k = kind(p)
    if k == "image": args.append(handle_file(pic))
    elif k == "audio": args.append(handle_file(wav))
    elif k == "text" and not p.get("parameter_has_default"): args.append(PROMPT)
    elif k == "text" and isinstance(p.get("parameter_default"), str) and len(p["parameter_default"]) > 25: args.append(PROMPT)
    elif "max audio" in (p.get("label") or "").lower(): args.append(60)
    elif p.get("parameter_has_default"): args.append(p["parameter_default"])
    elif choices(p): args.append(choices(p)[0])
    elif p.get("python_type", {}).get("type") in ("int", "float"): args.append(EXTRA.get(len(args), 0))
    else: args.append(None)
log.update(endpoint=name, args=[a if isinstance(a, (str, int, float, bool, type(None))) else "<file>" for a in args],
           labels=[p.get("label") for p in ep["parameters"]])
print(json.dumps(log, ensure_ascii=False)[:1500], flush=True)
t = time.time()
res = c.predict(*args, api_name=name)
log["secs"] = round(time.time() - t)
def find(x):
    if isinstance(x, str) and x.endswith((".mp4", ".webm", ".mov")): return x
    if isinstance(x, dict):
        for v in x.values():
            f = find(v)
            if f: return f
    if isinstance(x, (list, tuple)):
        for v in x:
            f = find(v)
            if f: return f
    return None
f = find(res)
if not f: raise SystemExit("no video in result: " + repr(res)[:500])
shutil.copy(f, out); print("ok", out, log["secs"], "s", flush=True)
