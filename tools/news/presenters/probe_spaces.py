"""Looks for free Hugging Face Spaces that can make a talking newsreader with real movement and lip-sync
(audio + picture -> video). Writes probe-spaces.json: which are running, their hardware and API."""
import json, sys
from huggingface_hub import HfApi
api = HfApi()
TERMS = ["InfiniteTalk", "S2V", "OmniAvatar", "EchoMimic", "Hallo", "MuseTalk", "FlashTalk", "StableAvatar", "MultiTalk",
         "talking head", "talking avatar", "lip sync", "LivePortrait", "FantasyTalking", "Sonic", "HunyuanVideo-Avatar",
         "KDTalker", "MEMO", "LatentSync", "audio driven", "avatar video", "Fantasy Portrait", "Ditto talking"]
out = {}
for t in TERMS:
    try:
        for s in api.list_spaces(search=t, sort="likes", limit=15):
            if s.id in out: continue
            out[s.id] = {"term": t, "likes": s.likes}
    except Exception as e:
        print("search fail", t, e)
ranked = sorted(out.items(), key=lambda kv: -(kv[1]["likes"] or 0))[:70]
res = []
for sid, info in ranked:
    try:
        rt = api.get_space_runtime(sid)
        info.update(stage=rt.stage, hardware=str(rt.hardware))
    except Exception as e:
        info.update(stage="?", err=str(e)[:120])
    if info.get("stage") == "RUNNING":
        try:
            from gradio_client import Client
            c = Client(sid, verbose=False)
            info["api"] = str(c.view_api(return_format="dict", print_info=False))[:1800]
        except Exception as e:
            info["api_err"] = str(e)[:200]
    res.append({"id": sid, **info}); print(sid, info.get("stage"), info.get("hardware"), info.get("likes"), flush=True)
json.dump(res, open(sys.argv[1], "w"), indent=1)
