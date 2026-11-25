// What replaces a minimap on a map only a little bigger than the screen: one button at the top
// right of the play area that zooms out to the whole map and back (Camera.setOverview). It is only
// there when the play zoom actually leaves part of the map off screen (Camera.canZoom), and it
// hides wherever the HUD hides -- behind a panel, and in the menu's demo match.
//
// IT USED TO DRAW EDGE MARKERS TOO: discs with arrow tails on the edge of the play area, pointing
// at map events still waiting and pinging for a few seconds at what had just happened off screen
// (an event claimed, the castle hit, a building lost, a big barracks raised by the rival). The
// player called that feature redundant and took it out, and the reasons hold: the map is a little
// over one screen tall, so everything a marker pointed at is a second of panning or one tap on
// this button away, and the markers themselves were up to six badges stuck around the board that
// the eye reads as UI to deal with -- on a board the same player has twice called cluttered. What
// they pointed at is drawn on the board already, and the overview shows all of it at once. D104.
import { Container } from 'pixi.js';
import type { Frame } from './frame';
import { liveGraphics } from './pen';
import { WOOD } from './viewConst';

/** Button radius, screen pixels. */
const BR = 22;

export class OverviewBtn {
  readonly root = new Container();
  private back = liveGraphics();
  /** Where it was drawn last frame, for `hit`: null when it is not on screen. */
  private at: { x: number; y: number } | null = null;

  constructor() {
    this.root.addChild(this.back.g);
  }

  draw(f: Frame, look: boolean): void {
    const cam = f.cam, p = this.back.p.clear();
    this.at = null;
    if (!look || f.ui.demo || !cam.canZoom) return;
    const x = cam.W - BR - 10, y = cam.hudTop + BR + 10;
    this.at = { x, y };
    // a raised wooden button like the page's (sound, pause), the magnifier burnt into it in walnut;
    // minus in the lens to zoom out, plus to come back
    p.circle(x, y + 3, BR, WOOD.rim);
    p.circle(x, y, BR, WOOD.face, WOOD.rim, 2);
    p.circle(x, y - BR * 0.42, BR * 0.5, WOOD.hi);
    p.circle(x - 3, y - 3, 9, 'rgba(255,248,230,0.55)', WOOD.ink, 2.8);
    p.line([x + 3.5, y + 3.5, x + 11, y + 11], WOOD.ink, 3.8, 'round');
    p.line([x - 7.5, y - 3, x + 1.5, y - 3], WOOD.ink, 2.4, 'round');
    if (cam.overview) p.line([x - 3, y - 7.5, x - 3, y + 1.5], WOOD.ink, 2.4, 'round');
  }

  /** Whether a tap at a screen point is on the button. */
  hit(sx: number, sy: number): boolean {
    const b = this.at;
    return !!b && Math.hypot(sx - b.x, sy - b.y) <= BR + 6;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
