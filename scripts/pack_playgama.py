"""Zip dist-playgama/ into hexfront-playgama.zip for Playgama's developer console.

usage: python scripts/pack_playgama.py [dist dir] [zip file]

index.html sits at the archive's root, entries are files only (no directory entries) and paths
use '/'. Playgama's console rejected zips made by PowerShell's Compress-Archive (backslash paths:
the uploaded game reported "Bridge never initialized"), so the archive is written here instead.
After Potion Siege's scripts/pack_playgama.py.
"""
import os
import sys
import zipfile


def pack(src, out):
    if not os.path.isfile(os.path.join(src, "index.html")):
        sys.exit(f"{src}/index.html missing: run the Playgama build first")
    if not os.path.isfile(os.path.join(src, "playgama-bridge-config.json")):
        sys.exit(f"{src}/playgama-bridge-config.json missing")
    names = []
    for root, dirs, files in os.walk(src):
        dirs.sort()
        for f in sorted(files):
            path = os.path.join(root, f)
            names.append((path, os.path.relpath(path, src).replace(os.sep, "/")))
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for path, name in names:
            z.write(path, name)
    with zipfile.ZipFile(out) as z:
        listed = z.namelist()
        assert "index.html" in listed and not any("\\" in n or n.endswith("/") for n in listed)
    size = os.path.getsize(out) / 2**20
    print(f"{out}: {len(names)} files from {src}/, {size:.1f} MB")


if __name__ == "__main__":
    pack(sys.argv[1] if len(sys.argv) > 1 else "dist-playgama", sys.argv[2] if len(sys.argv) > 2 else "../dist/hexfront-playgama.zip")
