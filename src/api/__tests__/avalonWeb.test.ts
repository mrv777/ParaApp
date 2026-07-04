import { afterEach, describe, expect, it, vi } from 'vitest';

import { setPools } from '../avalonWeb';

afterEach(() => {
  vi.restoreAllMocks();
});

// Capture the form body posted to /cgpools.cgi.
function stubFetchCapture(): { bodies: string[] } {
  const bodies: string[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body ?? ''));
    return {
      ok: true,
      status: 200,
      text: async () => '<html>pools saved</html>',
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { bodies };
}

describe('setPools — C1: never clears slots the app did not load', () => {
  it('omits pool2/pool3 params entirely when slots 2/3 are undefined', async () => {
    const { bodies } = stubFetchCapture();

    const result = await setPools(
      '10.0.0.5',
      { cookie: 'deadbeef' },
      [{ url: 'stratum+tcp://pool.example.com:3333', worker: 'w', password: 'x' }, undefined, undefined]
    );

    expect(result.success).toBe(true);
    const body = bodies[0];
    const params = new URLSearchParams(body);
    // Slot 1 is sent…
    expect(params.get('pool1')).toBe('stratum+tcp://pool.example.com:3333');
    // …but slots 2/3 must be absent (not pool2='', which would CLEAR them).
    expect(params.has('pool2')).toBe(false);
    expect(params.has('pool3')).toBe(false);
    expect(params.has('worker2')).toBe(false);
    expect(params.has('passwd3')).toBe(false);
  });

  it('still sends an explicitly-provided slot 2', async () => {
    const { bodies } = stubFetchCapture();

    await setPools(
      '10.0.0.5',
      { cookie: 'deadbeef' },
      [
        { url: 'stratum+tcp://a:3333', worker: 'w1', password: 'x' },
        { url: 'stratum+tcp://b:3333', worker: 'w2', password: 'y' },
        undefined,
      ]
    );

    const params = new URLSearchParams(bodies[0]);
    expect(params.get('pool2')).toBe('stratum+tcp://b:3333');
    expect(params.has('pool3')).toBe(false);
  });
});
