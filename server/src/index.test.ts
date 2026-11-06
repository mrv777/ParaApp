import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';

import worker from './index';
import { createTestDatabase } from './test-utils/sqlite';
import { claimEnrollment, enrollmentSourceKey, MAX_ENROLLMENTS_PER_WINDOW } from './enrollment';
import type { Env } from './types';
import packageJson from '../package.json';

it('reports the backend release version in its health response', async () => {
  const response = await worker.fetch(new Request('https://example.test/'), {} as never, {} as never);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: 'ok', service: 'paraapp-notifications', version: packageJson.version,
  });
});

describe('admin HTML security headers', () => {
  it('cannot be embedded in another page', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/chat/admin'),
      {} as never,
      {} as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'none'"
    );
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });
});

describe('admin validation authorization', () => {
  it.each(['', 'wrong-secret'])('rejects unauthorized badge writes before parsing JSON (%s)', async (secret) => {
    for (const path of ['/chat/admin/badges', '/chat/admin/message/123/badges']) {
      const response = await worker.fetch(new Request(`https://example.test${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
        body: 'invalid-json',
      }), { ADMIN_SECRET: 'test-admin-secret' } as never, {} as never);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ success: false, error: 'Unauthorized' });
    }
  });
});

describe('push enrollment admission', () => {
  let database: ReturnType<typeof createTestDatabase>;
  let env: Env;
  const address = 'bc1qtestaddress000000000000000000000';

  beforeEach(() => {
    database = createTestDatabase();
    env = { DB: database.db, SESSION_SECRET: 'test-only-secret', PARASITE_API_URL: 'https://pool.test' } as Env;
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ hashrate: 123 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    database.sqlite.close();
  });

  function register(token: string, source = '192.0.2.1', fields: Record<string, unknown> = {}) {
    return worker.fetch(new Request('https://worker.test/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(source ? { 'CF-Connecting-IP': source } : {}) },
      body: JSON.stringify({ pushToken: `ExpoPushToken[${token}]`, btcAddress: address, ...fields }),
    }), env, {} as never);
  }

  it('fake enabled and disabled devices cannot exhaust a public address for another source', async () => {
    for (let i = 0; i < MAX_ENROLLMENTS_PER_WINDOW; i++) {
      expect((await register(`fake_${i}`, '192.0.2.1', {
        notificationsEnabled: i % 2 === 0,
        widgetUpdatesEnabled: i % 2 === 0,
      })).status).toBe(200);
    }
    const blocked = await register('another_fake');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await register('legitimate', '192.0.2.2')).status).toBe(200);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()?.n)
      .toBe(MAX_ENROLLMENTS_PER_WINDOW + 1);
  });

  it('bounds concurrent enrollments even when tokens and addresses change', async () => {
    const responses = await Promise.all(Array.from({ length: MAX_ENROLLMENTS_PER_WINDOW + 5 }, (_, i) =>
      register(`concurrent_${i}`, '192.0.2.1', { btcAddress: `${address}${i}` })
    ));
    expect(responses.filter((r) => r.status === 200)).toHaveLength(MAX_ENROLLMENTS_PER_WINDOW);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(5);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()?.n)
      .toBe(MAX_ENROLLMENTS_PER_WINDOW);
  });

  it('refreshes an existing device at the source limit without replacing stored categories', async () => {
    expect((await register('existing', '192.0.2.1', { preferences: { workers: false } })).status).toBe(200);
    const sourceKey = await enrollmentSourceKey(env.SESSION_SECRET, '192.0.2.1');
    for (let i = 1; i < MAX_ENROLLMENTS_PER_WINDOW; i++) {
      await claimEnrollment(env.DB, sourceKey, Math.floor(Date.now() / 1000));
    }
    const refreshed = await register('existing', '192.0.2.1', {
      preferences: { workers: true }, notificationsEnabled: false, widgetUpdatesEnabled: true,
    });
    expect(refreshed.status).toBe(200);
    expect(await refreshed.json()).toMatchObject({ preferences: { workers: false } });
    expect(database.sqlite.prepare('SELECT notifications_enabled, widget_updates_enabled FROM push_subscriptions').get())
      .toMatchObject({ notifications_enabled: 0, widget_updates_enabled: 1 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    // Legacy refreshes can omit optional flags and retain their current values.
    expect((await register('existing', '')).status).toBe(200);
    expect(database.sqlite.prepare('SELECT notifications_enabled, widget_updates_enabled FROM push_subscriptions').get())
      .toMatchObject({ notifications_enabled: 0, widget_updates_enabled: 1 });
  });

  it('charges address moves, reactivation and reenrollment after deletion to the source', async () => {
    await register('move');
    await register('inactive');
    await register('deleted');
    database.sqlite.prepare("UPDATE push_subscriptions SET active = 0 WHERE push_token = 'ExpoPushToken[inactive]'").run();
    database.sqlite.prepare("DELETE FROM push_subscriptions WHERE push_token = 'ExpoPushToken[deleted]'").run();
    const sourceKey = await enrollmentSourceKey(env.SESSION_SECRET, '192.0.2.1');
    for (let i = 3; i < MAX_ENROLLMENTS_PER_WINDOW; i++) {
      await claimEnrollment(env.DB, sourceKey, Math.floor(Date.now() / 1000));
    }
    expect((await register('move', '192.0.2.1', { btcAddress: `${address}other` })).status).toBe(429);
    expect((await register('inactive')).status).toBe(429);
    expect((await register('deleted')).status).toBe(429);
    expect(database.sqlite.prepare("SELECT btc_address FROM push_subscriptions WHERE push_token = 'ExpoPushToken[move]'").get()?.btc_address).toBe(address);
    expect(database.sqlite.prepare("SELECT active FROM push_subscriptions WHERE push_token = 'ExpoPushToken[inactive]'").get()?.active).toBe(0);
  });

  it('blocks new enrollment without trusted ingress or a secret', async () => {
    expect((await register('missing_ip', '')).status).toBe(503);
    env.SESSION_SECRET = '';
    expect((await register('missing_secret')).status).toBe(503);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()?.n).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not insert subscriptions for invalid addresses and gives a new allowance next hour', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await register('unknown')).status).toBe(404);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()?.n).toBe(0);
    const sourceKey = await enrollmentSourceKey(env.SESSION_SECRET, '192.0.2.1');
    const now = Math.floor(Date.now() / 1000);
    for (let i = 1; i < MAX_ENROLLMENTS_PER_WINDOW; i++) await claimEnrollment(env.DB, sourceKey, now);
    expect((await register('over_limit')).status).toBe(429);
    vi.useFakeTimers();
    vi.setSystemTime((Math.floor(now / 3600) + 1) * 3600 * 1000);
    expect((await register('next_hour')).status).toBe(200);
  });

  it('applies the incremental migration idempotently without losing existing devices', async () => {
    await register('existing');
    database.sqlite.exec('DROP TABLE push_enrollment_limits');
    const migration = readFileSync(new NodeURL('../migrations/0014_push_enrollment_limits.sql', import.meta.url), 'utf8');
    database.sqlite.exec(migration);
    database.sqlite.exec(migration);
    expect((await register('new')).status).toBe(200);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()?.n).toBe(2);
  });
});

describe('CORS preflight', () => {
  it('uses a fixed allow-list rather than reflecting attacker-supplied request headers', async () => {
    const response = await worker.fetch(new Request('https://worker.test/register', {
      method: 'OPTIONS',
      headers: { Origin: 'https://example.test', 'Access-Control-Request-Headers': 'x-untrusted' },
    }), {} as never, {} as never);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type,X-Admin-Secret');
  });
});
