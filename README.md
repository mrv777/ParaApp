# ParaApp

A React Native/Expo mobile app for monitoring Bitcoin mining on Parasite Pool and managing local Bitaxe miners.

## Features

- **Mining Dashboard** - Real-time hashrate, workers, and pool leaderboard rankings with interactive charts (1h, 24h, 7d, 30d)
- **Local Miner Management** - Auto-discover Bitaxe miners on your network, monitor temps, adjust frequency/voltage/fan speed, restart remotely
- **Fleet Overview** - Aggregate stats across all connected miners with smart alerts for overheating and offline devices
- **Push Notifications** - Block found, worker status changes, and new difficulty records (Android)
- **Multi-language** - English, Spanish, French, German, and Portuguese

## Tech Stack

- React Native + Expo SDK 54 (TypeScript)
- NativeWind + Tailwind CSS v3 (styling)
- Zustand (state management)
- React Navigation v7 (bottom tabs + stacks)
- react-native-reanimated (animations)
- @wuba/react-native-echarts + @shopify/react-native-skia (charts)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- iOS Simulator (macOS) or Android Emulator

### Installation

```bash
# Install dependencies
pnpm install

# Start the Expo development server
pnpm start
```

## Development Commands

```bash
pnpm start              # Start Expo dev server
pnpm lint               # ESLint check
pnpm typecheck          # TypeScript check
pnpx expo-doctor        # Diagnose project issues (package versions, config, etc.)
pnpm expo install --fix # Fix package versions to match Expo SDK
```

## Building APK

Build a local Android APK for testing:

```bash
eas build --profile preview --platform android --local
```

Requirements:
- Android Studio with SDK installed
- `ANDROID_HOME` environment variable set
- EAS CLI (`pnpm add -g eas-cli`)

### Expo Doctor

Use `pnpx expo-doctor` to diagnose common project issues:

- Validates package versions match installed Expo SDK
- Checks for missing peer dependencies
- Validates app.json/app.config.js schema
- Detects incompatible native module versions
- Identifies common project setup issues

If issues are found, run `pnpm expo install --fix` to automatically update packages to compatible versions.

## Project Structure

```
src/
  screens/        # Screen components
    home/         # Home tab screens (HomeMainScreen, WorkersListScreen)
    miners/       # Miners tab screens (MinerDetailScreen, MinerSettingsScreen)
    settings/     # Settings tab screens (SettingsMainScreen, QRScannerScreen)
  components/     # Reusable UI components
    charts/       # Chart components (HashrateChart, etc.)
    home/         # Home screen components (UserStatsCard, WorkersPreviewCard, WorkerRow, LinkedMinersIndicator, LinkedMinersExpandedSection, PoolSummaryCard, AddAddressPrompt)
    miners/       # Miner management components (DiscoveryCard, MinerRow, MinerStatsSection, DeviceInfoSection, LinkedWorkerSection, MultiMinerSection, MinerControlsSection, AliasEditSheet, HeaderButtons, NetworkBanner, SortFilterModal)
    pool/         # Pool screen components
    navigation/   # Navigation components (TabBar)
  navigation/     # Stack navigators (HomeStack, MinersStack, SettingsStack)
  store/          # Zustand stores (pool, user, miner, settings)
  api/            # API clients (Parasite Pool, Bitaxe, Mempool)
  types/          # TypeScript interfaces
  hooks/          # Custom React hooks (polling, app state)
  utils/          # Utility functions (formatting, validation, discovery, minerAggregation)
  i18n/           # Internationalization
  constants/      # Theme, colors, config values
```

## Documentation

- [SPEC.md](./SPEC.md) - Full product specification
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - Phased development guide
