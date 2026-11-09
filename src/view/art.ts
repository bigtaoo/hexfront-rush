// The drawn art (art/STYLE.md): one atlas, src/assets/atlas.webp + atlas.json, packed by
// tools/art/pack.py from the processed sprites. Units and buildings come in a blue and a red
// picture (`<name>_blue`, `<name>_red`); props have one. A texture pixel is 1 / PPU view units
// (one hex radius = 1), so a sprite's size is its frame's size: nothing here lists heights.
//
// Every picture stands on its foot: anchor (0.5, 1), the bottom of the frame on the ground point
// the caller places it at. Units are drawn facing right; a negative x scale turns them.

import { Assets, Sprite, Spritesheet, Texture, type SpritesheetData } from 'pixi.js';
import atlasJson from '../assets/atlas.json';
import atlasUrl from '../assets/atlas.webp?url';
import type { Obstacle } from '../sim/map';
import { TEAM_BLUE, type BuildingType, type UnitKey } from '../sim/rules';

/** Texture pixels per view unit: tools/art/sprites.py draws at TEX_K = 2 over a 38 px hex radius. */
export const PPU = 76;
/** Where a building, prop or map event stands its foot, below its tile's centre (view units). */
export const TILE_FOOT = 0.42;

let frames: Record<string, Texture> | null = null;

/** Loads the atlas once (boot awaits it before the first frame). */
export async function loadArt(): Promise<void> {
  if (frames) return;
  const tex = await Assets.load<Texture>({ src: atlasUrl, data: { autoGenerateMipmaps: true } });
  const sheet = new Spritesheet(tex, atlasJson as unknown as SpritesheetData);
  frames = await sheet.parse();
}

/** A frame by name; an empty texture if the atlas lacks it (or is not loaded, as in tests). */
export function tex(name: string): Texture {
  return frames?.[name] ?? Texture.EMPTY;
}

const side = (team: number) => (team === TEAM_BLUE ? 'blue' : 'red');

export const unitTex = (type: UnitKey, team: number): Texture => tex(`${type}_${side(team)}`);
export const guardTex = (team: number): Texture => tex(`guard_${side(team)}`);

/** Barracks by rarity: a wooden hut, a timber hall, a stone fort, a golden hall. */
export function buildingTex(type: BuildingType, team: number, rarity = 0): Texture {
  const name = type === 'barracks' ? `barracks${Math.min(4, Math.max(1, rarity + 1))}` : type;
  return tex(`${name}_${side(team)}`);
}
export const rubbleTex = (): Texture => tex('rubble');
/** chest, hoard, camp, warband */
export const eventTex = (key: string): Texture => tex(key);
export const mysteryTex = (): Texture => tex('mystery');

/** The prop on an obstacle tile: the deco roll picks a variant (an oak or a pine in the meadow, an
 *  arch among the desert's rocks) and whether it is mirrored. */
export function obstacleTex(kind: Obstacle, deco: number, theme: string): { t: Texture; flip: boolean } {
  const v = deco / 1000;
  let name: string;
  switch (kind) {
    case 'tree':
      name = v < 0.3 ? 'pine' : 'oak';
      break;
    case 'pine':
      name = 'snowpine';
      break;
    case 'rock':
      name = theme === 'desert' && v > 0.6 ? 'arch' : 'rocks';
      break;
    default:
      name = kind || 'rocks';
  }
  return { t: tex(name), flip: deco % 2 === 1 };
}

/** The card face's picture for an offer key (mine, tower, bar1..3, myst), in the local team's colour. */
export function offerTex(key: string, team: number): Texture {
  switch (key) {
    case 'mine':
      return buildingTex('mine', team);
    case 'tower':
      return buildingTex('tower', team);
    case 'myst':
      return mysteryTex();
    default:
      return buildingTex('barracks', team, Number(key.slice(3)) - 1);
  }
}

/** Height and width of a texture in view units. */
export const artH = (t: Texture): number => t.height / PPU;
export const artW = (t: Texture): number => t.width / PPU;

/** A sprite standing on its foot at (0, footY), PPU-scaled; `face` < 0 mirrors it. */
export function artSprite(t: Texture, footY = 0, face = 1): Sprite {
  const s = new Sprite({ texture: t, anchor: { x: 0.5, y: 1 } });
  s.position.set(0, footY);
  s.scale.set(face / PPU, 1 / PPU);
  return s;
}
