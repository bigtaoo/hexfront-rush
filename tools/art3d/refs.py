"""Writes the Tripo reference prompts (art/tripo/ref/<name>.txt) for every model the game draws.

usage: python tools/art3d/refs.py [name ...]   (no names: every model without a prompt yet)
Each prompt is one subject line plus the shared style and composition lines that guard, ogre and
mine were made with, so the whole cast comes out as one set of hand-painted wooden toys. The
images come from tools/art/generate_image.sh, one per prompt; Tripo turns each image into a model.
Subjects avoid what image-to-3D cannot rebuild: thin strings, flames, lightning and floating
sparks become blobs, so a sling hangs, a bow is held, magic is a glowing crystal and a fire is
carved wooden flames.
"""
import sys
from pathlib import Path

REF = Path(__file__).resolve().parents[2] / 'art' / 'tripo' / 'ref'

TOY = ('Style: a hand-carved, hand-painted wooden toy figure for a cheerful fantasy board game. Chunky '
       'stylized toy proportions, rounded carved forms, matte enamel paint with visible brush strokes and '
       'fine wood grain showing through, slightly worn painted edges, warm earthy colours. Rich carved '
       'detail but a simple clear silhouette that reads at very small size.')
TEAM = ' Royal blue is the team colour and appears only where stated, no other blue anywhere.'
NO_TEAM = ' No blue anywhere.'
COMP = ('Composition for 3D reconstruction: one single object, whole object visible and centred, '
        'three-quarter front view from slightly above, even soft studio lighting, no cast shadow, no '
        'ground, no base plate, plain pure white background. No text, no letters, no logo, no frame.')
# buildings and props sit on a hex tile and are seen from higher up
COMP_HIGH = COMP.replace('from slightly above', 'from above at about forty degrees')

UNITS = {
    'militia': 'A peasant militia toy soldier: a stout chubby chibi farm boy about two heads tall with a big '
               'head, messy brown hair and an eager grin, a royal blue tunic with a brown leather belt, '
               'patched tan trousers, brown boots, standing with feet apart and holding a wooden pitchfork '
               'upright close against the body in the right hand.',
    'slinger': 'A slinger toy soldier: a small nimble chibi kid about two heads tall with a big head and a '
               'cheeky smile, a royal blue hood and short cape, a brown leather jerkin, a bulging satchel '
               'of round stones at the hip, standing with feet apart, the right fist raised holding a short '
               'leather sling that hangs down with a stone in its pouch.',
    'shield': 'A shieldbearer toy soldier: a stout chubby chibi soldier about two heads tall with a big head, '
              'a round steel kettle helmet and a determined face, a royal blue tunic over brown leather, '
              'standing with feet apart behind a huge round wooden shield with a royal blue rim and a '
              'bronze boss held in front on the left arm, a short sword in the right hand.',
    'bowman': 'An archer toy soldier: a lean chibi archer about two heads tall with a big head, a feathered '
              'royal blue cap and a royal blue short cape, brown leather jerkin and boots, a quiver of '
              'arrows on the back, standing with feet apart and holding a big wooden longbow upright in '
              'the left hand at the side.',
    'adept': 'A storm wizard toy figure: a young chibi wizard about two heads tall with a big head, blond '
             'hair and a happy face, a tall pointy royal blue hat and a royal blue robe with gold star '
             'patterns, standing and holding up a wooden staff topped with a big glowing yellow crystal.',
    'colossus': 'A stone golem toy figure: a huge heavy golem built of big rounded grey boulders, massive '
                'arms hanging down with fists near the ground, short thick legs, a small blocky head with '
                'two glowing yellow eyes, a royal blue cloth banner tied around its waist hanging to the '
                'knees. Much bulkier than a soldier.',
    'drake': 'A baby dragon toy figure: a small fat round orange baby dragon with a cream belly, big cute '
             'eyes, two little horns, small stubby wings folded up, a short curled tail, standing on its '
             'hind legs, wearing a royal blue saddle blanket with gold trim.',
}

BUILDINGS = {
    'base': 'A castle keep as a toy diorama piece: a small chunky sandstone castle with two round towers '
            'with crenellations and royal blue cone roofs, a royal blue roof on the keep between them, a '
            'big arched wooden gate with iron bands, and one royal blue flag on a gold pole on top. '
            'Compact footprint, about as wide as it is deep.',
    'tower': 'A watchtower as a toy diorama piece: a chunky wooden lookout tower on a round stone base, '
             'thick timber legs with cross braces, a railed lookout platform with a little bronze bell, a '
             'royal blue pointed roof and a small royal blue pennant on top. Stout, not too tall: about '
             'twice as tall as wide.',
    'barracks1': 'A small soldiers\' hut as a toy diorama piece: a chunky log cabin with a thick rounded '
                 'royal blue thatched roof, a wooden door, warm lit windows, a rack of spears beside the '
                 'door and a small royal blue pennant on the roof.',
    'barracks2': 'A timber barracks hall as a toy diorama piece: a sturdy timber-and-stone house with a '
                 'royal blue tiled gable roof, a round shield sign with two crossed swords over the door '
                 'and a small royal blue flag on the roof.',
    'barracks3': 'A stone fort as a toy diorama piece: a squat square stone fort with crenellated walls, '
                 'two royal blue banners hanging on the front wall, a royal blue roof inside the walls, an '
                 'arched wooden door and a big glowing purple gem set above the door.',
    'barracks4': 'A grand hall as a toy diorama piece: a grand sandstone hall with gold trim and gold '
                 'columns, a royal blue domed roof with a gold spire, two small gold knight statues '
                 'beside the door and a big glowing orange gem above the door.',
}

PROPS = {
    'rubble': 'A heap of rubble as a toy diorama piece: a low flat collapsed pile of warm sandstone '
              'chunks and broken bricks, a few cracked roof tiles, two snapped light wooden planks lying '
              'across it. Much wider than tall, nothing standing upright.',
    'oak': 'An oak tree as a toy diorama piece: a round chunky carved tree with a thick short brown trunk '
           'and a big puffy crown of rounded leaf clumps in warm green.',
    'pine': 'A pine tree as a toy diorama piece: a chunky carved fir tree with stacked rounded layers of '
            'dark green branches in a cone shape and a short brown trunk.',
    'snowpine': 'A snowy pine tree as a toy diorama piece: a chunky carved fir tree with stacked rounded '
                'dark green branch layers, each layer topped with thick soft white snow, a short brown trunk.',
    'cactus': 'A cactus as a toy diorama piece: a chunky green saguaro cactus with two rounded arms, '
              'carved ribs, tiny pale spines and one pink flower on top, standing in a small mound of sand.',
    'rocks': 'A boulder cluster as a toy diorama piece: three chunky rounded grey-brown boulders of '
             'different sizes huddled together with a few tufts of moss.',
    'arch': 'A rock arch as a toy diorama piece: a chunky natural sandstone arch of warm orange-tan '
            'stacked rock slabs with a round opening, a few tufts of dry grass at its feet.',
    'ice': 'Ice crystals as a toy diorama piece: a cluster of chunky pale icy white-turquoise crystals '
           'jutting up from a small mound of white snow.',
    'chest': 'A treasure chest as a toy diorama piece: a small closed wooden treasure chest with a rounded '
             'lid, gold metal trim and corners and a gold lock.',
    'hoard': 'A treasure hoard as a toy diorama piece: a big open wooden treasure chest with gold trim, '
             'overflowing with gold coins and big red and green gems, a few coins spilled in front.',
    'camp': 'A small camp as a toy diorama piece: one canvas tent with wooden poles beside a campfire of '
            'crossed logs with carved wooden orange-yellow flames.',
    'warband': 'A war camp as a toy diorama piece: two red-and-cream striped tents and a campfire of logs '
               'with carved wooden orange-yellow flames inside a low wooden palisade fence, with a small '
               'rack of spears.',
    'mystery': 'A mystery stone as a toy diorama piece: a rough upright purple rock with a big glowing '
               'purple question mark carved into its front, standing on a few small stones.',
}


def prompt(name: str) -> str:
    if name in UNITS:
        return f'{UNITS[name]}\n{TOY}{TEAM}\n{COMP}\n'
    if name in BUILDINGS:
        return f'{BUILDINGS[name]}\n{TOY}{TEAM}\n{COMP_HIGH}\n'
    return f'{PROPS[name]}\n{TOY}{NO_TEAM}\n{COMP_HIGH}\n'


def main():
    names = sys.argv[1:] or [n for n in (*UNITS, *BUILDINGS, *PROPS) if not (REF / f'{n}.txt').exists()]
    for n in names:
        (REF / f'{n}.txt').write_text(prompt(n), encoding='utf-8')
        print(n)


if __name__ == '__main__':
    main()
