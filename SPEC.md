# ParaApp — SPEC.md

A React Native/Expo mobile app for monitoring Bitcoin mining on [Parasite Pool](https://parasite.space/) and managing local miners. Styled as a native mobile extension of the Parasite Pool website aesthetic.

---

## Overview

The app provides two core functions:

1. **Pool Monitoring** — View personal and pool-wide stats from Parasite's public API
2. **Local Miner Management** — Discover and control AxeOS devices on the same network

---

## Platform & Tech Stack

- **Framework:** React Native with Expo
- **Platforms:** iOS and Android
- **Language:** TypeScript
- **APIs:**
  - Parasite Pool — public REST API (no auth)
  - AxeOS Miners — local HTTP API (same network only)
  - mempool.space — Bitcoin price and network data

### Recommended Packages

| Category | Package | Purpose |
|----------|---------|---------|
| Navigation | `@react-navigation/native` + `@react-navigation/bottom-tabs` | Tab-based navigation |
| State | `zustand` or `@legendapp/state` | Lightweight state management |
| Storage | `@react-native-async-storage/async-storage` | Persistent local storage |
| Charts | `@wuba/react-native-echarts` + `@shopify/react-native-skia` | ECharts with Skia rendering |
| Animations | `react-native-reanimated` | Rich animations |
| Haptics | `expo-haptics` | Tactile feedback |
| Camera | `expo-camera` or `expo-barcode-scanner` | QR code scanning |
| Network | `@react-native-community/netinfo` | Network state detection |
| i18n | `i18next` + `react-i18next` | Internationalization framework |
| Validation | `bitcoinjs-lib` or regex fallback | Bitcoin address validation |

---

## Design System

### Visual Identity
- **Theme:** Dark mode only (v1)
- **Aesthetic:** Full match with Parasite Pool website design
  - Match colors, typography, card styles, chart appearance
  - App should feel like a native extension of the website
- **Animations:** Rich, polished motion design matching website
- **Text:** Minimal — UI should be icon and visual-driven
- **Tab Icons:** Custom Bitcoin/mining themed iconography

### Warning Colors
- **Caution (68°C):** Yellow
- **Danger (70°C+):** Red

### Typography & Numbers
- **Hashrate:** Auto-scale with 3 significant digits (e.g., "1.23 TH/s", "456 GH/s")
- **Temperature:** User-configurable (Celsius/Fahrenheit)
- **Numbers:** Locale-based formatting (commas or spaces per device setting)
- **Uptime:** Compact format ("3d 4h 12m")
- **Timestamps:** Relative up to 24h ("5 minutes ago"), then absolute ("Dec 31, 14:23")
- **Bitcoin Price:** USD only for pool stats display
- **Sats-focused:** Use satoshi values where appropriate

---

## Features

### 1. Pool Monitoring (Parasite API)

#### Personal Stats (requires Bitcoin address)
- Hashrate (current, 1h, 24h averages)
- Workers list with individual stats
- Shares accepted/rejected
- Best difficulty achieved

#### Pool-Wide Stats
- Total pool hashrate (current + historical charts)
- Blocks found (height, time, finder address truncated)
- Pool difficulty
- Bitcoin price
- Pool uptime
- Users/workers count

#### Leaderboards
- **Top Difficulty:** Scrollable list with user's position pinned/highlighted
- **Top Loyalty:** API-defined metric, same display pattern

#### Historical Charts
- **Time Presets:** 1h, 24h, 7d, 30d (fixed, no custom ranges for v1)
- **Chart Type:** Line chart with touch interaction (tooltip shows point values)
- **Orientation:** Portrait normally, landscape supported for full-screen chart view

### 2. Local Miner Management (AxeOS)

> **Network Requirement:** Miner controls only available when app and miner are on the same network. Clear "offline/unreachable" indicators when miners can't be reached.

#### Discovery & Setup
- **Auto-discovery:** Scan local subnet to find AxeOS devices
  - Device IP-based subnet detection (primary)
  - Option to manually specify IP range
  - Background scan with progress indicator
  - Miners appear in real-time as discovered
- **Manual entry:** Add miners by IP address
- **Remove:** Delete miners from saved list

#### Miner Information (read)
- Device info: hostname, model, ASIC type, firmware version
- Performance: hashrate, power, voltage, temperature
- Network: IP, WiFi status, RSSI
- Mining: pool config, shares, best difficulty, uptime

#### Miner Controls (write)
- **Restart** — Reboot device (swipe-to-confirm)
- **Identify** — Flash LED (~10-15 seconds, user-friendly duration)
- **Settings** — Modify frequency, voltage, fan speed, pool config
  - Preview changes before applying
  - Stepped slider increments (not free-form)
  - Warn for extreme values, but allow user to proceed
  - **Pool Config:** All fields editable (URL, port, user, password)
  - **Parasite Preset:** One-tap button to fill Parasite stratum settings

> **Note:** OTA firmware updates deferred to future version.

#### Worker Linking
- Associate local miners with Parasite workers by matching `stratumUser`
- If multiple miners share same `stratumUser`: aggregated stats with expandable miner list

---

## Navigation

Bottom tab bar with 4 tabs:

| Tab | Icon | Content |
|-----|------|---------|
| **Home** | house (custom) | Personal stats + miner fleet overview |
| **Pool** | chart (custom) | Pool-wide stats, charts, leaderboards |
| **Miners** | chip (custom) | Local miner device list |
| **Settings** | gear (custom) | Bitcoin address, preferences, about |

### Screen Details

#### Home
- **Without address configured:**
  - Pool info summary (hashrate, blocks, etc.)
  - Prompt to add Bitcoin address
  - Miner fleet overview (if any miners saved)
- **With address configured:**
  - User hashrate (current, 1h, 24h)
  - Workers: Top 3-5 with full stats (name, hashrate, best diff, last submission)
  - "View all workers" → navigates to Workers List screen
  - Best difficulty achieved
  - Miner fleet overview: total hashrate, highest diff, warning count
  - Subtle connection status indicator

#### Pool
- Pool hashrate + historical chart
- Users / workers count
- Blocks found (height, time, truncated finder address)
- Last block time
- Bitcoin price (USD)
- Pool uptime
- Leaderboards:
  - Top Difficulty (scrollable, user position pinned)
  - Top Loyalty (scrollable, user position pinned)

#### Workers List (from Home → "View all workers")
- Full list of all workers
- Each row: name, hashrate, best diff, last submission
- Tap to expand inline with additional details

#### Miners
- List of saved miner devices
- **Ordering:** Most recently added/accessed first
- **Features:** Sort by hashrate/temp/status/name + filter by online/offline/warning
- Each item shows: hostname (or alias), hashrate, temp, status indicator
- **Warning display:** Push problem miners to top with prominent badge
- **Warning conditions (comprehensive):**
  - Temperature ≥68°C (caution/yellow)
  - Temperature ≥70°C (danger/red)
  - `overheat_mode` or `power_fault` flags
  - Hashrate significantly below model's expected rate
  - Network connectivity issues
- Add (manual IP) / Scan (auto-discovery) actions
- Network availability banner when miners unreachable

#### Miner Detail (tap miner in list)
- **Layout:** Continuous scrolling, no tabs/cards
- **Stats:** Hashrate, power, temp, voltage, shares, uptime, best diff
- **Device info:** Model, ASIC, firmware, IP, hostname
- **Controls:**
  - Restart (swipe-to-confirm)
  - Identify (flash LED)
  - Settings (preview + apply pattern)
- **Linked worker:** If `stratumUser` matches a Parasite worker, show linked pool stats
- **Offline state:** Show minimal info (name, IP, status) + last recorded best diff

#### Miner Alias
- Users can set custom alias for each miner
- Display: alias if set, otherwise hostname

#### Settings
- **Bitcoin address:**
  - Text input with QR code scan button (camera)
  - Full validation (checksum) if library available, otherwise regex format check
- **Visibility toggle:** Private/public on leaderboards (subtle, in advanced section)
- **Temperature unit:** Celsius / Fahrenheit toggle
- **Polling interval:** 5s, 10s (default), 20s, 30s
- **About:** App version, link to Parasite Pool, link to GitHub (minimal)

---

## Data & State Management

### Polling Behavior
- **Active app:** Poll at configured interval (default 10s)
- **Backgrounded:** Stop all polling (battery optimization)
- **Pull-to-refresh:** Refresh current screen + related data

### Caching Strategy
- Cache all API responses with timestamps
- **<1 hour stale:** Show cached data immediately
- **>1 hour stale:** Show skeleton loaders, fetch fresh data
- Display "Updated X ago" indicator with cached data

### Miner Connectivity
- **Detection:** Attempt connection (account for VPN scenarios)
- **Retry policy:** Graceful degradation — show "connecting..." state, retry indefinitely in background
- **Timeout:** 5 seconds per request

### Local Storage (device-only, v1)
- Saved miners (IP addresses + aliases)
- Bitcoin address
- User preferences (temp unit, polling interval)
- Worker-to-miner linkages
- Cached API responses with timestamps

> **Future:** Export/import settings for device transfer

---

## Error Handling

- **API failures:** Inline error banner at top of affected section, keep stale data visible below
- **Empty user state:** Show zeros with "No mining activity yet" explanation
- **Invalid address:** Validation feedback on input, prevent saving invalid addresses

---

## UI Patterns

### Loading States
- **No cache / >1hr stale:** Skeleton screens matching content layout
- **Fresh cache available:** Show data immediately, update silently

### Confirmations
- **Dangerous actions:** Swipe-to-confirm gesture (restart, settings apply)
- **Standard actions:** Tap without confirmation (identify, refresh)

### Feedback
- **Haptics:** Success/error confirmations, swipe confirmations, key interactions
- **No analytics:** Privacy-first, no usage tracking

### Orientation
- **Portrait:** Default for all screens
- **Landscape:** Supported for chart full-screen view

### Onboarding
- **No blocking wizard:** App usable immediately with pool data
- **First-time hints:** Tooltip hints pointing to key features
- **Empty states:** Clear prompts to configure address or add miners

### Accessibility (v1)
- Basic VoiceOver/TalkBack support
- Main actions accessible
- Future improvements planned

---

## Sharing

- **Share stats image:** Generate branded card with key stats (hashrate, workers, best diff)
- **Format:** Shareable image suitable for social media

---

## Internationalization

- **v1:** English only
- **Structure:** i18n framework in place for easy future language additions
- **Approach:** Minimal UI text, icon-driven design

---

## Parasite API Reference

Base URL: `https://parasite.space`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pool-stats` | GET | Pool-wide stats |
| `/api/pool-stats/historical?period={period}&interval={interval}` | GET | Historical pool stats |
| `/api/user/{address}` | GET | User data by Bitcoin address |
| `/api/user/{address}` | PATCH | Toggle user visibility (public/private) |
| `/api/user/{address}/historical?period={period}&interval={interval}` | GET | Historical user stats |
| `/api/highest-diff?limit={limit}` | GET | Top difficulty leaderboard |
| `/api/highest-diff?address={address}&type=user-diffs&limit={limit}` | GET | User's block diffs |

**Parameters:**
- `period`: Time period (e.g., `"1h"`, `"24h"`, `"7d"`, `"30d"`)
- `interval`: Data granularity (e.g., `"5m"`)
- `limit`: Number of results to return

**External APIs:**
- Bitcoin price: `https://mempool.space/api/v1/prices`
- Network hashrate, difficulty via `@mempool/mempool.js`

---

## Data Models

### Parasite Pool Stats
```ts
interface PoolStats {
  uptime: string;
  lastBlockTime: string;
  highestDifficulty: string;
  hashrate: number;
  users: number;
  workers: number;
}
```

### Parasite Block (with finder)
```ts
interface PoolBlock {
  block_height: number;
  top_diff_address: string;  // Truncated for privacy
  difficulty: number;
  block_timestamp: number | null;
}
```

### Parasite User Worker
```ts
interface UserWorker {
  name: string;
  hashrate: number;
  bestDifficulty: number;
  lastSubmission: number;  // timestamp
  status: 'online' | 'offline';
}
```

### Local Miner (AxeOS)
```ts
interface LocalMiner {
  ip: string;
  alias?: string;           // User-defined name
  hostname: string;
  ASICModel: string;        // e.g., "BM1370"
  deviceModel: string;      // e.g., "Gamma", "Ultra", "Supra"
  expectedHashrate: number; // Based on model
  hashRate: number;
  power: number;
  temp: number;
  voltage: number;
  fanSpeed: number;
  bestDiff: number;
  sharesAccepted: number;
  sharesRejected: number;
  stratumUser: string;
  stratumUrl: string;
  stratumPort: number;
  version: string;
  uptimeSeconds: number;
  wifiSSID?: string;
  rssi?: number;
  overheatMode?: boolean;
  powerFault?: boolean;
  lastSeen: number;         // timestamp
  isOnline: boolean;
}
```

### Warning State
```ts
interface MinerWarning {
  type: 'temp_caution' | 'temp_danger' | 'overheat' | 'power_fault' | 'low_hashrate' | 'offline';
  severity: 'caution' | 'danger';
  message?: string;
}
```

---

## Local Miner API Reference

Base URL: `http://{miner_ip}`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/system/info` | GET | Full device status and stats |
| `/api/system/asic` | GET | ASIC-specific settings and options |
| `/api/system` | PATCH | Update device settings |
| `/api/system/restart` | POST | Reboot device |
| `/api/system/identify` | POST | Flash LED |

---

## Future Considerations (Out of Scope v1)

### Planned for Later Versions
- OTA firmware updates
- Push notifications (requires backend)
- Settings export/import
- Light theme option
- Additional languages
- Enhanced accessibility
- Quick actions on app icon
- Widget support

### Out of Scope
- Wallet/payout tracking
- Multiple pool support
- Miner swarm/group management
- Other miner types (non-AxeOS)
- Usage analytics

---

## References

- [Parasite Pool](https://parasite.space/)
- [Parastats](https://github.com/parasitepool/parastats) — Parasite web app and API
- [ESP-Miner / AxeOS](https://github.com/bitaxeorg/ESP-Miner) — AxeOS firmware and local API
