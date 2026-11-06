import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRefineryOrder, getRefineryOrders } from '../refinery';

function page(body: unknown, cursor?: string, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: cursor ? { 'X-Next-Cursor': cursor } : {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('refinery monitoring', () => {
  it('uses the current route, encodes the address, and follows cursor headers', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(page([{ id: 2 }], 'next+/='))
      .mockResolvedValueOnce(page([{ id: 1 }]));
    vi.stubGlobal('fetch', fetch);
    expect(await getRefineryOrders('address+test')).toEqual({
      success: true, data: [{ id: 2 }, { id: 1 }],
    });
    const first = new URL(fetch.mock.calls[0][0]);
    const next = new URL(fetch.mock.calls[1][0]);
    expect(first.pathname).toBe('/api/refinery/orders');
    expect(first.searchParams.get('address')).toBe('address+test');
    expect(first.searchParams.get('limit')).toBe('500');
    expect(next.searchParams.get('cursor')).toBe('next+/=');
    expect(fetch.mock.calls[0][1]).not.toHaveProperty('onResponseHeaders');
  });

  it('preserves empty results and deduplicates overlapping pages', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page([]));
    vi.stubGlobal('fetch', fetch);
    expect(await getRefineryOrders('address')).toEqual({ success: true, data: [] });
    fetch.mockResolvedValueOnce(page([{ id: 1, status: 'active' }], 'next'))
      .mockResolvedValueOnce(page([{ id: 1, status: 'fulfilled' }]));
    expect(await getRefineryOrders('address')).toEqual({
      success: true, data: [{ id: 1, status: 'fulfilled' }],
    });
  });

  it('returns an error instead of a partial list when a later page fails', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page([{ id: 1 }], 'next'))
      .mockResolvedValueOnce(page({}, undefined, 503));
    vi.stubGlobal('fetch', fetch);
    expect(await getRefineryOrders('address')).toMatchObject({ success: false, error: { status: 503 } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects repeated cursors and invalid result shapes', async () => {
    const fetch = vi.fn().mockResolvedValue(page([{ id: 1 }], 'loop'));
    vi.stubGlobal('fetch', fetch);
    expect(await getRefineryOrders('address')).toMatchObject({ success: false });
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockResolvedValue(page({ orders: [] }));
    expect(await getRefineryOrders('address')).toMatchObject({ success: false });
  });

  it('bounds pagination even if every cursor is different', async () => {
    let cursor = 0;
    const fetch = vi.fn().mockImplementation(async () => page([], String(++cursor)));
    vi.stubGlobal('fetch', fetch);
    expect(await getRefineryOrders('address')).toMatchObject({ success: false });
    expect(fetch).toHaveBeenCalledTimes(20);
  });

  it('cancels a stalled poll inside the shared deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const pending = getRefineryOrders('address');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toMatchObject({ success: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fetches order details from the current route without retrying failures', async () => {
    const fetch = vi.fn().mockResolvedValue(page({ id: 42 }));
    vi.stubGlobal('fetch', fetch);
    expect(await getRefineryOrder(42)).toEqual({ success: true, data: { id: 42 } });
    expect(fetch.mock.calls[0][0]).toBe('https://parasite.space/api/refinery/order/42');
    fetch.mockClear().mockResolvedValue(page({}, undefined, 502));
    expect(await getRefineryOrder(42)).toMatchObject({ success: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
