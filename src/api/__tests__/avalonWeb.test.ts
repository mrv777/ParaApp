import { afterEach, describe, expect, it, vi } from 'vitest';

const expoFetch = vi.hoisted(() => vi.fn());

vi.mock('expo/fetch', () => ({ fetch: expoFetch }));

import {
  AVALON_WEB_MAX_RESPONSE_BYTES,
  AVALON_WEB_TIMEOUT,
  setPools,
} from '../avalonWeb';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  expoFetch.mockReset();
});

// Capture the form body posted to /cgpools.cgi.
function stubFetchCapture(): { bodies: string[] } {
  const bodies: string[] = [];
  expoFetch.mockImplementation(
    async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body ?? ''));
    return {
      ok: true,
      status: 200,
      body: null,
      text: async () => '<html>pools saved</html>',
    } as unknown as Response;
    }
  );
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

describe('Avalon CGI response guards', () => {
  it('keeps the timeout active while the response body is being read', async () => {
    vi.useFakeTimers();
    expoFetch.mockImplementation(
      async (_url: string, init: RequestInit) => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            init.signal?.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              controller.error(error);
            });
          },
        }),
      }) as unknown as Response
    );

    const resultPromise = setPools(
      '10.0.0.5',
      { cookie: 'deadbeef' },
      [{ url: 'stratum+tcp://pool:3333', worker: 'w', password: 'x' }]
    );
    await vi.advanceTimersByTimeAsync(AVALON_WEB_TIMEOUT + 1);

    const result = await resultPromise;
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toBe('Timeout');
  });

  it('rejects an oversized declared response before reading the body', async () => {
    const text = vi.fn(async () => '<html>never read</html>');
    expoFetch.mockImplementation(
      async () => ({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-length': String(AVALON_WEB_MAX_RESPONSE_BYTES + 1),
        }),
        body: null,
        text,
      }) as unknown as Response
    );

    const result = await setPools(
      '10.0.0.5',
      { cookie: 'deadbeef' },
      [{ url: 'stratum+tcp://pool:3333', worker: 'w', password: 'x' }]
    );

    expect(result.success).toBe(false);
    expect(text).not.toHaveBeenCalled();
  });

  it('stops a chunked response that omits Content-Length at the byte cap', async () => {
    const text = vi.fn(async () => 'must not buffer');
    expoFetch.mockImplementation(
      async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new Uint8Array(AVALON_WEB_MAX_RESPONSE_BYTES / 2)
            );
            controller.enqueue(
              new Uint8Array(AVALON_WEB_MAX_RESPONSE_BYTES / 2 + 1)
            );
            controller.close();
          },
        }),
        text,
      }) as unknown as Response
    );

    const result = await setPools(
      '10.0.0.5',
      { cookie: 'deadbeef' },
      [{ url: 'stratum+tcp://pool:3333', worker: 'w', password: 'x' }]
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Miner response exceeded 1 MiB');
    }
    expect(text).not.toHaveBeenCalled();
  });
});
