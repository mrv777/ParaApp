import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWithTimeout } from '../client';

// Build a minimal Response-like object the client only reads .ok/.status/.json/.text from.
function res(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchWithTimeout retry policy', () => {
  it('does NOT retry a deterministic 4xx (fails fast after one attempt)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWithTimeout('http://x/api', { retries: 3 });

    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retries on 404
  });

  it('retries a 500 up to the retry limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(500));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWithTimeout('http://x/api', {
      retries: 2,
      retryDelayMs: 0, // no real backoff wait in the test
    });

    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('retries a 429 rate-limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(429));
    vi.stubGlobal('fetch', fetchMock);

    await fetchWithTimeout('http://x/api', { retries: 1, retryDelayMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it('returns success without retrying on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWithTimeout<{ ok: boolean }>('http://x/api', {
      retries: 3,
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honors an owning task abort and does not retry', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const pending = fetchWithTimeout('http://x/api', {
      retries: 3,
      signal: controller.signal,
    });
    controller.abort();
    const result = await pending;

    expect(result).toEqual({
      success: false,
      error: { message: 'Request aborted', code: 'ABORTED' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
