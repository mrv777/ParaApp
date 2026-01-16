# ParaApp - React Native Mining Monitor

## Project Overview

A React Native/Expo mobile app for monitoring Bitcoin mining on Parasite Pool and managing local miners. Dark theme matching the Parasite Pool website aesthetic.

## Quick Reference

**Tech Stack:**
- React Native 0.81 + Expo SDK 54 (TypeScript)
- NativeWind v4 + Tailwind CSS v3 (styling)
- Zustand v5 (state management with AsyncStorage persistence)
- React Navigation v7 (bottom tabs + nested stacks)
- react-native-reanimated v4 (animations)
- @wuba/react-native-echarts + echarts v6 (charts, lazy-loaded)
- i18next + react-i18next (internationalization)
- @gorhom/bottom-sheet (modals)
- expo-camera (QR scanning)

**Key Directories:**
```
/src
├── api/              # API clients
│   ├── parasite.ts   # Parasite Pool API
│   ├── axeOS.ts      # AxeOS miner API (Bitaxe, etc.)
│   ├── mempool.ts    # Bitcoin price API
│   └── push.ts       # Push notification registration
├── components/
│   ├── charts/       # ECharts wrappers, full-screen modals
│   ├── home/         # Home tab components (stats, workers, fleet)
│   ├── miners/       # Miner discovery, list, detail components
│   ├── pool/         # Pool stats, leaderboards, blocks
│   ├── settings/     # Settings UI components
│   └── navigation/   # Custom tab bar
├── hooks/            # Custom hooks (polling, app state, orientation)
├── i18n/             # Internationalization (en, de, es, fr, pt)
├── navigation/       # Stack navigators (Home, Miners, Settings)
├── screens/
│   ├── home/         # HomeMainScreen, WorkersListScreen
│   ├── miners/       # MinerDetailScreen, MinerSettingsScreen
│   └── settings/     # SettingsMainScreen, QRScannerScreen
├── store/            # Zustand stores (pool, user, miner, settings)
├── types/            # TypeScript interfaces
├── utils/            # Formatting, validation, discovery, haptics
└── constants/        # Theme, colors, config
```

**Commands:**
```bash
pnpm start              # Start Expo dev server
pnpm lint               # ESLint check
pnpm typecheck          # TypeScript check
pnpx expo-doctor        # Diagnose project issues
pnpm exec expo install --fix  # Fix package versions
```

## Current Status

**Phase 4A Complete** - Settings screen with all preferences functional.

**Implemented Features:**
- Pool monitoring with historical hashrate charts
- User stats display (hashrate, difficulty, workers)
- Worker list with expandable details and custom notes
- Leaderboards (difficulty, loyalty) with user highlighting
- Local miner discovery (auto-scan + manual IP)
- Miner detail with live stats, controls (restart, LED identify)
- Miner settings (frequency, voltage, fan, pool config)
- Worker-miner linking (bidirectional display)
- Fleet overview card with aggregate stats
- Shareable stats image generation
- QR code scanning for Bitcoin addresses
- Multi-language support (5 languages)

**Remaining (Phase 4B+):**
- First-run tooltip hints
- Empty state polish
- Accessibility labels
- Integration testing

See `IMPLEMENTATION.md` for full phase details.

## Code Standards

### Components
- Functional components with TypeScript
- Props interfaces defined inline or exported
- Cleanup in useEffect returns
- Memoize expensive renders with useMemo/useCallback

### State Management
- Zustand v5 for global state
- Selectors MUST return stable references:
  ```ts
  // BAD - creates new array every render
  const workers = useUserStore((s) => s.workers || []);

  // GOOD - stable reference
  const EMPTY: Worker[] = [];
  const workers = useUserStore((s) => s.workers ?? EMPTY);
  ```
- AsyncStorage for persistence via Zustand middleware

### Styling (NativeWind v4)
- Dark theme only (v1)
- Key classes: `bg-background`, `bg-secondary`, `text-foreground`, `text-muted`, `border-border`
- Accent: `text-primary`, `bg-primary`
- Warnings: `text-warning` (68°C), `text-danger` (70°C+)

### Charts (@wuba/react-native-echarts)
- Use lazy loading pattern (dynamic imports inside component)
- Show `<ChartSkeleton />` while echarts initializes
- tslib override required in package.json (^2.6.0)
- Full-screen modal pattern in `/src/components/charts/FullScreenChartModal.tsx`

### Numbers & Formatting
- Hashrate: 3 significant digits, auto-scale units (`formatHashrate()`)
- Temperature: User preference (C/F) via settings store
- Timestamps: Relative <24h, absolute after (`formatRelativeTime()`)
- All formatters in `/src/utils/formatting.ts`

### API Calls
- Base client in `/src/api/client.ts` with timeout and retry
- 5s timeout for local miner APIs
- Handle network errors gracefully, update store error state

## Known Issues & Fixes

### ECharts Runtime Error
If you see `Cannot read property '__extends' of undefined`:
- Ensure `pnpm.overrides` has `"tslib": "^2.6.0"` in package.json
- Run `pnpm install` to apply override

### Zustand Infinite Loop
If selectors cause infinite re-renders:
- Don't return `|| []` from selectors - use a const empty array instead
- See State Management section above

### AxeOS Restart API
The restart endpoint causes the miner to reboot immediately, dropping the connection before responding:
- Set `retries: 0` (no point retrying a rebooting device)
- Treat `NETWORK_ERROR` or `TIMEOUT` as success (expected behavior)
- Show "Reconnecting..." state and poll until back online

### NativeWind className Issues
If styles aren't applying:
- Ensure component accepts `className` prop
- Check `tailwind.config.js` content paths include your file

## API Reference

**Parasite Pool:** `https://parasite.space/api/`
- `GET /pool-stats` - Pool hashrate, users, workers
- `GET /pool-stats/historical` - Historical data for charts
- `GET /user/{address}` - User stats and workers
- `GET /user/{address}/historical` - User historical data
- `PATCH /user/{address}` - Update visibility preference
- `GET /highest-diff` - Leaderboard data

**AxeOS (local miners):** `http://{ip}/api/`
- `GET /system/info` - System info (discovery probe)
- `GET /system` - Full miner stats
- `GET /system/asic` - ASIC config options (frequency, voltage ranges)
- `PATCH /system` - Update miner settings
- `POST /system/restart` - Reboot miner
- `POST /system/identify` - Flash LED for identification

## Subagents

- **test-runner:** After implementing features
- **code-reviewer:** Before committing changes
- **ui-reviewer:** After building new screens (compares to parasite.space design)
