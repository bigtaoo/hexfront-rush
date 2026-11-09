import { describe, expect, it } from 'vitest';
import { relayUrl } from './netClient';

const at = (href: string) => {
  const u = new URL(href);
  return { search: u.search, protocol: u.protocol, hostname: u.hostname, host: u.host };
};

describe('relayUrl', () => {
  it('takes ?server, adding the scheme when it is missing', () => {
    expect(relayUrl(at('https://game.example/?server=relay.example:9000'), false)).toBe('wss://relay.example:9000');
    expect(relayUrl(at('http://localhost:5207/?server=ws://10.0.0.2:8787'), true)).toBe('ws://10.0.0.2:8787');
  });

  it('uses the page host on local and LAN addresses (the relay serves the build)', () => {
    expect(relayUrl(at('http://localhost:8787/'), false)).toBe('ws://localhost:8787');
    expect(relayUrl(at('http://192.168.1.5:8787/'), false)).toBe('ws://192.168.1.5:8787');
  });

  it('points the dev server at the relay port', () => {
    expect(relayUrl(at('http://localhost:5207/'), true)).toBe('ws://localhost:8787');
    expect(relayUrl(at('http://192.168.1.5:5207/'), true)).toBe('ws://192.168.1.5:8787');
  });

  it('has no relay on a public host', () => {
    expect(relayUrl(at('https://playgama.com/game'), false)).toBeNull();
  });
});
