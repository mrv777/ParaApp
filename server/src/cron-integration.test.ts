import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCronJob, shouldCheckDispenser } from './cron';
import { createTestDatabase } from './test-utils/sqlite';
import type { Env } from './types';

const NOW = Date.UTC(2026, 10, 6, 16);

describe('cron polling capacity', () => {
  let database: ReturnType<typeof createTestDatabase>;
  let logs: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    database = createTestDatabase();
    database.sqlite.exec("UPDATE pool_state SET last_block_time = '100'");
    logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    database.sqlite.close();
  });

  function subscriptions(count: number) {
    const insert = database.sqlite.prepare(
      'INSERT INTO push_subscriptions(push_token, btc_address) VALUES (?, ?)'
    );
    let created = 0;
    for (let i = 0; created < count; i++) {
      const address = `bc1qmaintenance000000000000000000${i}`;
      if (!shouldCheckDispenser(address, NOW)) continue;
      insert.run(`ExpoPushToken[test_${i}]`, address);
      created++;
    }
  }

  function upstream(delay: (address: string) => number) {
    let active = 0;
    let peak = 0;
    const starts: { address: string; at: number }[] = [];
    const finishes: { address: string; at: number }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
      const url = new URL(input);
      if (url.pathname === '/api/pool-stats') {
        return Response.json({ lastBlockTime: '100', highestDifficulty: '1', hashrate: 1, users: 1, workers: 1 });
      }
      if (url.pathname === '/api/dispenser/tiers') return Response.json([]);
      const isUser = url.pathname.startsWith('/api/user/');
      const address = url.pathname.split('/').at(-1)!;
      if (isUser) starts.push({ address, at: Date.now() });
      active++;
      peak = Math.max(peak, active);
      try {
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
          const timer = setTimeout(() => {
            options?.signal?.removeEventListener('abort', abort);
            resolve();
          }, isUser ? delay(address) : 25);
          options?.signal?.addEventListener('abort', abort, { once: true });
        });
        if (isUser) {
          finishes.push({ address, at: Date.now() });
          return Response.json({ hashrate: 1, workers: 0, workerData: [], bestDifficulty: '1' });
        }
        return new Response(null, { status: 404 });
      } finally {
        active--;
      }
    }));
    return { starts, finishes, peak: () => peak };
  }

  async function run() {
    const pending = runCronJob({ DB: database.db, PARASITE_API_URL: 'https://pool.test' } as Env, NOW);
    await vi.runAllTimersAsync();
    await pending;
  }

  it('respects six outgoing connections when every address also needs a reward check', async () => {
    subscriptions(12);
    const requests = upstream(() => 25);
    await run();
    expect(requests.peak()).toBeLessThanOrEqual(6);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM user_state').get()?.n).toBe(12);
  });

  it('continues polling other users while an earlier upstream response is slow', async () => {
    subscriptions(12);
    let slowAddress: string | undefined;
    const requests = upstream((address) => {
      slowAddress ??= address;
      return address === slowAddress ? 1_000 : 25;
    });
    await run();
    expect(requests.starts).toHaveLength(12);
    const slowFinished = requests.finishes.find((entry) => entry.address === slowAddress)!;
    expect(requests.starts[6].at).toBeLessThan(slowFinished.at);
  });

  it('stops admitting users at the deadline and isolates upstream timeouts', async () => {
    subscriptions(100);
    const requests = upstream(() => 6_000);
    await run();
    expect(requests.starts.length).toBeGreaterThan(6);
    expect(requests.starts.length).toBeLessThan(100);
    expect(requests.starts.every((entry) => entry.at - NOW < 45_000)).toBe(true);
    const summary = [...logs.mock.calls, ...vi.mocked(console.warn).mock.calls]
      .flat().find((entry) => typeof entry === 'string' && entry.includes('cron_summary'));
    expect(JSON.parse(summary as string)).toMatchObject({
      deadlineReached: true, topLevelError: false, maintenanceFailures: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shares the per-user timeout with reward checks while retaining valid stats', async () => {
    subscriptions(1);
    upstream(() => 4_990);
    await run();
    expect(Date.now() - NOW).toBeLessThanOrEqual(5_000);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM user_state').get()?.n).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
