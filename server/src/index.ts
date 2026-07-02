import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import {
  registerSchema,
  unregisterSchema,
  preferencesSchema,
  chatSessionSchema,
  chatNicknameSchema,
  chatReportSchema,
  chatBlockSchema,
  chatEulaSchema,
  chatAdminBanSchema,
  chatAnnouncementSchema,
} from './validation';
import {
  passesActivityGate,
  issueSessionToken,
  verifySessionToken,
  timingSafeEqual,
} from './chat/identity';
import {
  getRecentMessages,
  isBanned,
  setNickname,
  addReport,
  addBlock,
  removeBlock,
  recordEulaAcceptance,
  softDeleteMessage,
  banAddress,
  getOpenReports,
  resolveReport,
  getAnnouncement,
  setAnnouncement,
} from './chat/db';
import { isClean } from './chat/moderation';
import { isReservedNickname } from './chat/reserved-nicknames';
import { stripInvisible } from './chat/sanitize';
import { adminPageHtml } from './chat/admin-page';
import {
  upsertSubscription,
  deleteSubscription,
  upsertPreferences,
  getPreferences,
  verifyTokenOwnership,
  MaxDevicesExceededError,
  updateSubscriptionWidgetUpdates,
  updateSubscriptionNotificationsEnabled,
  getWidgetPoolSnapshot,
  upsertWidgetPoolSnapshot,
  getWidgetUserSnapshot,
  upsertWidgetUserSnapshot,
} from './db';
import { runCronJob } from './cron';
import { getPoolStats, getUser } from './parasite-api';
import {
  buildPoolWidgetSnapshot,
  buildUserWidgetSnapshot,
} from './widget-snapshots';

const app = new Hono<{ Bindings: Env }>();
const WIDGET_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

// Enable CORS for mobile app
app.use('*', cors());

// Health check
app.get('/', (c) =>
  c.json({ status: 'ok', service: 'paraapp-notifications' })
);

// Register push token
app.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return c.json({ success: false, error: result.error.flatten() }, 400);
    }

    const { pushToken, btcAddress, preferences, widgetUpdatesEnabled, notificationsEnabled } =
      result.data;

    // Rate limit: Atomically check if recently registered and touch timestamp to prevent race conditions
    // This UPDATE only succeeds if: token exists, same address, AND was updated > 60s ago
    const touchResult = await c.env.DB.prepare(
      `UPDATE push_subscriptions
       SET updated_at = unixepoch()
       WHERE push_token = ? AND btc_address = ? AND updated_at <= unixepoch() - 60`
    )
      .bind(pushToken, btcAddress)
      .run();

    // If no rows updated, check if it's because the token was recently registered (rate limited)
    if (touchResult.meta.changes === 0) {
      const existing = await c.env.DB.prepare(
        'SELECT btc_address, updated_at, active FROM push_subscriptions WHERE push_token = ?'
      )
        .bind(pushToken)
        .first<{ btc_address: string; updated_at: number; active: number }>();

      // If token exists with same address, is active, and was recently
      // updated, return cached prefs (rate limited). An inactive row falls
      // through to full registration below, which reactivates it via
      // upsertSubscription — otherwise a re-register within 60s of
      // markTokenInactive would report success but stay dark to cron.
      if (existing && existing.btc_address === btcAddress && existing.active === 1) {
        if (widgetUpdatesEnabled !== undefined) {
          await updateSubscriptionWidgetUpdates(
            c.env.DB,
            pushToken,
            btcAddress,
            widgetUpdatesEnabled
          );
        }
        if (notificationsEnabled !== undefined) {
          await updateSubscriptionNotificationsEnabled(
            c.env.DB,
            pushToken,
            btcAddress,
            notificationsEnabled
          );
        }
        const prefs = await getPreferences(c.env.DB, btcAddress);
        return c.json({
          success: true,
          preferences: prefs
            ? {
                blocks: prefs.notify_blocks === 1,
                workers: prefs.notify_workers === 1,
                bestDiff: prefs.notify_best_diff === 1,
              }
            : null,
        });
      }
      // Otherwise: new token or address change - proceed with full registration
    }
    // If rows updated: token existed but was stale, we've touched it - proceed with full registration

    // Validate address exists on Parasite Pool before registering
    const userResult = await getUser(c.env.PARASITE_API_URL, btcAddress);
    if (!userResult.success || !userResult.data) {
      return c.json({ success: false, error: 'Address not found on Parasite Pool' }, 404);
    }

    await upsertSubscription(c.env.DB, pushToken, btcAddress, {
      widgetUpdatesEnabled,
      notificationsEnabled,
    });

    if (preferences) {
      await upsertPreferences(c.env.DB, btcAddress, preferences);
    }

    // Return current preferences for cross-device sync
    const prefs = await getPreferences(c.env.DB, btcAddress);
    return c.json({
      success: true,
      preferences: prefs
        ? {
            blocks: prefs.notify_blocks === 1,
            workers: prefs.notify_workers === 1,
            bestDiff: prefs.notify_best_diff === 1,
          }
        : null,
    });
  } catch (error) {
    if (error instanceof MaxDevicesExceededError) {
      return c.json({ success: false, error: 'Maximum of 10 devices per address' }, 400);
    }
    console.error('Register error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Unregister push token
app.delete('/unregister', async (c) => {
  try {
    const body = await c.req.json();
    const result = unregisterSchema.safeParse(body);

    if (!result.success) {
      return c.json({ success: false, error: result.error.flatten() }, 400);
    }

    const deleted = await deleteSubscription(c.env.DB, result.data.pushToken);

    return c.json({ success: true, deleted });
  } catch (error) {
    console.error('Unregister error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Update notification preferences
app.patch('/preferences', async (c) => {
  try {
    const body = await c.req.json();
    const result = preferencesSchema.safeParse(body);

    if (!result.success) {
      return c.json({ success: false, error: result.error.flatten() }, 400);
    }

    const { pushToken, btcAddress, widgetUpdatesEnabled, notificationsEnabled, ...prefs } =
      result.data;

    // Verify ownership: pushToken must be registered to this address
    const isOwner = await verifyTokenOwnership(c.env.DB, pushToken, btcAddress);
    if (!isOwner) {
      return c.json({ success: false, error: 'Unauthorized' }, 403);
    }

    await upsertPreferences(c.env.DB, btcAddress, prefs);
    if (widgetUpdatesEnabled !== undefined) {
      await updateSubscriptionWidgetUpdates(
        c.env.DB,
        pushToken,
        btcAddress,
        widgetUpdatesEnabled
      );
    }
    if (notificationsEnabled !== undefined) {
      await updateSubscriptionNotificationsEnabled(
        c.env.DB,
        pushToken,
        btcAddress,
        notificationsEnabled
      );
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Preferences error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

app.get('/widget/pool', async (c) => {
  try {
    const cached = await getWidgetPoolSnapshot(c.env.DB);
    const now = Date.now();

    if (cached && now - cached.fetched_at <= WIDGET_CACHE_MAX_AGE_MS) {
      return c.json({ success: true, data: JSON.parse(cached.snapshot_json) });
    }

    const poolResult = await getPoolStats(c.env.PARASITE_API_URL);
    if (!poolResult.success || !poolResult.data) {
      if (cached) {
        return c.json({ success: true, data: JSON.parse(cached.snapshot_json) });
      }
      return c.json({ success: false, error: 'Pool snapshot unavailable' }, 503);
    }

    const snapshot = buildPoolWidgetSnapshot(poolResult.data, now);
    await upsertWidgetPoolSnapshot(c.env.DB, JSON.stringify(snapshot), now);
    return c.json({ success: true, data: snapshot });
  } catch (error) {
    console.error('Pool widget snapshot error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

app.get('/widget/user/:address', async (c) => {
  try {
    const address = c.req.param('address');
    if (!address || address.length < 26 || address.length > 62) {
      return c.json({ success: false, error: 'Invalid address' }, 400);
    }

    const cached = await getWidgetUserSnapshot(c.env.DB, address);
    const now = Date.now();

    if (cached && now - cached.fetched_at <= WIDGET_CACHE_MAX_AGE_MS) {
      return c.json({ success: true, data: JSON.parse(cached.snapshot_json) });
    }

    const userResult = await getUser(c.env.PARASITE_API_URL, address);
    if (!userResult.success || !userResult.data) {
      if (cached) {
        return c.json({ success: true, data: JSON.parse(cached.snapshot_json) });
      }
      return c.json({ success: false, error: 'User snapshot unavailable' }, 503);
    }

    const snapshot = buildUserWidgetSnapshot(address, userResult.data, now);
    await upsertWidgetUserSnapshot(c.env.DB, address, JSON.stringify(snapshot), now);
    return c.json({ success: true, data: snapshot });
  } catch (error) {
    console.error('User widget snapshot error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ============================================================================
// Community chat
// ============================================================================

// Mint a short-lived session token for posting. Reading needs no session.
app.post('/chat/session', async (c) => {
  try {
    const body = await c.req.json();
    const result = chatSessionSchema.safeParse(body);
    if (!result.success) {
      return c.json({ success: false, error: result.error.flatten() }, 400);
    }
    const { btcAddress } = result.data;

    if (await isBanned(c.env.DB, btcAddress)) {
      return c.json({ success: false, error: 'This address is banned from chat' }, 403);
    }
    if (!(await passesActivityGate(c.env, btcAddress))) {
      return c.json(
        { success: false, error: 'Address has no activity on Parasite Pool' },
        403
      );
    }

    const token = await issueSessionToken(btcAddress, c.env.SESSION_SECRET);
    return c.json({ success: true, data: { token } });
  } catch (error) {
    console.error('chat/session error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Open-read history with an exclusive millisecond `before` cursor.
app.get('/chat/history', async (c) => {
  try {
    const before = c.req.query('before');
    const limit = c.req.query('limit');
    const address = c.req.query('address'); // optional: flags the caller's own reactions
    const messages = await getRecentMessages(c.env.DB, {
      before: before ? Number(before) : undefined,
      limit: limit ? Number(limit) : 50,
      address: address || undefined,
    });
    // Only send the announcement on the first page (no `before` cursor).
    const announcement = before ? undefined : await getAnnouncement(c.env.DB);
    return c.json({ success: true, data: { messages, announcement } });
  } catch (error) {
    console.error('chat/history error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// WebSocket upgrade. Optional `token` → posting allowed; absent → read-only.
// Validated address is forwarded to the DO via a query param it trusts (the DO
// is only reachable through this route).
app.get('/chat/ws', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.json({ success: false, error: 'Expected websocket' }, 426);
  }

  const token = c.req.query('token');
  let address = '';
  if (token) {
    const verified = await verifySessionToken(token, c.env.SESSION_SECRET);
    if (!verified) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401);
    }
    address = verified.address;
  }

  // Forward the upgrade to the DO. Clone via a Headers object (incoming request
  // headers are immutable) so the `Upgrade: websocket` header is preserved and
  // the validated address rides along in a header the DO trusts — reconstructing
  // the Request with a new URL drops the upgrade on the production runtime.
  const headers = new Headers(c.req.raw.headers);
  headers.set('X-Chat-Address', address);
  const stub = c.env.CHAT_ROOM.get(c.env.CHAT_ROOM.idFromName('global'));
  return stub.fetch(new Request(c.req.url, { method: 'GET', headers }));
});

// Set or clear a moderated nickname (falls back to truncated address).
app.put('/chat/nickname', async (c) => {
  try {
    const body = await c.req.json();
    const result = chatNicknameSchema.safeParse(body);
    if (!result.success) {
      return c.json({ success: false, error: result.error.flatten() }, 400);
    }
    const verified = await verifySessionToken(
      result.data.token,
      c.env.SESSION_SECRET
    );
    if (!verified) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401);
    }
    if (await isBanned(c.env.DB, verified.address)) {
      return c.json({ success: false, error: 'This address is banned from chat' }, 403);
    }

    const trimmed = stripInvisible(result.data.nickname).trim();
    if (trimmed && (!isClean(trimmed) || isReservedNickname(trimmed))) {
      return c.json({ success: false, error: 'Nickname not allowed' }, 400);
    }
    await setNickname(c.env.DB, verified.address, trimmed.length ? trimmed : null);
    return c.json({ success: true, data: { nickname: trimmed || null } });
  } catch (error) {
    console.error('chat/nickname error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Report a message → queued in chat_reports for admin triage.
app.post('/chat/report', async (c) => {
  try {
    const result = chatReportSchema.safeParse(await c.req.json());
    if (!result.success) {
      return c.json({ success: false, error: result.error.flatten() }, 400);
    }
    const verified = await verifySessionToken(
      result.data.token,
      c.env.SESSION_SECRET
    );
    if (!verified) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401);
    }
    if (await isBanned(c.env.DB, verified.address)) {
      return c.json({ success: false, error: 'This address is banned from chat' }, 403);
    }
    await addReport(c.env.DB, {
      id: crypto.randomUUID(),
      messageId: result.data.messageId,
      reporter: verified.address,
      reason: result.data.reason ?? '',
    });
    return c.json({ success: true });
  } catch (error) {
    console.error('chat/report error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Block / unblock an address (server-enforced in history + live delivery).
app.post('/chat/block', async (c) => {
  try {
    const result = chatBlockSchema.safeParse(await c.req.json());
    if (!result.success) {
      return c.json({ success: false, error: result.error.flatten() }, 400);
    }
    const verified = await verifySessionToken(
      result.data.token,
      c.env.SESSION_SECRET
    );
    if (!verified) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401);
    }
    await addBlock(c.env.DB, verified.address, result.data.targetAddress);
    return c.json({ success: true });
  } catch (error) {
    console.error('chat/block error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

app.delete('/chat/block', async (c) => {
  try {
    const result = chatBlockSchema.safeParse(await c.req.json());
    if (!result.success) {
      return c.json({ success: false, error: result.error.flatten() }, 400);
    }
    const verified = await verifySessionToken(
      result.data.token,
      c.env.SESSION_SECRET
    );
    if (!verified) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401);
    }
    await removeBlock(c.env.DB, verified.address, result.data.targetAddress);
    return c.json({ success: true });
  } catch (error) {
    console.error('chat/block delete error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Record one-time EULA / community-guidelines acceptance.
app.post('/chat/eula', async (c) => {
  try {
    const result = chatEulaSchema.safeParse(await c.req.json());
    if (!result.success) {
      return c.json({ success: false, error: result.error.flatten() }, 400);
    }
    const verified = await verifySessionToken(
      result.data.token,
      c.env.SESSION_SECRET
    );
    if (!verified) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401);
    }
    await recordEulaAcceptance(c.env.DB, verified.address, result.data.version);
    return c.json({ success: true });
  } catch (error) {
    console.error('chat/eula error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Current announcement banner (open read).
app.get('/chat/announcement', async (c) => {
  const announcement = await getAnnouncement(c.env.DB);
  return c.json({ success: true, data: { announcement } });
});

// Push an announcement change to all live sockets via the DO.
async function broadcastAnnouncement(
  env: Env,
  body: string | null
): Promise<void> {
  const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName('global'));
  await stub.fetch(
    new Request('https://do/internal/announcement', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    })
  );
}

// Tell live sockets a message was removed so it disappears without a reload.
async function broadcastDelete(env: Env, id: string): Promise<void> {
  const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName('global'));
  await stub.fetch(
    new Request('https://do/internal/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  );
}

// ---- Admin (guarded) --------------------------------------------------------

// The admin PAGE is public HTML; it prompts for the secret and calls the guarded
// API below with it. The API (/chat/admin/*) requires the ADMIN_SECRET header.
app.get('/chat/admin', (c) => c.html(adminPageHtml()));

app.use('/chat/admin/*', async (c, next) => {
  const secret = c.req.header('X-Admin-Secret');
  if (!secret || !timingSafeEqual(secret, c.env.ADMIN_SECRET ?? '')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  await next();
});

app.get('/chat/admin/reports', async (c) => {
  const reports = await getOpenReports(c.env.DB);
  return c.json({ success: true, data: { reports } });
});

app.delete('/chat/admin/message/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await softDeleteMessage(c.env.DB, id);
  if (deleted) await broadcastDelete(c.env, id); // drop it from live sockets
  return c.json({ success: true, data: { deleted } });
});

app.post('/chat/admin/ban', async (c) => {
  const result = chatAdminBanSchema.safeParse(await c.req.json());
  if (!result.success) {
    return c.json({ success: false, error: result.error.flatten() }, 400);
  }
  await banAddress(c.env.DB, result.data.address, result.data.reason ?? '');
  return c.json({ success: true });
});

app.post('/chat/admin/reports/:id/resolve', async (c) => {
  const resolved = await resolveReport(c.env.DB, c.req.param('id'));
  return c.json({ success: true, data: { resolved } });
});

app.post('/chat/admin/announcement', async (c) => {
  const result = chatAnnouncementSchema.safeParse(await c.req.json());
  if (!result.success) {
    return c.json({ success: false, error: result.error.flatten() }, 400);
  }
  await setAnnouncement(c.env.DB, result.data.body);
  await broadcastAnnouncement(c.env, result.data.body);
  return c.json({ success: true });
});

app.delete('/chat/admin/announcement', async (c) => {
  await setAnnouncement(c.env.DB, null);
  await broadcastAnnouncement(c.env, null);
  return c.json({ success: true });
});

export { ChatRoom } from './chat/room';

export default {
  fetch: app.fetch,
  scheduled: async (
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ) => {
    ctx.waitUntil(runCronJob(env, event.scheduledTime));
  },
};
