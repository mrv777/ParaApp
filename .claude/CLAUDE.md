# ParaApp - React Native Mining Monitor

## Project Overview

A React Native/Expo mobile app for monitoring Bitcoin mining on Parasite Pool and managing local Bitaxe miners. Dark theme matching the Parasite Pool website aesthetic.

## Quick Reference

**Tech Stack:**
- React Native + Expo (TypeScript)
- Zustand (state management)
- React Navigation (bottom tabs)
- react-native-reanimated (animations)
- @wuba/react-native-echarts + @shopify/react-native-skia (charts)

**Key Directories:**
- `/src/screens/` - Screen components (Home, Pool, Miners, Settings)
- `/src/components/` - Reusable UI (Card, StatItem, SwipeToConfirm, etc.)
- `/src/store/` - Zustand stores (poolStore, userStore, minerStore, settingsStore)
- `/src/api/` - API clients (parasite.ts, bitaxe.ts, mempool.ts)
- `/src/types/` - TypeScript interfaces (from SPEC.md Data Models)
- `/src/hooks/` - Custom hooks (usePolling, useMinerDiscovery, etc.)
- `/src/utils/` - Utilities (formatting, validation, haptics)
- `/src/i18n/` - Internationalization (English, i18n structure for future)
- `/src/constants/` - Theme, colors, config values

**Key Files:**
- `SPEC.md` - Full product specification (source of truth)
- `IMPLEMENTATION.md` - Phased development guide with prompts

**Commands:**
```bash
pnpm start          # Start Expo dev server
pnpm test           # Run Jest tests
pnpm lint           # ESLint check
pnpm typecheck      # TypeScript check
```

## Current Phase

**Phase:** 0 - Complete
**Session:** Initial setup
**Status:** Ready for Phase 1

## Implementation Phases

1. **Phase 0:** Project setup, dependencies, folder structure
2. **Phase 1:** Navigation, base components, state foundation
3. **Phase 2:** Pool monitoring (API, charts, leaderboards, home)
4. **Phase 3:** Miner management (discovery, controls, settings)
5. **Phase 4:** Settings, persistence, onboarding
6. **Phase 5:** Polish, sharing, accessibility, testing

## Code Standards

### Components
- Functional components with TypeScript
- Props interfaces defined
- Memoization for expensive renders
- Cleanup in useEffect returns

### State Management
- Zustand for global state
- AsyncStorage for persistence
- Local useState for UI-only state
- Selectors for derived data

### API Integration
- 5 second timeout for miner requests
- Graceful retry for offline miners
- Cache responses with timestamps
- Stop polling when backgrounded

### Styling
- Dark theme only (v1)
- Match Parasite Pool website aesthetic
- Yellow (68°C) / Red (70°C+) for warnings
- Haptic feedback on key actions

### Numbers & Formatting
- Hashrate: 3 significant digits, auto-scale units
- Temperature: User preference (C/F)
- Numbers: Locale-based formatting
- Timestamps: Relative <24h, absolute after

## When Using Subagents

- **test-runner:** After implementing features, before commits
- **code-reviewer:** Before committing, after major changes
- **ui-reviewer:** After building new screens, for design consistency

## Implementation Notes

### Phase 0 (Complete)
- Expo SDK 54 with TypeScript template
- All dependencies installed via pnpm
- Folder structure created under /src
- TypeScript path aliases configured (@/*, @components/*, etc.)
- ESLint (flat config) + Prettier configured
- Theme constants extracted from parasite.space:
  - Background: #0a0a0a
  - Text: #ededed
  - Warning: #facc15 (68°C)
  - Danger: #ef4444 (70°C+)
- Babel configured with reanimated plugin and module-resolver
- Jest configured with jest-expo preset (v29)
- App runs successfully on iOS simulator

## Known Issues

- Package version warnings for Expo compatibility (non-blocking):
  - @shopify/react-native-skia, react-native-gesture-handler,
    react-native-reanimated, react-native-screens
  - Can be addressed later if issues arise

## Testing Notes

### Phase 0
- TypeScript: passes (`pnpm typecheck`)
- ESLint: passes (`pnpm lint`)
- Jest: 8 tests passing (`pnpm test`)
- iOS Simulator: App loads successfully with dark theme
