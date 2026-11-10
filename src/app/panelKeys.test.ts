import { describe, expect, it } from 'vitest';
import { PANEL_KEYS, focusTarget, panelButton } from './panelKeys';

const all = () => true;
const only = (...ids: string[]) => (id: string) => ids.includes(id);

describe('panel keys', () => {
  it('Esc goes back on every panel but the menu', () => {
    for (const p of Object.keys(PANEL_KEYS) as (keyof typeof PANEL_KEYS)[]) {
      const id = panelButton(p, 'Escape', all);
      if (p === 'menu') expect(id).toBeNull();
      else expect(id).toBeTruthy();
    }
  });

  it('Enter and Space take the main button', () => {
    expect(panelButton('menu', 'Enter', all)).toBe('playBtn');
    expect(panelButton('brief', 'Space', all)).toBe('briefGo');
    expect(panelButton('brief', 'NumpadEnter', all)).toBe('briefGo');
    expect(panelButton('campaign', 'Enter', all)).toBe('stageLast');
    expect(panelButton('settings', 'Enter', all)).toBeNull();
  });

  it('the results go on to the next stage when it is open, else play again', () => {
    expect(panelButton('result', 'Enter', all)).toBe('nextBtn');
    expect(panelButton('result', 'Enter', only('againBtn', 'menuBtn'))).toBe('againBtn');
    expect(panelButton('result', 'Escape', all)).toBe('menuBtn');
  });

  it('the arrows turn chapters and tabs, and skip a disabled arrow', () => {
    expect(panelButton('campaign', 'ArrowLeft', all)).toBe('chPrev');
    expect(panelButton('campaign', 'ArrowRight', only('chPrev'))).toBeNull();
    expect(panelButton('board', 'ArrowRight', all)).toBe('boardDaily');
    expect(panelButton('settings', 'ArrowLeft', all)).toBeNull();
  });

  it('nothing on no panel or an unknown key', () => {
    expect(panelButton(null, 'Escape', all)).toBeNull();
    expect(panelButton('brief', 'KeyQ', all)).toBeNull();
  });

  it('a panel opened by a key focuses its main button, else its way back', () => {
    expect(focusTarget('brief', all)).toBe('briefGo');
    expect(focusTarget('settings', all)).toBe('setBack');
    expect(focusTarget('result', only('againBtn', 'menuBtn'))).toBe('againBtn');
  });
});
