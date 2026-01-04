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
  MaxDevicesExceededError,
} from './db';
import { runCronJob } from './cron';

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

    await upsertSubscription(c.env.DB, pushToken, btcAddress);

    if (preferences) {
      await upsertPreferences(c.env.DB, btcAddress, preferences);
    }

    return c.json({ success: true });
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

    const { btcAddress, ...prefs } = result.data;
    await upsertPreferences(c.env.DB, btcAddress, prefs);

    return c.json({ success: true });
  } catch (error) {
    console.error('Preferences error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get notification preferences
app.get('/preferences/:address', async (c) => {
  try {
    const address = c.req.param('address');
    const prefs = await getPreferences(c.env.DB, address);

    if (!prefs) {
      // Return defaults if no preferences set
      return c.json({
        success: true,
        preferences: {
          blocks: true,
          workers: true,
          bestDiff: true,
        },
      });
    }

    return c.json({
      success: true,
      preferences: {
        blocks: prefs.notify_blocks === 1,
        workers: prefs.notify_workers === 1,
        bestDiff: prefs.notify_best_diff === 1,
      },
    });
  } catch (error) {
    console.error('Get preferences error:', error);
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
