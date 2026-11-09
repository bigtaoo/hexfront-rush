import { Graphics, type DestroyOptions, type GraphicsContext } from 'pixi.js';

// Pixi 8.22's Graphics.destroy frees the graphic's own GraphicsContext only when it is called with
// no options, so every `destroy({ children: true })` of a tree (home rebuilds, the side boards, the
// HUD's boss card and modifiers, the result screen, buttons) left each Graphics' context, and the
// GPU buffers the renderer keeps for it, behind until Pixi's idle sweep: about 500 a stage run,
// over 1100 alive after a dozen runs (npm run memruns, ref/design/memory-audit.md). This frees the
// owned context whatever the options. A shared context (passed in, or after clone()) is never
// owned and stays for its other users.

type Patched = { destroy(options?: DestroyOptions): void; _ownedContext: GraphicsContext | null };

let patched = false;

/** Makes Graphics.destroy free the context it made for itself. Idempotent; call once at boot. */
export function patchGraphicsDestroy(): void {
  if (patched) return;
  patched = true;
  const proto = Graphics.prototype as unknown as Patched;
  const destroy = proto.destroy;
  proto.destroy = function (this: Patched, options?: DestroyOptions) {
    const owned = this._ownedContext;
    destroy.call(this, options);
    if (owned && !owned.destroyed) owned.destroy();
  };
}
