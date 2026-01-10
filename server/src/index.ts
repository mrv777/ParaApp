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
} from './db';
import { runCronJob } from './cron';
import { getUser } from './parasite-api';

const app = new Hono<{ Bindings: Env }>();

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

    const { pushToken, btcAddress, preferences } = result.data;

    // Validate address exists on Parasite Pool before registering
    const userResult = await getUser(c.env.PARASITE_API_URL, btcAddress);
    if (!userResult.success || !userResult.data) {
      return c.json({ success: false, error: 'Address not found on Parasite Pool' }, 404);
    }

    await upsertSubscription(c.env.DB, pushToken, btcAddress);

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

    const { pushToken, btcAddress, ...prefs } = result.data;

    // Verify ownership: pushToken must be registered to this address
    const isOwner = await verifyTokenOwnership(c.env.DB, pushToken, btcAddress);
    if (!isOwner) {
      return c.json({ success: false, error: 'Unauthorized' }, 403);
    }

    await upsertPreferences(c.env.DB, btcAddress, prefs);

    return c.json({ success: true });
  } catch (error) {
    console.error('Preferences error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export default {
  fetch: app.fetch,
  scheduled: async (
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ) => {
    ctx.waitUntil(runCronJob(env));
  },
};
