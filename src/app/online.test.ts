import { describe, expect, it } from 'vitest';
import { loadRoom } from './online';

describe('loadRoom', () => {
  it('reads a saved room', () => {
    expect(loadRoom(JSON.stringify({ code: 'AB12', seat: 2, token: 't' }))).toEqual({ code: 'AB12', seat: 2, token: 't' });
  });

  it('rejects missing, corrupt and incomplete rooms', () => {
    expect(loadRoom(null)).toBeNull();
    expect(loadRoom('{')).toBeNull();
    expect(loadRoom(JSON.stringify({ code: 'AB12', seat: 1 }))).toBeNull();
    expect(loadRoom(JSON.stringify({ code: '', seat: 1, token: 't' }))).toBeNull();
  });
});
