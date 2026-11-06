import { afterEach, expect, it, vi } from 'vitest';
import { applyParasitePreset } from '../axeOS';

afterEach(() => vi.unstubAllGlobals());

it('applies the published pool endpoint and preserves the selected worker', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  await applyParasitePreset('192.168.1.10', 'bc1qexample.worker');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('http://192.168.1.10/api/system');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    stratumURL: 'parasite.wtf', stratumPort: 42069,
    stratumUser: 'bc1qexample.worker', stratumPassword: 'x',
  });
});
