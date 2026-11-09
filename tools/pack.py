import zipfile, os, sys
# Builds the Playgama archive. Run from the game folder; argv[1] = output zip.
# Only what the browser loads goes in: no server/, tools/ or node_modules/.
out = sys.argv[1]
z = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
for f in ['index.html', 'playgama-bridge.js', 'playgama-bridge-config.json', 'THIRD-PARTY-NOTICES.txt']:
    z.write(f, f)
for d in ['js', 'sfx', 'music', 'fonts']:
    for root, dirs, files in os.walk(d):
        dirs.sort()
        for f in sorted(files):
            p = os.path.join(root, f).replace(os.sep, '/')
            z.write(p, p)
z.close()
z = zipfile.ZipFile(out)
names = z.namelist()
print(len(names), 'files', os.path.getsize(out), 'bytes')
print([n for n in names if n.endswith('.js') or n.endswith('.html')])
