# Lip-syncs one acted clip to its voice line with the free LatentSync Space.
# usage: python3 lipsync.py sN   (needs out/sN.mp4 and out/sN-line.wav)
import sys, shutil, time
from gradio_client import Client, handle_file
i = sys.argv[1]
for space in ["fffiloni/LatentSync"]:
    for a in range(2):
        try:
            c = Client(space, verbose=False)
            r = c.predict(handle_file(f"out/{i}.mp4"), handle_file(f"out/{i}-line.wav"), api_name="/generate_lip_sync_video")
            r = r.get("video") if isinstance(r, dict) else r
            shutil.copy(r, f"out/{i}-lips.mp4"); print("lips", i, "from", space, flush=True); sys.exit(0)
        except Exception as e:
            print("lips fail", i, space, a, repr(e)[:400], flush=True); time.sleep(20)
