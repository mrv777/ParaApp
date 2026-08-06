import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUserBadges, getUserDifficultyHits } from '../parasite';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('getUserDifficultyHits', () => {
  it('builds the user-diffs request and transforms valid timestamps to milliseconds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response([
        {
          block_height: 958_773,
          difficulty: 39_440_398.42,
          block_timestamp: 1_784_490_924,
          address: 'bc1q...keed',
          claimed: false,
        },
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getUserDifficultyHits('bc1qtest+value', 900);

    expect(result).toEqual({
      success: true,
      data: [
        {
          blockHeight: 958_773,
          difficulty: 39_440_398.42,
          timestamp: 1_784_490_924_000,
        },
      ],
    });
    const requested = new URL(fetchMock.mock.calls[0][0]);
    expect(requested.pathname).toBe('/api/highest-diff');
    expect(requested.searchParams.get('address')).toBe('bc1qtest+value');
    expect(requested.searchParams.get('type')).toBe('user-diffs');
    expect(requested.searchParams.get('limit')).toBe('500');
  });

  it('drops null timestamps and malformed or non-positive values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response([
          {
            block_height: 1,
            difficulty: 10,
            block_timestamp: null,
            address: 'bc1q...test',
          },
          {
            block_height: 0,
            difficulty: 10,
            block_timestamp: 100,
            address: 'bc1q...test',
          },
          {
            block_height: 2,
            difficulty: 0,
            block_timestamp: 100,
            address: 'bc1q...test',
          },
        ])
      )
    );

    await expect(getUserDifficultyHits('bc1qtest')).resolves.toEqual({
      success: true,
      data: [],
    });
  });

  it('rejects a malformed non-array response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ data: 'bad' })));

    await expect(getUserDifficultyHits('bc1qtest')).resolves.toEqual({
      success: false,
      error: { message: 'Invalid difficulty history response' },
    });
  });
});

describe('getUserBadges', () => {
  const payload = {
    version: 2,
    computed_at: '2026-08-06T00:00:00Z',
    types: {
      block: { kind: 'unique_then_bucket', unique: [{ blockheight: 900_000 }], bucket: { count: 2 }, total: 3 },
    },
  };

  it('returns the payload and hits the badges endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(payload));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getUserBadges('bc1qtest')).resolves.toEqual({
      success: true,
      data: payload,
    });
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/api/user/bc1qtest/badges');
  });

  it.each([403, 404])('maps %i to success with null data', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'nope' }, status)));

    await expect(getUserBadges('bc1qtest')).resolves.toEqual({
      success: true,
      data: null,
    });
  });

  it('propagates other HTTP failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'boom' }, 400)));

    const result = await getUserBadges('bc1qtest');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.status).toBe(400);
  });
});
