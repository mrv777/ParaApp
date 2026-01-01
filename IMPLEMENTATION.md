# ParaApp — Implementation Guide

A phased approach to building the ParaApp, designed for manageable context, easy debugging, and leveraging Claude Code capabilities.

---

## Table of Contents

1. [Project Setup](#phase-0-project-setup)
2. [Phase 1: Foundation & Navigation](#phase-1-foundation--navigation)
3. [Phase 2: Pool Monitoring](#phase-2-pool-monitoring)
4. [Phase 3: Local Miner Management](#phase-3-local-miner-management)
5. [Phase 4: Settings & Persistence](#phase-4-settings--persistence)
6. [Phase 5: Polish & Integration](#phase-5-polish--integration)
7. [Claude Code Setup](#claude-code-setup)
8. [Subagent Definitions](#subagent-definitions)

---

## Claude Code Setup

Before starting development, set up Claude Code for optimal workflow.

### 1. Initialize Project Memory

```bash
claude
/init
```

Then update `.claude/CLAUDE.md` with project context (template provided below).

### 2. Create Custom Subagents

Create these files in `.claude/agents/`:

- `test-runner.md` — Run tests and fix failures
- `code-reviewer.md` — Review code quality
- `ui-reviewer.md` — Check UI consistency with Parasite website

### 3. Configure Hooks

```bash
/hooks
```

Set up:
- **PostToolUse** (Edit|Write): Auto-format with prettier
- **PreToolUse** (Edit|Write): Block edits to `.env` files

### 4. Session Naming Convention

Name sessions by phase for easy resumption:
```
/rename phase-1-navigation
/rename phase-2-pool-api
```

---

## Phase 0: Project Setup

**Goal:** Initialize Expo project with all dependencies and configuration.

**Duration:** ~1 session

### Prompt to Start Phase 0

```
I'm starting Phase 0 of the ParaApp implementation. Please:

1. Initialize a new Expo project with TypeScript template
2. Install all dependencies from SPEC.md recommended packages:
   - Navigation: @react-navigation/native, @react-navigation/bottom-tabs
   - State: zustand
   - Storage: @react-native-async-storage/async-storage
   - Charts: @wuba/react-native-echarts, @shopify/react-native-skia, echarts
   - Animations: react-native-reanimated
   - Haptics: expo-haptics
   - Camera: expo-camera
   - Network: @react-native-community/netinfo
   - i18n: i18next, react-i18next
3. Set up the folder structure:
   - /src/screens
   - /src/components
   - /src/hooks
   - /src/store
   - /src/api
   - /src/utils
   - /src/constants
   - /src/types
   - /src/i18n
   - /src/assets
4. Configure TypeScript paths in tsconfig.json
5. Set up ESLint and Prettier configs
6. Create the base theme file matching Parasite website colors (dark theme)

Reference SPEC.md for all specifications.
```

### Deliverables
- [ ] Expo project initialized
- [ ] All dependencies installed
- [ ] Folder structure created
- [ ] TypeScript configured
- [ ] ESLint + Prettier configured
- [ ] Theme constants defined

### Testing Checklist
- [ ] `pnpm start` launches Expo dev server
- [ ] App runs on iOS simulator
- [ ] App runs on Android emulator
- [ ] TypeScript compiles without errors
- [ ] ESLint passes

### Git Checkpoint
```bash
git add .
git commit -m "Phase 0: Project setup with dependencies and structure"
git tag phase-0-complete
```

---

## Phase 1: Foundation & Navigation

**Goal:** Set up navigation structure, base components, and app shell.

**Duration:** ~2-3 sessions

### Session 1A: Navigation Structure

#### Prompt

```
I'm starting Phase 1A of ParaApp - Navigation Structure. Please:

1. Set up React Navigation with bottom tab navigator
2. Create the 4 main tabs: Home, Pool, Miners, Settings
3. Create placeholder screens for each tab
4. Implement custom tab bar with mining-themed icons
5. Set up navigation types for TypeScript
6. Add screen transition animations (match Parasite website feel)
7. Support portrait + landscape for charts (as specified in SPEC.md)

Follow the dark theme from our theme constants.
Reference SPEC.md Navigation section for exact structure.
```

#### Deliverables
- [ ] Bottom tab navigator configured
- [ ] 4 tab screens created (placeholder content)
- [ ] Custom tab bar component
- [ ] Navigation TypeScript types
- [ ] Screen transitions animated

### Session 1B: Base UI Components

#### Prompt

```
I'm continuing Phase 1B of ParaApp - Base UI Components. Please:

1. Create reusable component library matching Parasite website aesthetic:
   - Card component (for stats display)
   - StatItem component (icon + label + value)
   - Button component (with haptic feedback)
   - SwipeToConfirm component (for dangerous actions)
   - SkeletonLoader component (matching content shapes)
   - ErrorBanner component (inline error display)
   - Badge component (for warnings - yellow/red variants)
   - ConnectionStatus indicator (subtle, for header)
2. Create typography components (Text variants)
3. Set up haptic feedback utility using expo-haptics
4. Create animation utilities using react-native-reanimated

All components should follow SPEC.md Design System section.
```

#### Deliverables
- [ ] Card component
- [ ] StatItem component
- [ ] Button with haptics
- [ ] SwipeToConfirm component
- [ ] SkeletonLoader
- [ ] ErrorBanner
- [ ] Badge (caution/danger variants)
- [ ] Typography components
- [ ] Haptic utility
- [ ] Animation utilities

### Session 1C: State & Data Layer Foundation

#### Prompt

```
I'm continuing Phase 1C of ParaApp - State & Data Layer. Please:

1. Set up Zustand store structure:
   - poolStore (pool stats, blocks, leaderboards)
   - userStore (user address, workers, stats)
   - minerStore (local miners, discovery state)
   - settingsStore (preferences, cached timestamps)
2. Create TypeScript interfaces from SPEC.md Data Models:
   - PoolStats, PoolBlock
   - UserWorker
   - LocalMiner, MinerWarning
3. Set up AsyncStorage persistence for settings
4. Create API client base with:
   - Fetch wrapper with timeout (5s for miners)
   - Retry logic
   - Error handling
5. Set up i18n with English strings (minimal text as per spec)

Reference SPEC.md Data Models and Data & State Management sections.
```

#### Deliverables
- [ ] Zustand stores created
- [ ] TypeScript interfaces defined
- [ ] AsyncStorage integration
- [ ] API client utilities
- [ ] i18n initialized with English

### Testing Checklist (Phase 1 Complete)
- [ ] Navigation works between all tabs
- [ ] Tab bar renders with icons
- [ ] Screen transitions animate smoothly
- [ ] All base components render correctly
- [ ] Haptic feedback works on button press
- [ ] Zustand stores persist and restore state
- [ ] API client handles timeouts correctly

### Git Checkpoint
```bash
git add .
git commit -m "Phase 1: Navigation, base components, state foundation"
git tag phase-1-complete
```

---

## Phase 2: Pool Monitoring

**Goal:** Implement all pool-related features (API integration, stats display, charts, leaderboards).

**Duration:** ~3-4 sessions

### Session 2A: Parasite API Integration

#### Prompt

```
I'm starting Phase 2A of ParaApp - Parasite API Integration. Please:

1. Implement API functions for all Parasite endpoints:
   - GET /api/pool-stats
   - GET /api/pool-stats/historical
   - GET /api/user/{address}
   - GET /api/user/{address}/historical
   - PATCH /api/user/{address} (visibility toggle)
   - GET /api/highest-diff (leaderboards)
2. Add mempool.space API for Bitcoin price
3. Implement response caching with timestamps
4. Add polling mechanism (configurable interval: 5s, 10s, 20s, 30s)
5. Stop polling when app is backgrounded (AppState listener)
6. Handle errors gracefully - update store with error state

Reference SPEC.md Parasite API Reference section.
Test against live API: https://parasite.space
```

#### Deliverables
- [ ] All API functions implemented
- [ ] Response caching with timestamps
- [ ] Configurable polling
- [ ] Background state handling
- [ ] Error states in stores

### Session 2B: Pool Screen

#### Prompt

```
I'm continuing Phase 2B of ParaApp - Pool Screen. Please:

1. Build the Pool tab screen with:
   - Pool hashrate stat (auto-scaled, 3 sig digits)
   - Historical hashrate chart (line chart with touch)
   - Time preset buttons (1h, 24h, 7d, 30d)
   - Users/workers count
   - Blocks found list (height, time, truncated finder)
   - Last block time
   - Bitcoin price (USD)
   - Pool uptime
2. Implement pull-to-refresh (refreshes pool + related data)
3. Add skeleton loaders for loading states (>1hr stale = skeleton)
4. Show inline error banners on API failure
5. Support landscape mode for full-screen chart

Follow SPEC.md Pool screen details and caching strategy.
```

#### Deliverables
- [ ] Pool stats display
- [ ] Historical chart with presets
- [ ] Blocks list
- [ ] Pull-to-refresh
- [ ] Skeleton loaders
- [ ] Error banners
- [ ] Landscape chart support

### Session 2C: Leaderboards

#### Prompt

```
I'm continuing Phase 2C of ParaApp - Leaderboards. Please:

1. Create leaderboard components for Pool screen:
   - Top Difficulty leaderboard (scrollable)
   - Top Loyalty leaderboard (scrollable)
2. Implement user position pinning:
   - If user has address configured, highlight their row
   - Pin user's position if not in visible top entries
3. Format difficulty numbers appropriately
4. Add pull-to-refresh for leaderboard data
5. Handle empty states (no address configured)

Reference SPEC.md Leaderboards section.
```

#### Deliverables
- [ ] Top Difficulty leaderboard
- [ ] Top Loyalty leaderboard
- [ ] User position pinning/highlighting
- [ ] Empty states

### Session 2D: Home Screen (Pool Data)

#### Prompt

```
I'm continuing Phase 2D of ParaApp - Home Screen Pool Section. Please:

1. Build the Home tab with pool-related content:
   - Pool info summary (when no address configured)
   - Prompt to add Bitcoin address
   - Connection status indicator (subtle, in header area)
2. When address IS configured:
   - User hashrate (current, 1h, 24h)
   - Best difficulty achieved
   - Workers summary (top 3-5 with stats)
   - "View all workers" button → Workers List screen
3. Create Workers List screen:
   - Full worker list
   - Each row: name, hashrate, best diff, last submission
   - Tap to expand inline with more details
4. Format timestamps: relative up to 24h, then absolute

Reference SPEC.md Home and Workers List screen details.
```

#### Deliverables
- [ ] Home screen with/without address states
- [ ] User stats display
- [ ] Workers summary (top 3-5)
- [ ] Workers List screen
- [ ] Inline worker expansion
- [ ] Timestamp formatting

### Testing Checklist (Phase 2 Complete)
- [ ] Pool stats load from live API
- [ ] Historical charts render with all presets
- [ ] Chart touch interaction shows tooltips
- [ ] Leaderboards scroll and highlight user
- [ ] Home shows pool data without address
- [ ] Home shows user stats with address
- [ ] Workers list expands inline
- [ ] Pull-to-refresh works on all screens
- [ ] Skeleton loaders appear for stale data
- [ ] Error banners show on API failure
- [ ] Polling stops when backgrounded

### Git Checkpoint
```bash
git add .
git commit -m "Phase 2: Pool monitoring with charts, leaderboards, user stats"
git tag phase-2-complete
```

---

## Phase 3: Local Miner Management

**Goal:** Implement Bitaxe miner discovery, display, and controls.

**Duration:** ~4-5 sessions

### Session 3A: Miner Discovery ✅ COMPLETE

#### Prompt

```
I'm starting Phase 3A of ParaApp - Miner Discovery. Please:

1. Implement miner auto-discovery:
   - Detect device's current IP subnet
   - Scan /24 range for Bitaxe devices (GET /api/system/info)
   - Background scan with progress indicator
   - Show miners as they're found in real-time
   - 5 second timeout per IP
2. Add manual IP entry option
3. Store discovered miners in Zustand + AsyncStorage
4. Implement "Remove miner" functionality
5. Add option to manually specify IP range

Use @react-native-community/netinfo for network detection.
Reference SPEC.md Discovery & Setup section.
```

#### Deliverables
- [x] Subnet detection
- [x] Background network scan with progress
- [x] Real-time miner discovery display
- [x] Manual IP entry
- [x] Miner persistence
- [x] Remove miner function

#### Implementation Notes
- Created `/src/utils/discovery.ts` with worker pool pattern (50 concurrent connections)
- Created `/src/components/miners/` with DiscoveryCard, MinerRow, EmptyMinersState
- Updated `/src/store/minerStore.ts` with full discovery implementation
- Implemented `/src/screens/MinersScreen.tsx` with inline discovery UI
- Added swipe-to-delete via react-native-gesture-handler
- Custom IP range parsing in `/src/utils/validation.ts`

### Session 3B: Miners List Screen

#### Prompt

```
I'm continuing Phase 3B of ParaApp - Miners List Screen. Please:

1. Build the Miners tab screen:
   - List of saved Bitaxe devices
   - Each item: hostname/alias, hashrate, temp, status indicator
   - Sort options: hashrate, temp, status, name
   - Filter: online/offline/warning
   - Ordering: most recently accessed first
2. Implement warning system:
   - Push problem miners to top
   - Badge display (yellow 68°C, red 70°C+)
   - Comprehensive warnings: temp, overheat_mode, power_fault, low hashrate
3. Add network availability banner when miners unreachable
4. Add/Scan FAB buttons
5. Graceful retry for offline miners (show "connecting..." state)

Reference SPEC.md Miners screen and Warning conditions.
```

#### Deliverables
- [ ] Miners list with sort/filter
- [ ] Warning badges (two-tier)
- [ ] Problem miners pushed to top
- [ ] Network availability banner
- [ ] Add/Scan buttons
- [ ] Graceful offline handling

### Session 3C: Miner Detail Screen

#### Prompt

```
I'm continuing Phase 3C of ParaApp - Miner Detail Screen. Please:

1. Build Miner Detail screen (continuous scroll layout):
   - Stats: hashrate, power, temp, voltage, shares, uptime, best diff
   - Device info: model, ASIC, firmware, IP, hostname
   - Alias editing (tap to edit, save)
2. Format values properly:
   - Hashrate: auto-scale, 3 sig digits
   - Temp: user preference (C/F)
   - Uptime: compact format ("3d 4h 12m")
   - Numbers: locale-based formatting
3. Show linked worker stats if stratumUser matches
4. Offline state: minimal info + last best diff
5. Implement polling for live updates (uses settings interval)

Reference SPEC.md Miner Detail and Typography sections.
```

#### Deliverables
- [ ] Miner detail continuous scroll
- [ ] All stats displayed
- [ ] Alias editing
- [ ] Proper number formatting
- [ ] Linked worker display
- [ ] Offline state handling
- [ ] Live polling

### Session 3D: Miner Controls

#### Prompt

```
I'm continuing Phase 3D of ParaApp - Miner Controls. Please:

1. Implement miner control actions:
   - Restart (POST /api/system/restart) - swipe-to-confirm
   - Identify LED (POST /api/system/identify) - ~10-15 sec flash
2. Add controls section to Miner Detail screen
3. Implement SwipeToConfirm for dangerous actions
4. Add success/error haptic feedback
5. Show loading states during API calls
6. Handle errors with inline banners

Reference SPEC.md Miner Controls section.
```

#### Deliverables
- [ ] Restart with swipe-to-confirm
- [ ] Identify LED control
- [ ] Haptic feedback
- [ ] Loading states
- [ ] Error handling

### Session 3E: Miner Settings

#### Prompt

```
I'm continuing Phase 3E of ParaApp - Miner Settings. Please:

1. Create Miner Settings screen/modal:
   - Frequency slider (stepped increments)
   - Voltage slider (stepped increments)
   - Fan speed slider (stepped increments)
   - Pool config fields (URL, port, user, password)
   - "Set to Parasite" preset button
2. Implement preview + apply pattern:
   - Show pending changes summary
   - Apply button sends PATCH /api/system
   - Swipe-to-confirm for apply
3. Add warnings for extreme values (but allow user to proceed)
4. Fetch current values from /api/system/asic for limits

Reference SPEC.md Miner Settings section.
```

#### Deliverables
- [ ] Settings screen with sliders
- [ ] Pool config fields
- [ ] Parasite preset button
- [ ] Preview + apply flow
- [ ] Extreme value warnings

### Session 3F: Worker Linking

#### Prompt

```
I'm continuing Phase 3F of ParaApp - Worker Linking. Please:

1. Implement worker-miner linking via stratumUser:
   - Match miner's stratumUser to pool workers
   - Display linked pool stats on miner detail
2. Handle multiple miners with same stratumUser:
   - Show aggregated stats
   - Expandable list of individual miners
3. Show "Not linked" state if no match found
4. Auto-update links when address or miners change

Reference SPEC.md Worker Linking section.
```

#### Deliverables
- [ ] Worker linking by stratumUser
- [ ] Linked stats display
- [ ] Aggregated view for shared workers
- [ ] Auto-update on changes

### Testing Checklist (Phase 3 Complete)
- [ ] Auto-discovery finds miners on local network
- [ ] Manual IP entry works
- [ ] Miners persist across app restart
- [ ] Sort and filter work correctly
- [ ] Warning badges appear at correct thresholds
- [ ] Miner detail shows all stats
- [ ] Restart control works with confirmation
- [ ] Identify flashes LED
- [ ] Settings changes apply correctly
- [ ] Pool config can be changed
- [ ] Parasite preset fills correct values
- [ ] Worker linking matches correctly

### Git Checkpoint
```bash
git add .
git commit -m "Phase 3: Local miner management with discovery and controls"
git tag phase-3-complete
```

---

## Phase 4: Settings & Persistence

**Goal:** Implement settings screen, preferences, and all persistence features.

**Duration:** ~2 sessions

### Session 4A: Settings Screen

#### Prompt

```
I'm starting Phase 4A of ParaApp - Settings Screen. Please:

1. Build Settings tab screen:
   - Bitcoin address input with QR scan button
   - Address validation (full checksum with bitcoinjs-lib, or regex fallback)
   - Visibility toggle (public/private) - subtle placement
   - Temperature unit toggle (C/F)
   - Polling interval selector (5s, 10s, 20s, 30s)
2. Implement QR code scanning for address entry (expo-camera)
3. Save all preferences to AsyncStorage via Zustand persist
4. About section: app version, Parasite link, GitHub link

Reference SPEC.md Settings screen section.
```

#### Deliverables
- [ ] Settings screen layout
- [ ] Bitcoin address input + validation
- [ ] QR code scanning
- [ ] Visibility toggle (PATCH API)
- [ ] Temperature unit preference
- [ ] Polling interval selector
- [ ] About section

### Session 4B: Onboarding & Empty States

#### Prompt

```
I'm continuing Phase 4B of ParaApp - Onboarding & Empty States. Please:

1. Implement first-time user experience:
   - Tooltip hints pointing to key features
   - No blocking wizard - app usable immediately
2. Create empty state components for:
   - No address configured (on Home)
   - No miners found (on Miners tab)
   - No workers (when address has no activity)
3. Empty states should include:
   - Helpful message
   - Action button where appropriate

Reference SPEC.md Onboarding section.
```

#### Deliverables
- [ ] First-run tooltip hints
- [ ] Empty state components
- [ ] Helpful prompts

### Testing Checklist (Phase 4 Complete)
- [ ] Settings persist across app restart
- [ ] QR scanner opens and reads addresses
- [ ] Address validation catches invalid inputs
- [ ] Temperature displays in selected unit
- [ ] Polling interval affects refresh rate
- [ ] Visibility toggle updates API
- [ ] Tooltips appear on first launch
- [ ] Empty states are helpful and actionable

### Git Checkpoint
```bash
git add .
git commit -m "Phase 4: Settings, persistence, onboarding"
git tag phase-4-complete
```

---

## Phase 5: Polish & Integration

**Goal:** Final polish, sharing features, accessibility, and integration testing.

**Duration:** ~2-3 sessions

### Session 5A: Sharing Feature

#### Prompt

```
I'm starting Phase 5A of ParaApp - Sharing Feature. Please:

1. Implement shareable stats image:
   - Generate branded card with key stats (hashrate, workers, best diff)
   - Use react-native-view-shot or similar
   - Apply Parasite branding/colors
2. Add share button to Home screen
3. Use native share sheet for image sharing

Reference SPEC.md Sharing section.
```

#### Deliverables
- [ ] Stats image generation
- [ ] Branded card design
- [ ] Share button and native sheet

### Session 5B: Fleet Overview

#### Prompt

```
I'm continuing Phase 5B of ParaApp - Fleet Overview on Home. Please:

1. Add miner fleet summary to Home screen:
   - Total aggregate hashrate
   - Highest difficulty across fleet
   - Warning count with indicator
2. Make it tappable to navigate to Miners tab
3. Only show if miners are saved

Reference SPEC.md Home screen fleet overview.
```

#### Deliverables
- [ ] Fleet summary component
- [ ] Aggregate stats calculation
- [ ] Warning count display
- [ ] Navigation to Miners tab

### Session 5C: Accessibility & Final Polish

#### Prompt

```
I'm continuing Phase 5C of ParaApp - Accessibility & Polish. Please:

1. Add basic accessibility support:
   - VoiceOver/TalkBack labels for main actions
   - Logical navigation order
   - Accessible button hints
2. Final UI polish:
   - Ensure all animations are smooth
   - Check all haptic feedback points
   - Verify skeleton loaders match content shapes
3. Review and fix any styling inconsistencies
4. Test dark theme throughout

Reference SPEC.md Accessibility section.
```

#### Deliverables
- [ ] Accessibility labels added
- [ ] Navigation order logical
- [ ] Animations polished
- [ ] Haptics verified
- [ ] Theme consistent

### Session 5D: Integration Testing

#### Prompt

```
I'm finishing Phase 5D of ParaApp - Integration Testing. Please:

1. Create a testing checklist covering:
   - All API integrations (Parasite, Bitaxe, mempool)
   - All user flows (address entry, miner discovery, settings)
   - Error scenarios (network failure, API errors, timeouts)
   - Edge cases (no data, expired cache, concurrent requests)
2. Document any known issues
3. Verify all SPEC.md requirements are implemented
4. Create a final review comparing implementation to SPEC.md

Run through critical user flows and fix any issues found.
```

#### Deliverables
- [ ] Integration test checklist created
- [ ] All critical flows tested
- [ ] Known issues documented
- [ ] SPEC.md compliance verified

### Testing Checklist (Phase 5 Complete)
- [ ] Share image generates correctly
- [ ] Share sheet opens with image
- [ ] Fleet overview shows correct aggregates
- [ ] Accessibility labels work with screen reader
- [ ] All animations are 60fps
- [ ] No styling inconsistencies
- [ ] Full user flow works end-to-end

### Git Checkpoint
```bash
git add .
git commit -m "Phase 5: Polish, sharing, accessibility, integration"
git tag phase-5-complete
```

---

## Subagent Definitions

Create these files in `.claude/agents/` for specialized task handling.

### `.claude/agents/test-runner.md`

```markdown
---
name: test-runner
description: Run tests and fix failures. Use after implementing new features or when tests are failing.
tools: Read, Edit, Bash, Glob, Grep
---

You are a test automation expert for React Native/Expo applications.

When invoked:
1. Run the appropriate test command (pnpm test, pnpm test:e2e)
2. Analyze any test failures with full stack traces
3. Fix bugs while preserving test intent
4. Re-run affected tests to verify fixes
5. Report final test status

Focus on:
- Jest for unit tests
- React Native Testing Library for component tests
- Ensure new features have test coverage
```

### `.claude/agents/code-reviewer.md`

```markdown
---
name: code-reviewer
description: Review code quality and best practices. Use before committing changes.
tools: Read, Grep, Glob
---

You are a senior code reviewer for React Native applications.

Review checklist:
- TypeScript types are complete and accurate
- Error handling is comprehensive
- Performance implications considered
- Memory leaks prevented (cleanup in useEffect)
- State management patterns consistent
- Components are properly memoized where needed
- Accessibility labels present on interactive elements
- Console.logs and debug code removed

Provide feedback by priority:
- Critical (must fix)
- Warnings (should fix)
- Suggestions (consider)
```

### `.claude/agents/ui-reviewer.md`

```markdown
---
name: ui-reviewer
description: Review UI consistency with Parasite website design. Use when building new screens.
tools: Read, Glob, WebFetch
---

You are a UI/UX specialist ensuring ParaApp matches the Parasite Pool website aesthetic.

Review checklist:
- Dark theme colors match website
- Typography styles consistent
- Card/component styles match
- Animation feel matches website
- Spacing and layout proportions correct
- Icons are mining-themed
- Warning colors correct (yellow/red)

Compare implementation against https://parasite.space/ design patterns.
```

---

## Project Memory Template

Create/update `.claude/CLAUDE.md` with:

```markdown
# ParaApp - React Native Mining Monitor

## Quick Reference

**Tech Stack:** React Native + Expo, TypeScript, Zustand, React Navigation

**Key Files:**
- `/src/store/` - Zustand stores (pool, user, miner, settings)
- `/src/api/` - API clients (parasite.ts, bitaxe.ts, mempool.ts)
- `/src/screens/` - Screen components
- `/src/components/` - Reusable UI components
- `/src/types/` - TypeScript interfaces

**Commands:**
- `pnpm start` - Start Expo dev server
- `pnpm test` - Run Jest tests
- `pnpm lint` - ESLint check

## Current Phase

Phase: [UPDATE THIS]
Session: [UPDATE THIS]
Status: [In Progress / Complete]

## Implementation Notes

[Add notes as you work through phases]

## Known Issues

[Track issues discovered during development]

## Testing Notes

[Document test results after each phase]
```

---

## Phase Completion Workflow

After completing each phase:

1. **Run Tests**
   ```
   Use the test-runner subagent to run all tests and fix any failures.
   ```

2. **Code Review**
   ```
   Use the code-reviewer subagent to review all changes in this phase.
   ```

3. **UI Review** (for UI-heavy phases)
   ```
   Use the ui-reviewer subagent to check visual consistency with Parasite website.
   ```

4. **Update Memory**
   ```
   /memory
   # Update current phase status
   # Add implementation notes
   # Document any issues found
   ```

5. **Git Checkpoint**
   ```bash
   git add .
   git commit -m "Phase X: [description]"
   git tag phase-X-complete
   ```

6. **Start New Session**
   ```
   /rename phase-[N+1]-[description]
   ```

---

## Resuming Development

To resume work on a specific phase:

```bash
claude --resume phase-2-pool-api
```

Or use the session picker:
```
/resume
```

---

## Parallel Development Tips

For faster development, you can work on independent phases in parallel using git worktrees:

```bash
# Create worktree for Phase 3 while working on Phase 2
git worktree add ../parasite-app-phase3 -b feature/phase-3-miners

# Terminal 1: Phase 2
cd ~/parasite-app
claude --resume phase-2-pool-api

# Terminal 2: Phase 3
cd ~/parasite-app-phase3
claude --resume phase-3-miners
```

Phases 2 and 3 are largely independent and can be developed in parallel.

---

## Reference

- [SPEC.md](./SPEC.md) - Full product specification
- [Parasite Pool](https://parasite.space/) - Design reference
- [ESP-Miner API](https://github.com/bitaxeorg/ESP-Miner) - Bitaxe API reference
