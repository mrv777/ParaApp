# ParaApp Notifications Server

Cloudflare Worker that handles push notifications for the ParaApp mobile app.

## Features

- Device registration with Expo Push Tokens
- Per-user notification preferences (blocks, workers, best difficulty)
- Cron job (every minute) that:
  - Detects pool-wide blocks
  - Monitors worker online/offline status
  - Tracks personal best difficulty improvements

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Node.js 18+
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

## Development

```bash
# Run locally with local D1
pnpm dev

# Typecheck
pnpm typecheck
```

## Deployment

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
- Worker is "stale" if no submission in 5 minutes
- After 5 consecutive stale checks (5 minutes), notification sent
- When worker comes back online, "back online" notification sent

### Best Difficulty
- Only notifies if user had a previous best (not first-time)
- Compares current vs stored difficulty

### Block Detection
- Compares `lastBlockTime` from pool stats
- Notifies all users with block notifications enabled

## Notes

- Maximum 10 devices per BTC address
- Push tokens are validated (`ExponentPushToken[...]` format)
- Invalid tokens are automatically marked inactive after Expo returns `DeviceNotRegistered`
