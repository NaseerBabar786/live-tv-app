"""Lip-syncs a newsreader clip with a free Hugging Face Space: video + voice -> same video with matching lips.
Finds the Space's endpoint that takes a video and an audio, fills the rest with defaults.
Usage: lipsync_space.py <space> <video.mp4> <voice.wav> <out.mp4>"""
import json, shutil, sys, time
from gradio_client import Client, handle_file

space, vid, wav, out = sys.argv[1:5]

def kind(p):
    comp = (p.get("component") or "").lower()
    lab = ((p.get("label") or "") + " " + (p.get("parameter_name") or "")).lower()
    if comp in ("video", "audio", "image"): return comp
    if comp in ("file", "api"):
        if "video" in lab or "face" in lab: return "video"
        if "audio" in lab or "speech" in lab or "voice" in lab: return "audio"
    return "other"

c = Client(space, verbose=False)
api = c.view_api(return_format="dict", print_info=False)["named_endpoints"]
best = next(((n, ep) for n, ep in api.items() if {"video", "audio"} <= {kind(p) for p in ep["parameters"]}), None)
if not best: raise SystemExit("no video+audio endpoint: " + json.dumps({n: [p.get("label") for p in ep["parameters"]] for n, ep in api.items()}, ensure_ascii=False)[:1500])
name, ep = best
args = []
for p in ep["parameters"]:
    k = kind(p)
    if k == "video": args.append({"video": handle_file(vid)} if (p.get("component") or "").lower() == "video" else handle_file(vid))
    elif k == "audio": args.append(handle_file(wav))
    elif p.get("parameter_has_default"): args.append(p["parameter_default"])
    else: args.append(None)
print(json.dumps({"endpoint": name, "labels": [p.get("label") for p in ep["parameters"]]}, ensure_ascii=False), flush=True)
t = time.time()
res = c.predict(*args, api_name=name)
print("secs", round(time.time() - t), str(res)[:500], flush=True)
def find(r):
    if isinstance(r, str) and r.endswith((".mp4", ".webm", ".mov")): return r
    if isinstance(r, dict):
        for v in r.values():
            f = find(v)
            if f: return f
    if isinstance(r, (list, tuple)):
        for v in r:
            f = find(v)
            if f: return f
f = find(res)
if not f: raise SystemExit("no video in result")
shutil.copy(f, out)
