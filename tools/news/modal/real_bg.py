"""Make a reader picture look like a real camera photo before the talking-video step (owner 2026-10-10: "everything
behind should look real"). The AI studio behind the reader has garbled screen text, so we cut the reader out and put
her back over the same studio, strongly blurred, the way a real 85 mm broadcast lens shows a studio, plus a little
film grain and natural colour so the whole frame reads as one photo.

  python real_bg.py in.jpg out.jpg [desk_top]

desk_top (0-1, default 0.76) is where the desk's front edge starts: the desk is in front of the reader, so it stays sharp.
"""
import sys

from PIL import Image, ImageFilter, ImageEnhance
import numpy as np
from rembg import remove, new_session

src, dst = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGB")
mask = remove(img, session=new_session("u2net_human_seg"), only_mask=True)
desk = float(sys.argv[3]) if len(sys.argv) > 3 else 0.76
m = np.asarray(mask).astype(np.float32)
rows = np.clip((np.arange(img.height) / img.height - (desk - 0.03)) / 0.03, 0, 1)[:, None] * 255
mask = Image.fromarray(np.maximum(m, rows).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))
back = img.filter(ImageFilter.GaussianBlur(max(8, img.width // 110)))
back = ImageEnhance.Brightness(back).enhance(0.9)
out = Image.composite(img, back, mask)
a = np.asarray(out).astype(np.float32)
a += np.random.default_rng(7).normal(0, 3.0, a.shape)
out = Image.fromarray(a.clip(0, 255).astype(np.uint8))
out.save(dst, quality=95)
print("saved", dst, out.size)
