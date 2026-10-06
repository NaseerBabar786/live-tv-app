# Sharpens one clip: frames -> Real-ESRGAN (realesr-general-x4v3, open) on CPU -> 1920x1080 PNG frames.
# usage: python3 upscale.py in_dir out_dir
import sys, os, glob, torch, numpy as np
from PIL import Image
from spandrel import ModelLoader
src, dst = sys.argv[1:3]; os.makedirs(dst, exist_ok=True)
torch.set_num_threads(os.cpu_count())
m = ModelLoader().load_from_file("rg.pth").model.eval()
files = sorted(glob.glob(f"{src}/*.png"))
for k, f in enumerate(files):
    im = np.asarray(Image.open(f).convert("RGB"), dtype=np.float32) / 255
    x = torch.from_numpy(im).permute(2, 0, 1)[None]
    with torch.no_grad():
        y = m(x).clamp(0, 1)[0].permute(1, 2, 0).numpy()
    out = Image.fromarray((y * 255 + 0.5).astype(np.uint8))
    # 60% AI detail + 40% plain resize keeps skin and hair texture natural (pure AI looks painted)
    base = Image.fromarray((im * 255 + 0.5).astype(np.uint8)).resize(out.size, Image.LANCZOS)
    out = Image.blend(base, out, 0.6)
    w, h = out.size; ch = int(w * 9 / 16); top = (h - ch) // 2
    out.crop((0, top, w, top + ch)).resize((1920, 1080), Image.LANCZOS).save(f"{dst}/{os.path.basename(f)}")
    if k % 20 == 0: print("upscaled", k, "/", len(files), flush=True)
