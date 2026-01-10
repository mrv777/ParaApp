# Changelog

All notable changes to ParaApp will be documented in this file.

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
