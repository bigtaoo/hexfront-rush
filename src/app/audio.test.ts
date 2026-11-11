// audio.ts: the cue gate and its voice cap, and the two-deck music with its crossfades.
// The Web Audio and <audio> fakes the tests run on live in test/webAudioFakes.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUES, mergedGain, type Cue } from './audio';
import { inside, installWebAudio, rig, settle } from '../test/webAudioFakes';

beforeEach(() => {
  vi.useFakeTimers();
  installWebAudio();
});
afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------- the tests

describe('cue samples', () => {
  it('are on hand for the first tap when they were fetched at boot', async () => {
    const r = rig();
    r.sound.preload(); // boot, long before any gesture
    expect(r.asked.length).toBe(17);
    expect(inside(r.sound).ctx).toBe(null); // no context yet: the page has not been touched
    await r.deliver(); // they land while the game is still loading

    r.sound.unlock(); // the first tap opens the context
    r.sound.play('tap');
    await settle();
    r.sound.update(1 / 60);
    expect(r.started()).toEqual(['tap']);
  });

  it('are still on the wire at the first tap when they were not', async () => {
    const r = rig();
    r.sound.unlock(); // the gesture is what starts the fetch
    r.sound.play('tap');
    await settle();
    r.sound.update(1 / 60);
    expect(r.started()).toEqual([]); // nothing to play: this is what preload is for
    await r.deliver();
    r.ctx().currentTime = 1;
    r.sound.play('tap');
    r.sound.update(1 / 60);
    expect(r.started()).toEqual(['tap']);
  });

  it('are fetched once per file, so an alias shares one', async () => {
    const r = rig();
    r.sound.preload();
    await r.deliver();
    expect(r.asked.filter((u) => u.endsWith('coin.mp3')).length).toBe(1);
    r.sound.unlock();
    await settle();
    r.sound.play('income'); // income is the coin sample, quieter
    r.sound.update(1 / 60);
    expect(r.started()).toEqual(['coin']);
    expect(r.voice('coin').out!.gain.value).toBeCloseTo(CUES.income.gain, 6);
  });
});

describe('the cue gate', () => {
  async function ready() {
    const r = rig();
    r.sound.preload();
    await r.deliver();
    r.sound.unlock();
    await settle();
    return r;
  }

  it('merges repeats of one cue in one frame into a single louder voice', async () => {
    const r = await ready();
    r.sound.play('shoot');
    r.sound.play('shoot');
    r.sound.play('shoot');
    r.sound.update(1 / 60);
    expect(r.started()).toEqual(['shoot']);
    expect(r.voice('shoot').out!.gain.value).toBeCloseTo(CUES.shoot.gain * mergedGain(3), 6);
  });

  it('merged gain climbs with the count and stops at 1.5', () => {
    expect(mergedGain(1)).toBe(1);
    expect(mergedGain(2)).toBeCloseTo(1.15, 6);
    expect(mergedGain(4)).toBeCloseTo(1.3, 6);
    expect(mergedGain(1024)).toBe(1.5);
  });

  it('holds a cue back until its gap has passed', async () => {
    const r = await ready();
    r.sound.play('tap');
    r.sound.update(1 / 60);
    r.sound.play('tap');
    r.sound.update(1 / 60); // the clock has not moved: inside the 50 ms gap
    expect(r.started()).toEqual(['tap']);
    r.ctx().currentTime = CUES.tap.gap + 0.01;
    r.sound.play('tap');
    r.sound.update(1 / 60);
    expect(r.started()).toEqual(['tap', 'tap']);
  });

  it('drops the queue while the effects are off or the game is paused', async () => {
    const r = await ready();
    r.st.sfx = true;
    r.sound.play('build');
    r.sound.update(1 / 60);
    r.st.sfx = false;
    r.st.paused = true;
    r.sound.play('build');
    r.sound.update(1 / 60);
    r.st.paused = false;
    expect(r.started()).toEqual([]);
    r.sound.play('build');
    r.sound.update(1 / 60);
    expect(r.started()).toEqual(['build']);
  });

  it('gives the quiet voices up to the loud ones when all fourteen are taken', async () => {
    const r = await ready();
    for (const k of Object.keys(CUES) as Cue[]) r.sound.play(k);
    r.sound.update(1 / 60);
    // every cue got a voice, but the last four had to steal, each from the quietest still
    // sounding: the three pri-0 battle noises and income (which plays the coin sample)
    expect(r.started().length).toBe(18);
    expect([...r.stopped()].sort()).toEqual(['coin', 'hit', 'melee', 'shoot']);
  });
});

describe('the buses', () => {
  async function ready() {
    const r = rig();
    r.sound.preload();
    await r.deliver();
    r.sound.unlock();
    await settle();
    return r;
  }

  it('follow the switches and the sliders', async () => {
    const r = await ready();
    const sfx = inside(r.sound).sfxBus.gain, music = inside(r.sound).musicBus.gain;
    expect(sfx.aim).toBeCloseTo(0.9, 6);
    expect(music.aim).toBeCloseTo(0.32, 6);
    r.st.sfxV = 0.25;
    r.st.music = true;
    r.sound.applyMute();
    expect(sfx.aim).toBeCloseTo(0.9 * 0.25, 6);
    expect(music.aim).toBe(0);
  });
});

describe('a pause', () => {
  async function playing() {
    const r = rig();
    r.sound.preload();
    await r.deliver();
    r.sound.unlock();
    await settle();
    r.sound.music('battle');
    r.sound.update(0); // the fade in begins: the deck plays at level 0
    return r;
  }

  it('ducks before it stops, so the break does not click', async () => {
    const r = await playing();
    r.st.paused = true;
    r.sound.applyMute();
    expect(r.master().aim).toBe(0);
    // the clock has to keep running for the ramp to get anywhere
    expect(r.ctx().state).toBe('running');
    expect(r.decks()[0]!.el.paused).toBe(false);
    vi.advanceTimersByTime(200);
    expect(r.ctx().state).toBe('suspended');
    expect(r.decks()[0]!.el.paused).toBe(true);
  });

  it('comes back from silence, not from where it froze', async () => {
    const r = await playing();
    r.st.paused = true;
    r.sound.applyMute();
    vi.advanceTimersByTime(200);
    r.st.paused = false;
    r.sound.applyMute();
    expect(r.master().value).toBe(0);
    expect(r.master().aim).toBe(1);
    expect(r.ctx().state).toBe('running');
  });

  it('that lands at the top of a fade still gives the music back', async () => {
    const r = await playing();
    expect(r.decks()[0]!.level).toBe(0); // the fade in has not moved yet
    r.st.paused = true;
    r.sound.applyMute();
    vi.advanceTimersByTime(200);
    expect(r.decks()[0]!.el.paused).toBe(true);
    r.st.paused = false;
    r.sound.applyMute();
    // it used to be left stopped for ever: a level of 0 was read as "this deck is not playing"
    expect(r.decks()[0]!.el.paused).toBe(false);
    r.sound.update(2.2);
    expect(r.decks()[0]!.level).toBe(1);
  });

  it('holds a track change until the game runs again', async () => {
    const r = await playing();
    r.sound.update(2.2); // battle is up
    r.st.paused = true;
    r.sound.applyMute();
    r.sound.music('lobby');
    r.sound.update(0.1);
    expect(r.decks()[1]!.holds).toBe(null); // nothing started while paused
    r.st.paused = false;
    r.sound.applyMute();
    r.sound.update(0.1);
    expect(r.decks()[1]!.holds).toBe('lobby');
  });
});

describe('the music decks', () => {
  async function playing(track: 'battle' | 'lobby' = 'battle') {
    const r = rig();
    r.sound.preload();
    await r.deliver();
    r.sound.unlock();
    await settle();
    r.sound.music(track);
    r.sound.update(0);
    return r;
  }

  it('cross-fade onto the other deck and silence the one left behind', async () => {
    const r = await playing();
    const [a, b] = [r.decks()[0]!, r.decks()[1]!];
    expect(a.el.src).toBe('/music/battle.mp3');
    expect(a.el.plays).toBe(1);
    r.sound.update(2.2); // past XFADE: fully in
    expect(a.level).toBe(1);

    r.sound.music('lobby');
    r.sound.update(0);
    expect(b.el.src).toBe('/music/lobby.mp3');
    r.sound.update(1); // halfway: equal power
    expect(b.level).toBeCloseTo(Math.sin(Math.PI / 4), 6);
    expect(a.level).toBeCloseTo(Math.cos(Math.PI / 4), 6);
    r.sound.update(1.2);
    expect(b.level).toBe(1);
    expect(a.level).toBe(0);
    expect(a.el.paused).toBe(true);
    expect(a.playing).toBe(false);
  });

  it('do not jump when a change interrupts a change', async () => {
    const r = await playing();
    r.sound.update(1); // halfway into battle
    const half = Math.sin(Math.PI / 4);
    expect(r.decks()[0]!.level).toBeCloseTo(half, 6);
    r.sound.music('lobby');
    r.sound.update(0);
    // battle was at 0.707 and is now the one going out: it used to be shoved back up to 1
    expect(r.decks()[0]!.level).toBeCloseTo(half, 6);
    expect(r.decks()[1]!.level).toBe(0);
    r.sound.update(2.2);
    expect(r.decks()[0]!.level).toBe(0);
    expect(r.decks()[1]!.level).toBe(1);
  });

  it('do not drop to silence when the deck coming back is the one going out', async () => {
    const r = await playing();
    r.sound.update(2.2);
    r.sound.music('lobby');
    r.sound.update(0); // the change starts the fade; it only moves on the next frame
    r.sound.update(1); // battle on deck 0 is halfway out
    const out = r.decks()[0]!.level;
    expect(out).toBeCloseTo(Math.cos(Math.PI / 4), 6);
    r.sound.music('battle'); // changed their mind: deck 0 comes back
    r.sound.update(0);
    expect(r.decks()[0]!.level).toBeCloseTo(out, 6); // not 0
    expect(r.decks()[0]!.el.currentTime).toBe(0); // and from the top of the track
    r.sound.update(2.2);
    expect(r.decks()[0]!.level).toBe(1);
  });

  it('only rewind when the same track comes back to the deck that holds it', async () => {
    const r = await playing();
    r.sound.update(2.2);
    const a = r.decks()[0]!;
    a.el.currentTime = 30;
    r.sound.music('lobby');
    r.sound.update(2.2);
    r.sound.music('battle');
    r.sound.update(0);
    expect(a.el.src).toBe('/music/battle.mp3'); // not fetched again
    expect(a.el.currentTime).toBe(0);
  });

  it('loop by cross-fading onto the other deck before the track runs out', async () => {
    const r = await playing();
    r.sound.update(2.2);
    const [a, b] = [r.decks()[0]!, r.decks()[1]!];
    a.el.duration = 10;
    a.el.currentTime = 7.9;
    r.sound.update(1 / 60);
    expect(b.el.plays).toBe(0); // still 2.1 s to go
    a.el.currentTime = 8.1;
    r.sound.update(1 / 60);
    expect(b.el.plays).toBe(1);
    expect(b.holds).toBe('battle');
    r.sound.update(2.2);
    expect(b.level).toBe(1);
    expect(a.el.paused).toBe(true);
  });

  it('restart a track that ran out while the frames were throttled', async () => {
    const r = await playing();
    r.sound.update(2.2);
    const a = r.decks()[0]!;
    a.el.ended = true;
    r.sound.update(1 / 60);
    expect(a.el.plays).toBe(2);
  });

  it('fade out to nothing when the music is asked for none', async () => {
    const r = await playing();
    r.sound.update(2.2);
    r.sound.music(null);
    r.sound.update(0);
    r.sound.update(1);
    expect(r.decks()[0]!.level).toBeCloseTo(Math.cos(Math.PI / 4), 6);
    r.sound.update(1.2);
    expect(r.decks()[0]!.level).toBe(0);
    expect(r.decks()[0]!.el.paused).toBe(true);
    expect(inside(r.sound).live).toBe(-1);
  });
});
