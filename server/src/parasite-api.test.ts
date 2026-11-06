import { afterEach, describe, expect, it, vi } from 'vitest';
import { getUser } from './parasite-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('upstream request lifetime', () => {
  it('aborts a stalled response body after headers have arrived', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }),
    })));
    const pending = getUser('https://pool.test', 'address', 50);
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toMatchObject({ success: false, error: 'Request timeout' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reads a successful body and clears the deadline', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url: string) => Response.json({ hashrate: 123 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getUser('https://pool.test', 'address?query', 50))
      .toEqual({ success: true, data: { hashrate: 123 } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://pool.test/api/user/address%3Fquery');
    expect(vi.getTimerCount()).toBe(0);
  });
});
