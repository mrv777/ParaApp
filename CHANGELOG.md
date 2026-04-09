# Changelog

All notable changes to ParaApp will be documented in this file.

## [0.2.9] - 2026-04-09

### Added
- **Hammer Miner Support** - Auto-detect and manage Hammer firmware miners (BC04) alongside AxeOS devices
- Hammer-specific stats: hardware errors, HW error rate, serial number, Wi-Fi signal strength
- Fallback stratum pool display with active/inactive badge on miner detail
- Fallback stratum configuration in miner settings (Hammer)
- Hammer performance presets (Normal/Overclock/Custom) for frequency and voltage
- Firmware type detection (AxeOS vs Hammer) based on API response shape

### Changed
- Settings screen prevents background polling from overwriting user-edited form values
- Version comparison handles Hammer date-suffixed versions (e.g., "2.0.0 20260309")
- Identify LED hidden for Hammer miners (unsupported by firmware)

### Fixed
- Content-Type header removed from PATCH requests to support Hammer firmware compatibility
- Miner settings now route through firmware-appropriate update path (partial PATCH for AxeOS, full-payload PATCH for Hammer)

## [0.2.8] - 2026-03-24

### Added
- **Round Leaderboards** - Toggle between "Since Last Block" and "All-Time" on leaderboards
- **Achievements Card** - Displays block-win badges on Home screen with links to mempool.space
- **User Round Stats** - New `/user/{address}/rounds` API integration for per-round rank data
- Claimed address checkmark indicators on leaderboard entries

### Changed
- Leaderboard limit increased from 100 to 420 entries
- Leaderboard rank column widened to support 3-digit ranks
- User ranks on Home screen now reflect the selected round mode
- Pull-to-refresh now fetches round leaderboards alongside all-time data
- Address changes clear stale user data before fetching fresh stats

### Fixed
- Stale data race condition when Bitcoin address changes mid-fetch

## [0.2.7] - 2026-03-03

### Changed
- Pool stats now shows last block height instead of timestamp
- Leaderboard gracefully handles private/hidden miners
- Account data handles nullable fields from updated API

### Removed
- Visibility toggle (privacy now managed via signed messages on website)
- Legacy leaderboard and user-diffs endpoints

## [0.2.5] - 2026-01-10

### Changed
- **Broader Device Support** - Renamed internal "Bitaxe" references to "AxeOS" to support all AxeOS-compatible miners (Bitaxe, NerdQAxe, etc.)
- Updated user-facing strings to use generic "miner" terminology

## [0.2.4] - 2026-01-10

### Added
- **Worker Notes** - Add custom labels to your workers (e.g., "Kitchen miner", "Garage Rig") for easy identification
- Bottom sheet editor for adding/editing worker notes
- Notes persist across app restarts

## [0.2.3] - 2026-01-10

### Fixed
- iOS full-screen chart modal display issues

### Changed
- Refactored shared chart modal logic for better maintainability

## [0.2.2] - 2026-01-09

### Changed
- Improved push notification security with token ownership verification
- Cross-device notification preference sync on registration
- Better camera permission screen UX

### Security
- Backend now verifies push token ownership before allowing preference updates
- Removed public preferences endpoint to protect user data

## [0.2.1] - 2026-01-06

### Fixed
- Misc bug fixes for API client and miner store
- Improved hashrate formatting edge cases

### Changed
- Server now validates Bitcoin address exists on Parasite Pool before registration
- Improved server error handling

## [0.2.0] - 2026-01-04

### Added
- **Push Notifications (Android)** - Get notified when:
  - Parasite Pool finds a block
  - Your workers go online/offline
  - You hit a new best difficulty record
- Notification preferences in Settings (toggle block/worker/difficulty alerts)
- In-app toast notifications for foreground alerts
- Backend notification service (Cloudflare Workers)

### Changed
- Updated app icons
