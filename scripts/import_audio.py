"""Imports Hexfront Rush's sounds from CC0 sources (see THIRD-PARTY-NOTICES.txt).
Already-processed mp3s from Holy Kicker are copied; raw Kenney oggs are trimmed, peak-normalised
to -1 dBFS and encoded mono 96 kbps. Run from the game folder: python scripts/import_audio.py (writes into public/)"""
import os, re, shutil, subprocess

HK = 'D:/standing/client/public/audio/sfx/'
CORGI = 'D:/standing/art/reskin/corgi/game/audio/'
K = 'D:/standing/art/audio/source/kenney/'
COPY = {
    'sfx/shoot.mp3': HK + 'swish.mp3',      # qubodup swosh-05 (OGA, CC0)
    'sfx/quest.mp3': HK + 'gem.mp3',        # Kenney interface select_002
    'sfx/go.mp3': HK + 'wave.mp3',          # Kenney impactBell_heavy_000
    'music/battle.mp3': CORGI + 'music/battle.mp3',  # HydroGene, OGA, CC0
    'music/lobby.mp3': CORGI + 'music/lobby.mp3',    # TinyWorlds, OGA, CC0
}
IMP = K + 'kenney_impact-sounds/Audio/'
PIZ = K + 'kenney_music-jingles/Audio/Pizzicato jingles/'
# the wooden-toy look sounds like one: wood knocks for the pieces and the buttons, a pizzicato
# box for the jingles (the same melodies as the 8-bit ones before)
RAW = {
    'sfx/tap.mp3': IMP + 'impactWood_light_002.ogg',
    'sfx/hit.mp3': IMP + 'impactWood_light_000.ogg',
    'sfx/melee.mp3': IMP + 'impactWood_medium_001.ogg',
    'sfx/build.mp3': IMP + 'impactPlank_medium_000.ogg',
    'sfx/spawn.mp3': IMP + 'footstep_wood_001.ogg',
    'sfx/pop.mp3': K + 'kenney_rpg-audio/Audio/bookPlace1.ogg',
    'sfx/destroy.mp3': IMP + 'impactWood_heavy_000.ogg',
    'sfx/win.mp3': PIZ + 'jingles_PIZZI03.ogg',
    'sfx/lose.mp3': PIZ + 'jingles_PIZZI00.ogg',
    'sfx/legend.mp3': PIZ + 'jingles_PIZZI12.ogg',
    'sfx/coin.mp3': K + 'kenney_rpg-audio/Audio/handleCoins.ogg',
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
