// The gestures' arithmetic. The three that are worth pinning are the three that can be wrong
// without anyone noticing on the machine they were written on: a wheel delta that is not pixels,
// a pinch that acts twice on the same squeeze, and two held keys that pan faster than one.

import { describe, expect, it } from 'vitest';
import { DRAG_PX, DRAG_PX_TOUCH, KEY_PAN, PINCH, dragSlop, panKey, panVector, pinchStep, wheelPan, wheelPx } from './gesture';

describe('the wheel', () => {
  it('reads a notch in whatever unit the browser counted it in', () => {
    // the same turn of the same mouse: Chrome says 100 pixels, Firefox says 3 lines, and a browser
    // counting screenfuls says 1. Before this they moved the map 100, 3 and 1 pixels.
    expect(wheelPx(100, 0, 800)).toBe(100);
    expect(wheelPx(3, 1, 800)).toBe(48);
    expect(wheelPx(1, 2, 800)).toBe(800);
    expect(wheelPx(-3, 1, 800)).toBe(-48);
    // a line notch has to be worth a real push of the map, not a nudge
    expect(Math.abs(wheelPx(3, 1, 800))).toBeGreaterThan(DRAG_PX * 2);
  });

  it('never throws the map further than a screen in one event', () => {
    expect(wheelPx(100000, 0, 800)).toBe(800);
    expect(wheelPx(-100000, 1, 800)).toBe(-800);
    expect(wheelPx(2, 2, 600)).toBe(600);
    expect(wheelPx(1, 2, 0)).toBe(1); // a screen with no height still owes a pixel, not zero
  });

  it('treats a missing or broken delta as no scroll at all', () => {
    for (const d of [0, -0, NaN, Infinity, -Infinity]) expect(wheelPx(d, 0, 800)).toBe(0);
  });

  it('moves the map with the wheel, which moves the camera against it', () => {
    expect(wheelPan({ deltaX: 20, deltaY: 100, deltaMode: 0 }, 1200, 800)).toEqual({ x: -20, y: -100 });
    expect(wheelPan({ deltaX: -1, deltaY: 3, deltaMode: 1 }, 1200, 800)).toEqual({ x: 16, y: -48 });
    // each axis is capped by its own side of the screen
    expect(wheelPan({ deltaX: 9999, deltaY: 9999, deltaMode: 0 }, 1200, 800)).toEqual({ x: -1200, y: -800 });
  });
});

describe('the pinch', () => {
  it('waits for a real squeeze, then zooms out once', () => {
    expect(pinchStep(200, 199, false)).toBeNull();
    expect(pinchStep(200, 200 / PINCH + 1, false)).toBeNull();
    expect(pinchStep(200, 200 / PINCH - 1, false)).toBe('out');
    // already out there: the same squeeze asks for nothing, so the fingers may keep closing
    expect(pinchStep(200, 20, true)).toBeNull();
  });

  it('comes back in when the fingers open, and only from the overview', () => {
    expect(pinchStep(100, 100 * PINCH + 1, true)).toBe('in');
    expect(pinchStep(100, 100 * PINCH - 1, true)).toBeNull();
    expect(pinchStep(100, 900, false)).toBeNull();
  });

  it('says nothing about a pinch with no distance to it', () => {
    for (const [a, b] of [[0, 100], [100, 0], [-5, 5], [NaN, 10], [10, NaN]]) {
      expect(pinchStep(a!, b!, false)).toBeNull();
      expect(pinchStep(a!, b!, true)).toBeNull();
    }
  });
});

describe('the keys', () => {
  it('knows its own eight, and no others', () => {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(panKey(k)).toBeDefined();
    }
    for (const k of ['Space', 'Escape', 'KeyP', 'Enter', 'keyw', '']) expect(panKey(k)).toBeUndefined();
  });

  it('pans the same speed in every direction, with one key or two', () => {
    const len = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);
    expect(len(panVector(['KeyW']))).toBeCloseTo(1);
    expect(len(panVector(['KeyW', 'KeyD']))).toBeCloseTo(1); // was 1.41: a diagonal outran a straight line
    expect(len(panVector(['KeyW', 'ArrowRight', 'KeyD']))).toBeCloseTo(1); // W and the arrow are one key
    expect(panVector(['KeyD'])).toEqual({ x: 1, y: 0 });
    expect(panVector(['KeyW', 'KeyD']).x).toBeCloseTo(Math.SQRT1_2);
    expect(panVector(['KeyW', 'KeyD']).y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('stands still when nothing is held, or when the keys cancel out', () => {
    expect(panVector([])).toEqual({ x: 0, y: 0 });
    expect(panVector(['KeyW', 'KeyS'])).toEqual({ x: 0, y: 0 });
    expect(panVector(['Space', 'Enter'])).toEqual({ x: 0, y: 0 });
    expect(panVector(new Set(['KeyA', 'ArrowRight']))).toEqual({ x: 0, y: 0 });
  });

  it('crosses the play area in a second or two, held down', () => {
    expect(KEY_PAN * 1).toBeGreaterThan(400);
    expect(KEY_PAN * 1).toBeLessThan(1600);
  });
});

describe('tap or drag', () => {
  it('gives a finger more room to slip than a mouse', () => {
    expect(dragSlop('touch')).toBe(DRAG_PX_TOUCH);
    expect(dragSlop('mouse')).toBe(DRAG_PX);
    expect(dragSlop('pen')).toBe(DRAG_PX);
    expect(dragSlop('')).toBe(DRAG_PX);
    expect(DRAG_PX_TOUCH).toBeGreaterThan(DRAG_PX);
    // and not so much room that a card's neighbour can be hit by a slipping tap
    expect(DRAG_PX_TOUCH).toBeLessThan(30);
  });
});
