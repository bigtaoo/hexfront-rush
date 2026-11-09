"""Cuts a generated sheet of several objects on a white background into one picture per object.
usage: python split_sheet.py <sheet> <rows>x<cols>|auto <out dir> <name>... [--min 0.002]
The background is removed as in cutout.py, then every connected piece of what is left goes to
the grid cell holding its centre, so an object made of several pieces (a ring of drones, a
spark beside a puddle) stays together and one reaching into the next cell keeps its tip. Names
go row by row; "-" skips a cell. A name may carry hole seeds, fractions of its own crop:
`pendant@0.5,0.4` (as cutout.py's holes, for closed shapes the background shows through).
Writes <out dir>/<name>.png, cut out (RGBA), which the packers take as they are (cutout.py
leaves a picture with transparency alone). Pieces under --min of the sheet's area are dropped
unless they sit in a cell with a bigger one.
"auto" ignores the grid, for a sheet whose rows came out uneven: every piece over --min is an
object, smaller ones join the nearest object, and the objects are named in reading order (rows
by their centres, then left to right)."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).parent))
from cutout import background_mask  # noqa: E402

MARGIN = 4


def parse_name(arg):
    name, _, seeds = arg.partition("@")
    holes = []
    if seeds:
        vals = [float(v) for v in seeds.replace(";", ",").split(",")]
        holes = list(zip(vals[0::2], vals[1::2]))
    return name, holes


def auto_cells(centres, areas, least):
    """{object index in reading order: [(label, area)]}: the big pieces, each with the small
    pieces nearest to it."""
    big = [k for k, a in enumerate(areas) if a >= least]
    groups = {k: [(k + 1, areas[k])] for k in big}
    for k, a in enumerate(areas):
        if a < least and big:
            near = min(big, key=lambda b: np.hypot(*np.subtract(centres[k], centres[b])))
            groups[near].append((k + 1, a))
    size = np.median([np.sqrt(areas[k]) for k in big]) if big else 0
    rows = []
    for k in sorted(big, key=lambda b: centres[b][0]):
        if rows and centres[k][0] - centres[rows[-1][0]][0] < size:
            rows[-1].append(k)
        else:
            rows.append([k])
    order = [k for row in rows for k in sorted(row, key=lambda b: centres[b][1])]
    for i, k in enumerate(order):
        print(f"  object {i}: centre {int(centres[k][1])},{int(centres[k][0])}")
    return {i: groups[k] for i, k in enumerate(order)}


def main():
    args = sys.argv[1:]
    min_share = 0.002
    if "--min" in args:
        i = args.index("--min")
        min_share = float(args[i + 1])
        args = args[:i] + args[i + 2:]
    src, grid, out, names = args[0], args[1], Path(args[2]), args[3:]
    im = Image.open(src).convert("RGBA")
    fg = np.asarray(ImageChops.invert(background_mask(im.convert("RGB")))) > 0
    labels, n = ndimage.label(fg)
    areas = ndimage.sum(fg, labels, range(1, n + 1))
    centres = ndimage.center_of_mass(fg, labels, range(1, n + 1))
    H, W = fg.shape
    if grid == "auto":
        cells = auto_cells(centres, areas, min_share * H * W)
        if len(names) != len(cells):
            sys.exit(f"{len(cells)} objects, {len(names)} names")
    else:
        rows, cols = (int(v) for v in grid.split("x"))
        if len(names) != rows * cols:
            sys.exit(f"{rows * cols} cells, {len(names)} names")
        cells = {}
        for k, ((cy, cx), area) in enumerate(zip(centres, areas), start=1):
            cell = min(int(cy / H * rows), rows - 1) * cols + min(int(cx / W * cols), cols - 1)
            cells.setdefault(cell, []).append((k, area))
    out.mkdir(parents=True, exist_ok=True)
    for cell, arg in enumerate(names):
        if arg == "-":
            continue
        name, holes = parse_name(arg)
        parts = cells.get(cell, [])
        if not parts or max(a for _, a in parts) < min_share * H * W:
            print(f"{name}: nothing in cell {cell}")
            continue
        mask = np.isin(labels, [k for k, _ in parts])
        ys, xs = np.nonzero(mask)
        box = (max(0, xs.min() - MARGIN), max(0, ys.min() - MARGIN), min(W, xs.max() + 1 + MARGIN), min(H, ys.max() + 1 + MARGIN))
        piece = im.crop(box)
        m = Image.fromarray((mask[box[1]:box[3], box[0]:box[2]] * 255).astype(np.uint8))
        if holes:
            # the light background inside a closed shape, flooded from each seed
            r, g, b = piece.convert("RGB").split()
            hi = ImageChops.lighter(ImageChops.lighter(r, g), b)
            lo = ImageChops.darker(ImageChops.darker(r, g), b)
            open_ = ImageChops.multiply(lo.point(lambda v: 255 if v >= 130 else 0),
                                        ImageChops.subtract(hi, lo).point(lambda v: 255 if v <= 30 else 0))
            for fx, fy in holes:
                ImageDraw.floodfill(open_, (round(fx * piece.width), round(fy * piece.height)), 128)
            hole = np.asarray(open_) == 128
            m = Image.fromarray(np.where(hole, 0, np.asarray(m)).astype(np.uint8))
        piece.putalpha(m.filter(ImageFilter.GaussianBlur(0.6)))
        piece.save(out / f"{name}.png", optimize=True)
        print(f"{name}: {piece.size[0]}x{piece.size[1]}")


if __name__ == "__main__":
    main()
