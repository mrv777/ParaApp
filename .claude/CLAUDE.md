# ParaApp - React Native Mining Monitor

## Project Overview

A React Native/Expo mobile app for monitoring Bitcoin mining on Parasite Pool and managing local Bitaxe miners. Dark theme matching the Parasite Pool website aesthetic.

## Quick Reference

**Tech Stack:**
- React Native + Expo SDK 54 (TypeScript)
- NativeWind + Tailwind CSS v3 (styling)
- Zustand (state management)
- React Navigation v7 (bottom tabs + stack)
- react-native-reanimated (animations)
- @wuba/react-native-echarts (charts, lazy-loaded)

**Key Directories:**
- `/src/screens/` - Screen components
- `/src/screens/settings/` - Settings tab screens (SettingsMainScreen, QRScannerScreen)
- `/src/components/` - Reusable UI components
- `/src/components/miners/` - Miner discovery & list components
- `/src/navigation/` - Stack navigators (HomeStack, MinersStack, SettingsStack)
- `/src/store/` - Zustand stores (pool, user, miner, settings)
- `/src/api/` - API clients (parasite, bitaxe, mempool)
- `/src/hooks/` - Custom hooks (polling, app state)
- `/src/utils/` - Utilities (formatting, validation, discovery, haptics)
- `/src/types/` - TypeScript interfaces
- `/src/constants/` - Theme, colors, config

**Commands:**
```bash
pnpm start              # Start Expo dev server
pnpm lint               # ESLint check
pnpm typecheck          # TypeScript check
pnpx expo-doctor        # Diagnose project issues
pnpm exec expo install --fix  # Fix package versions
```

## Current Phase

**Phase:** 4A - Complete (Settings Screen)
**Status:** Ready for Phase 4B (Onboarding & Empty States)

**Phase 4A Completed:**
- SettingsStack navigator with QRScanner modal
- SettingsMainScreen with all preference controls
- Bitcoin address input with QR scan button and validation
- QRScannerScreen: Full-screen camera with expo-camera, BIP21 parsing
- Visibility toggle (leaderboard public/private)
- Temperature unit selector (C/F)
- Polling interval selector (5s, 10s, 20s, 30s)
- About section with version, Parasite Pool link, GitHub link
- Camera permission handling with request/denied states
- All preferences persist via Zustand settings store

See `IMPLEMENTATION.md` for phase details and prompts.

## Code Standards

### Components
- Functional components with TypeScript
- Props interfaces defined
- Cleanup in useEffect returns

### State Management
- Zustand for global state
- Selectors must return stable references (use const empty arrays)
- AsyncStorage for persistence

### Styling (NativeWind)
- Dark theme only (v1)
- Key classes: `bg-background`, `bg-secondary`, `text-foreground`, `text-muted`, `border-border`
- Warnings: `text-warning` (68°C), `text-danger` (70°C+)

### Charts (@wuba/react-native-echarts)
- Use lazy loading pattern (dynamic imports inside component)
- Show skeleton while echarts initializes
- tslib override required in package.json (^2.6.0)

### Numbers & Formatting
- Hashrate: 3 significant digits, auto-scale units
- Temperature: User preference (C/F)
- Timestamps: Relative <24h, absolute after

## Known Issues & Fixes

### ECharts Runtime Error
If you see `Cannot read property '__extends' of undefined`:
- Ensure `pnpm.overrides` has `"tslib": "^2.6.0"` in package.json
- Run `pnpm install` to apply override

### Zustand Infinite Loop
If selectors cause infinite re-renders:
- Don't return `|| []` from selectors - use a const empty array instead
- Example: `const EMPTY = []; select = (s) => s.data ?? EMPTY;`

### Bitaxe Restart API
The restart endpoint causes the miner to reboot immediately, dropping the connection before responding:
- Set `retries: 0` (no point retrying a rebooting device)
- Treat `NETWORK_ERROR` or `TIMEOUT` as success (expected behavior)

## Subagents

- **test-runner:** After implementing features
- **code-reviewer:** Before committing changes
- **ui-reviewer:** After building new screens
