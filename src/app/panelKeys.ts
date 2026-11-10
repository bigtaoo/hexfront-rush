// The keyboard on the HTML panels. Esc goes back, Enter / Space take the panel's main button (on
// the campaign map the newest open stage), and ← / → turn the campaign's chapters and the
// leaderboard's tabs. A key clicks the button, so it does exactly what a tap does. When a panel
// opens after a key, focus lands on its main button so Tab goes on from there; after a tap nothing
// keeps focus (no stale ring, no stray Enter).

import type { Panel } from './dom';

type Keys = { back?: readonly string[]; go?: readonly string[]; prev?: string; next?: string };

/** Button ids per panel; the first usable one (shown, enabled) of a list wins. */
export const PANEL_KEYS: Readonly<Record<Panel, Keys>> = {
  menu: { go: ['playBtn'] },
  howto: { back: ['howtoOk'], go: ['howtoOk'] },
  campaign: { back: ['campBack'], go: ['stageLast'], prev: 'chPrev', next: 'chNext' },
  board: { back: ['boardBack'], prev: 'boardStars', next: 'boardDaily' },
  brief: { back: ['briefBack'], go: ['briefGo'] },
  online: { back: ['onlineBack'] },
  result: { back: ['menuBtn'], go: ['nextBtn', 'againBtn'] },
  pause: { back: ['pResume'], go: ['pResume'] },
  ach: { back: ['achBack'] },
  settings: { back: ['setBack'] },
};

const GO = new Set(['Enter', 'NumpadEnter', 'Space']);

/** The button a key presses on this panel, or null when the key means nothing there. */
export function panelButton(panel: Panel | null, code: string, usable: (id: string) => boolean): string | null {
  if (!panel) return null;
  const k = PANEL_KEYS[panel];
  const list =
    code === 'Escape' ? k.back
    : GO.has(code) ? k.go
    : code === 'ArrowLeft' && k.prev ? [k.prev]
    : code === 'ArrowRight' && k.next ? [k.next]
    : undefined;
  return list?.find(usable) ?? null;
}

/** The button a freshly opened panel focuses after a key: its main one, else its way back. */
export function focusTarget(panel: Panel, usable: (id: string) => boolean): string | null {
  const k = PANEL_KEYS[panel];
  return [...(k.go ?? []), ...(k.back ?? [])].find(usable) ?? null;
}

/** Shown and enabled: a key may press it. */
export function usableButton(id: string): boolean {
  const el = document.getElementById(id);
  return !!el && el.offsetParent !== null && !(el as HTMLButtonElement).disabled;
}

/** A control the player reached with Tab: Enter / Space press it natively, not the panel's main button. */
export function keyboardFocused(t: EventTarget | null): t is HTMLElement {
  if (!(t instanceof HTMLElement) || t === document.body || t.offsetParent === null) return false;
  try {
    return t.matches(':focus-visible');
  } catch {
    return false;
  }
}

let byKey = false;
/** The last thing the player did was a key (true) or a tap / click (false). */
export function noteInput(key: boolean): void {
  byKey = key;
}

/** On a panel change: drop the focus left behind, and after a key put it on the new panel's main button. */
export function settleFocus(panel: Panel | null): void {
  const a = document.activeElement;
  const host = panel ? document.getElementById(panel) : null;
  if (a instanceof HTMLElement && a !== document.body && !(host && host.contains(a))) a.blur();
  if (!panel || !byKey || (host && host.contains(document.activeElement))) return;
  const id = focusTarget(panel, usableButton);
  if (id) document.getElementById(id)?.focus();
}
