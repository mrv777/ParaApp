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
npm start          # Start Expo dev server
npm test           # Run Jest tests
npm run lint       # ESLint check
npm run typecheck  # TypeScript check
```

## Current Phase

**Phase:** 0 - Not Started
**Session:** Initial setup
**Status:** Ready to begin

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

[Add notes as you work through phases]

## Known Issues

[Track issues discovered during development]

## Testing Notes

[Document test results after each phase]
