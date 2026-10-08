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
def choices(p):
    t = p.get("type") or {}
    return t.get("enum") or [x.get("const") for x in t.get("anyOf", []) if isinstance(x, dict) and "const" in x] or None

def build(wrap):
    args = []
    for p in ep["parameters"]:
        k = kind(p)
        if k == "video": args.append({"video": handle_file(vid)} if wrap else handle_file(vid))
        elif k == "audio": args.append(handle_file(wav))
        elif p.get("parameter_has_default") and p["parameter_default"] is not None: args.append(p["parameter_default"])
        elif choices(p): args.append(choices(p)[-1])
        else: args.append(p.get("parameter_default"))
    return args
print(json.dumps({"endpoint": name, "labels": [p.get("label") for p in ep["parameters"]]}, ensure_ascii=False), flush=True)
t = time.time()
res = None
for wrap in (False, True):
    try:
        res = c.predict(*build(wrap), api_name=name)
        if res: break
    except Exception as e:
        print("try wrap=%s failed: %r" % (wrap, e)[:600], flush=True)
print("args", [a if isinstance(a, (str, int, float, bool, type(None))) else "<file>" for a in build(False)], flush=True)
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
