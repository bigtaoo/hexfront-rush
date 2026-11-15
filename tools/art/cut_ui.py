"""usage: cut_ui.py <in.png> <out.webp> <max side px>: an AI image on a white background to a trimmed webp
with alpha (art/ui -> public/ui; art/STYLE.md "Interface art"). White background and enclosed white holes
bigger than 0.04% of the image become transparent; small white details (eyes, highlights) stay."""
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
src, dst, side = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(int)
mn = a.min(2); ch = a.max(2) - mn
bg = (mn > 232) & (ch < 16)
lab, n = ndimage.label(bg)
sizes = ndimage.sum(bg, lab, range(1, n + 1))
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
keep = np.zeros(n + 1, bool)
for i, s in enumerate(sizes, 1):
    keep[i] = i in border or s > 0.0004 * bg.size
m = ndimage.binary_opening(keep[lab], iterations=1, border_value=1)
alpha = Image.fromarray(np.where(m, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
out = im.convert('RGBA'); out.putalpha(alpha)
ys, xs = np.nonzero(~m)
out = out.crop((max(0, xs.min() - 4), max(0, ys.min() - 4), xs.max() + 5, ys.max() + 5))
k = side / max(out.size)
out = out.resize((round(out.width * k), round(out.height * k)), Image.LANCZOS)
out.save(dst, quality=90, method=6)
print(dst, out.size)
