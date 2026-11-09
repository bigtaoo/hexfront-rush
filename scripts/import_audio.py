"""Imports Hexfront Rush's sounds from CC0 sources (see THIRD-PARTY-NOTICES.txt).
Already-processed mp3s from Holy Kicker are copied; raw Kenney oggs are trimmed, peak-normalised
to -1 dBFS and encoded mono 96 kbps. Run from the game folder: python scripts/import_audio.py (writes into public/)"""
import os, re, shutil, subprocess

HK = 'D:/standing/client/public/audio/sfx/'
CORGI = 'D:/standing/art/reskin/corgi/game/audio/'
K = 'D:/standing/art/audio/source/kenney/'
COPY = {
    'sfx/tap.mp3': HK + 'tap.mp3',          # Kenney interface click_002
    'sfx/hit.mp3': HK + 'hit.mp3',          # Kenney impactGeneric_light_003
    'sfx/shoot.mp3': HK + 'swish.mp3',      # qubodup swosh-05 (OGA, CC0)
    'sfx/build.mp3': HK + 'thump.mp3',      # Kenney impactSoft_heavy_000
    'sfx/pop.mp3': HK + 'pop.mp3',          # Kenney interface drop_002
    'sfx/quest.mp3': HK + 'gem.mp3',        # Kenney interface select_002
    'sfx/go.mp3': HK + 'wave.mp3',          # Kenney impactBell_heavy_000
    'sfx/destroy.mp3': HK + 'boom.mp3',     # Kenney sci-fi explosionCrunch_001
    'sfx/win.mp3': CORGI + 'sfx/cleared.mp3',    # Kenney 8-Bit jingles NES03
    'sfx/lose.mp3': CORGI + 'sfx/heroDown.mp3',  # Kenney 8-Bit jingles NES00
    'sfx/legend.mp3': CORGI + 'sfx/levelUp.mp3', # Kenney 8-Bit jingles NES12
    'music/battle.mp3': CORGI + 'music/battle.mp3',  # HydroGene, OGA, CC0
    'music/lobby.mp3': CORGI + 'music/lobby.mp3',    # TinyWorlds, OGA, CC0
}
RAW = {
    'sfx/coin.mp3': K + 'kenney_rpg-audio/Audio/handleCoins.ogg',
    'sfx/spawn.mp3': K + 'kenney_interface-sounds/Audio/drop_001.ogg',
    'sfx/beep.mp3': K + 'kenney_interface-sounds/Audio/tick_001.ogg',
    'sfx/nothing.mp3': K + 'kenney_interface-sounds/Audio/minimize_001.ogg',
    'sfx/error.mp3': K + 'kenney_interface-sounds/Audio/error_004.ogg',
}
os.makedirs('public/sfx', exist_ok=True)
os.makedirs('public/music', exist_ok=True)
os.chdir('public')
for dst, src in COPY.items():
    shutil.copyfile(src, dst)
trim = 'silenceremove=start_periods=1:start_threshold=-55dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse'
for dst, src in RAW.items():
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', trim + ',volumedetect', '-f', 'null', '-'],
                       capture_output=True, text=True)
    peak = float(re.search(r'max_volume: (-?[\d.]+) dB', r.stderr).group(1))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', f'{trim},volume={-1 - peak}dB',
                    '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', dst], check=True)
print('ok')
