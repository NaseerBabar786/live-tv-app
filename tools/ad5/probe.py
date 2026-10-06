# Probe free Hugging Face Spaces that make video, print their API, try one short clip.
import sys, traceback, shutil, os
from gradio_client import Client
SPACES = sys.argv[1:] or [
  "Lightricks/ltx-video-distilled",
  "zerogpu-aoti/wan2-2-fp8da-aoti-faster",
  "multimodalart/wan2-1-fast",
  "Wan-AI/Wan2.2-5B",
  "r3gm/wan2-2-fp8da-aoti-preview",
  "KingNish/ltx-video-distilled",
]
os.makedirs("out", exist_ok=True)
for s in SPACES:
    print("=====", s, flush=True)
    try:
        c = Client(s, verbose=False)
        c.view_api(all_endpoints=False, print_info=True)
    except Exception as e:
        print("FAIL", s, repr(e)[:400], flush=True)
