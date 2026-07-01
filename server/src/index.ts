import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import {
  registerSchema,
  unregisterSchema,
  preferencesSchema,
} from './validation';
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
        'SELECT btc_address, updated_at FROM push_subscriptions WHERE push_token = ?'
      )
        .bind(pushToken)
        .first<{ btc_address: string; updated_at: number }>();

      // If token exists with same address and was recently updated, return cached prefs (rate limited)
      if (existing && existing.btc_address === btcAddress) {
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
