# ParaApp - React Native Mining Monitor

## Project Overview

A React Native/Expo mobile app for monitoring Bitcoin mining on Parasite Pool and managing local Bitaxe miners. Dark theme matching the Parasite Pool website aesthetic.

## Quick Reference

**Tech Stack:**
- React Native + Expo (TypeScript)
- NativeWind + Tailwind CSS v3 (styling)
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
pnpm lint           # ESLint check
pnpm typecheck      # TypeScript check
pnpx expo-doctor    # Diagnose project issues (package versions, config, etc.)
pnpm expo install --fix  # Fix package versions to match Expo SDK
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

### Styling (NativeWind)
- Use Tailwind utility classes with `className` prop
- Colors match Parasite Pool website (from [parastats repo](https://github.com/parasitepool/parastats))
- Dark theme only (v1)
- Key classes:
  - Background: `bg-background` (#0a0a0a)
  - Text: `text-foreground` (#ededed)
  - Cards/surfaces: `bg-secondary` (#222222)
  - Borders: `border-border` (#444444)
  - Muted text: `text-muted` (#666666)
  - Temp warnings: `text-warning` (68°C), `text-danger` (70°C+)
- For complex/dynamic styles, use `clsx` or `tailwind-merge`
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
- NativeWind + Tailwind CSS v3 configured:
  - Colors extracted from [parasitepool/parastats](https://github.com/parasitepool/parastats)
  - `tailwind.config.js` with Parasite Pool color palette
  - `global.css`, `metro.config.js`, `nativewind-env.d.ts` created
  - Babel preset updated for NativeWind
- Babel configured with reanimated plugin and module-resolver
- App runs successfully on iOS simulator

## Verification Notes

### Phase 0
- TypeScript: passes (`pnpm typecheck`)
- ESLint: passes (`pnpm lint`)
- Expo Doctor: 17/17 checks pass (`pnpx expo-doctor`)
- iOS Simulator: App loads successfully with dark theme
