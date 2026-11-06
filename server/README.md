# ParaApp Notifications Server

Cloudflare Worker that handles push notifications for the ParaApp mobile app.

## Shared English chat translations

New non-English chat messages can receive one shared English translation. The
original is persisted and broadcast first; translation is best-effort background
work with two five-second provider timeouts and no automatic retries. Both
versions are returned in history. Older app versions continue to show originals;
the updated app provides a saved Original/English preference and a per-message
toggle. Reply quotes, copies, and reports continue to reference original text.

Translation is **off by default**. To enable it:

Migration 0015 is required before deploying this release even when translation
is disabled: history, moderation, and retention queries join its tables. The
feature flag controls provider work, not the database schema.

1. Create or select a Google Cloud project with billing enabled. Enable the
   **Cloud Translation API** and create an API key restricted to that API. The
   server uses Basic v2 NMT; it does not need a Google SDK or a client-side key.
2. Apply the additive database migration **before deploying the new Worker**:
   ```bash
   cd server
   ./node_modules/.bin/wrangler d1 execute paraapp-notifications-db --remote \
     --file=migrations/0015_chat_translations.sql
   ```
3. Store the key securely (the command prompts for it):
   ```bash
   ./node_modules/.bin/wrangler secret put GOOGLE_TRANSLATE_API_KEY
   ```
   Never place the key in the mobile app, tracked files, URLs, or logs. Local
   development can use an untracked `.dev.vars` entry instead.
4. Set `CHAT_TRANSLATION_ENABLED = "on"` in `wrangler.toml`, keep
   `CHAT_TRANSLATION_MONTHLY_LIMIT = "500"`, and deploy the Worker. First verify
   synthetic German/English examples, identifier preservation, and the app's
   original/English controls before enabling it for the community. Publish the
   updated privacy page alongside activation.

Allowances are shared across the whole community and reset at 00:00 UTC on the
first of each month. At most 500 non-English translation attempts are reserved;
failed and timed-out translation calls count, and deleting a message does not
refund allowance. English detections do not use those 500 slots. Separate
250,000-character limits for detection and translation bound this feature's
combined metered input to 500,000 characters per UTC month. Reservations are
atomic and made before provider calls; up to 499 characters per budget can be
left unused to retain room for a maximum-length message. Missing credentials,
exhausted budgets, provider errors, or uncertain language results leave originals
available. Only new accepted messages are processed; history reads never trigger
paid work or a retrospective backfill.

Google's recurring free allowance is **characters, not messages**, and requires
an eligible billing account with allowance remaining. Other applications or
manual API usage can consume it. These application limits are not an account-wide
billing guarantee. See [Google pricing](https://cloud.google.com/products/translate/pricing).

`GET /chat/history` includes `translationStatus` on its first page. Its `used`
value counts reserved translation attempts, `limitReached` also includes the
character limits, and `resetsAt` is milliseconds since epoch. The WebSocket adds
`translation` (message ID + `englishTranslation`) and `translation_status`
events; originals retain their IDs, timestamps, and bodies. Translations are
removed with deleted/pruned messages and hidden from viewers who block their
authors. Setting the enable flag to `"off"` prevents new translation jobs;
already stored translations remain readable. There is no public paid translation
endpoint and no retry queue.

## Features

- Device registration with Expo Push Tokens
- Per-device notification preferences (blocks, workers, best difficulty, rewards)
- Cron job (every minute) that:
  - Detects pool-wide blocks
  - Monitors worker online/offline status
  - Tracks personal best difficulty improvements

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Node.js 22.23.4 (see the repository's `.nvmrc`)
- pnpm

## Setup

1. **Install dependencies**
   ```bash
   cd server
   pnpm install
   ```

2. **Login to Cloudflare**
   ```bash
   npx wrangler login
   ```

3. **Create D1 database** (first time only)
   ```bash
   npx wrangler d1 create paraapp-notifications-db
   ```
   Update `wrangler.toml` with the returned `database_id`.

4. **Apply database schema**
   ```bash
   npx wrangler d1 execute paraapp-notifications-db --remote --file=schema.sql
   ```
   `schema.sql` is the full schema for a **fresh** database and is idempotent
   (safe to re-run). For **incremental** changes to an already-deployed database,
   add and apply a delta file under `migrations/` — `CREATE TABLE IF NOT EXISTS`
   in `schema.sql` will not add new columns to an existing table.

   **Apply pending migrations before deploying a worker that uses them:**
   ```bash
   npx wrangler d1 execute paraapp-notifications-db --remote \
     --file=migrations/0001_add_widget_schema.sql
   ```

   Before deploying the push registration security update, apply its migration:
   ```bash
   pnpm exec wrangler d1 execute paraapp-notifications-db --remote \
     --file=migrations/0014_push_enrollment_limits.sql
   ```

## Development

```bash
# Run locally with local D1
pnpm dev

# Typecheck
pnpm typecheck
```

## Deployment

The current backend release is 1.1.1; `GET /` reports its version so a deployed
Worker can be matched to a release. Apply the required database migrations,
run the root test suite and both type checks, and verify `wrangler deploy
--dry-run` before deploying. Migration 0013 adds device preference columns; do
not rerun it on databases where those columns were applied manually.

```bash
# Deploy to Cloudflare Workers
pnpm deploy
# or
npx wrangler deploy
```

## Debugging

### View live logs
```bash
npx wrangler tail --format pretty
```

### Query database
```bash
# Check subscriptions
npx wrangler d1 execute paraapp-notifications-db --remote \
  --command "SELECT * FROM push_subscriptions;"

# Check user state (cron updates this)
npx wrangler d1 execute paraapp-notifications-db --remote \
  --command "SELECT * FROM user_state;"

# Check pool state (block detection)
npx wrangler d1 execute paraapp-notifications-db --remote \
  --command "SELECT * FROM pool_state;"
```

### Test push notification
```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[YOUR_TOKEN]",
    "title": "Test",
    "body": "Test notification"
  }'
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Mobile App    │────▶│  CF Worker API   │────▶│   D1 Database   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   Cron (1 min)   │
                        └──────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │ Parasite API │ │ Expo Push API│ │ D1 Database  │
      └──────────────┘ └──────────────┘ └──────────────┘
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/register` | Register device for notifications |
| DELETE | `/unregister` | Unregister device |
| PATCH | `/preferences` | Update notification preferences |
| GET | `/preferences/:address` | Get notification preferences |

## Notification Logic

### Worker Offline Detection
- Cron checks `lastSubmission` timestamp for each worker
- A worker is "stale" after 10 minutes without a submission
- An offline notification follows 5 consecutive successful stale checks; fleet coverage rotates, so this can span multiple one-minute cron ticks
- When worker comes back online, "back online" notification sent

### Best Difficulty
- Only notifies if user had a previous best (not first-time)
- Compares current vs stored difficulty

### Block Detection
- Compares `lastBlockTime` from pool stats
- Notifies all users with block notifications enabled

## Notes

- New registrations, inactive-token reactivations, and address moves are limited
  to 30 attempts per hour per Cloudflare connecting IP. Existing active devices
  can refresh normally even when that source budget is exhausted. Shared networks
  share this temporary budget; there is no address-wide device cap that strangers
  can exhaust using a public Bitcoin address. HTTP 429 includes `Retry-After`.
- Only an HMAC of the Cloudflare-provided IP is stored; the existing
  `SESSION_SECRET` is reused with a separate purpose prefix. Missing ingress IP
  or secret returns HTTP 503 for new enrollment. For local API testing, supply a
  `CF-Connecting-IP` header (production Cloudflare supplies it automatically).
  Enrollment counters are pruned by cron after their windows expire.
- Push tokens are validated (`ExponentPushToken[...]` format)
- Invalid tokens are automatically marked inactive after Expo returns `DeviceNotRegistered`
