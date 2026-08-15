# Changelog

All notable changes to ParaApp will be documented in this file.

## [0.6.5] - 2026-08-14

### Fixed
- Restored the 30-day hashrate charts, which broke when the pool website tightened its historical API to a fixed set of intervals; the 30d view now requests hourly data points
- Badge refreshes no longer retry against the pool's new rate limit; if a refresh is rate-limited, the app quietly keeps showing your last known badges

## [0.6.4] - 2026-08-06

### Added
- All-new achievement badges matching parasite.space: badges are now served by the pool's canonical badges endpoint and cover all eight kinds — gold trophy medals for blocks you've won, individual block medals, a stacked medal for blocks beyond those, plus Loyalty, Auction Winner, Bravocado, Miner, and Dispenser Collector badges, each with its own detail sheet
- Mining rewards currently up for auction show an "At auction" chip with live bid info (current high bid, or the minimum next bid when there are none) and link straight to the Parabid auction house

### Fixed
- Restored the Refinery Operator badge, which disappeared when the pool website's Badge Reform removed the endpoint the app relied on

## [0.6.3] - 2026-07-27

### Added
- Block achievement badges now show your share of that block's total pool work, alongside the work total you already contributed; precision scales with the size of the share, so contributions well under one percent stay readable instead of rounding away to zero
- The rewards catalog now shows how many units of each reward are still available out of the total minted, matching the pool website

## [0.6.2] - 2026-07-24

### Added
- Hammer v3 miner support, including the per-chip ASIC heatmap and one-tap autotune that tunes frequency and voltage on the device

### Fixed
- Stopped the chat profanity filter rejecting ordinary mining talk that contains numbers; digits were being folded into letters before matching (so "455" read as profanity) and bare numerals could be flagged outright. Symbol-based leetspeak and spaced-out profanity are still caught

## [0.6.1] - 2026-07-21

### Added
- Best Diff markers on the Home hashrate chart — a timeline of your difficulty hits in the 1h and 24h views, tappable to inspect the difficulty, block, and time of each hit
- Pool Work, Avg to Find Block, and Min Diff Needed tiles on the pool stats grid, with network difficulty sourced from mempool.space

### Changed
- Renamed the "Last Block" tile to "Last Block Found" and made it open the block on parasite.space; the Users and Workers tiles were replaced by the new stats above

## [0.6.0] - 2026-07-18

### Added
- Rewards catalog sheet listing every dispenser tier and asset with your progress toward the next target; the Mining Reward card is now always the entry point to it
- Push notification when you earn a dispenser reward, with a new toggle (on by default) in all five languages
- Read-only Refinery order card and order detail sheet, shown only when your address has orders
- "Work" sort option on the round leaderboard

### Fixed
- Stopped admin-granted dispenser rewards being counted twice, which could fire a reward notification when nothing was actually claimable yet
- Cleared the selected Refinery order when the address changes, so the detail sheet can no longer reopen showing the previous address's order
- Stopped a Refinery router outage from stalling core user-stats polling

## [0.5.9] - 2026-07-17

### Added
- LuxOS (Luxor firmware) Antminer support: monitoring, restart, LED locate, power-profile switching, and pool configuration, localized in all five languages

## [0.5.6] - 2026-07-16

### Added
- GekkoScience KBox support: monitoring, restart, fan and power modes (including custom frequency and core voltage), and ambient LED control. Devices are unlocked with an API key held in secure storage per device, and a reachable but locked KBox shows as online with a lock badge instead of appearing offline
- Admin-assigned chat badges displayed next to a name or address; tap a badge to see what it means
- Block achievement badges now show the winning share difficulty for that block, and the shareable badge image is square

## [0.5.5] - 2026-07-12

### Fixed
- Stopped returning devices from repeatedly registering for push notifications, preserved notification toggles changed during registration, restored unchanged Expo tokens after failed registration, and serialized address-switch registration
- Canonicalized uppercase Bech32 and Bech32m addresses, including addresses already saved by previous versions, so pool, chat, widget, and notification identity lookups use the same lowercase key
- Kept unblurred custom miner frequency and voltage values consistent between the pending-changes confirmation and the settings sent to the device
- Rejected empty required Avalon responses and guaranteed miner refresh loading state is cleared after malformed firmware data or unexpected errors
- Refreshed the Home user-hashrate chart from polling data and refreshed non-24-hour chart periods on pull-to-refresh

### Performance
- Parallelized notification-cron user checks within Cloudflare's connection limit, added fair rotating coverage and a bounded processing window, and reduced D1 round trips for block preferences and widget push timestamps
- Made notification-preference updates a single atomic upsert and added structured cron capacity summaries with actionable warning thresholds

## [0.5.4] - 2026-07-10

### Fixed
- Stopped the app crashing when an Android home-screen widget is removed; the widget-image cleanup no longer throws when its cache folder is missing, so the widget-deleted handler now runs (patches `react-native-android-widget`, upstream sAleksovski/react-native-android-widget#143)

### Changed
- Updated `expo-widgets` to 56.0.22 and `@expo/ui` to 56.0.21; iOS widget rendering and refresh behavior are unchanged

## [0.5.3] - 2026-07-10

### Fixed
- Prevented repeated Android background wakeups by removing the redundant Expo widget workers; placed Android widgets continue to refresh through their native 30-minute update handler
- Restricted the background notification task to silent `widget_refresh` payloads so visible block, worker, and best-difficulty notifications never start widget network work
- Bounded, parallelized, deduplicated, and made widget refresh requests cancellable so headless tasks finish inside Android and iOS execution windows
- Treated successful background checks with no changed data as successful scheduler runs instead of failures

### Changed
- Reduced event-driven silent widget pushes to at most two per hour, matching Apple's recommended background-notification budget; visible notification delivery is unchanged

## [0.5.0] - 2026-07-02

### Added
- **Community Chat** - New Chat tab for real-time conversation across the pool, backed by a Durable Object chat room over native WebSockets with D1-persisted history and scroll-back pagination
  - Moderated nicknames with unique handles and a truncated-address fallback; admin-assigned official handles
  - Fixed-set emoji reactions with server-side aggregation and quick-react UI
  - Reply to messages: swipe or long-press to quote a message, tap a quote to jump to the original
  - Admin announcement banner as the official channel, with a reserved-nickname blacklist
  - Inline moderation: server-enforced report and block, EULA gate, and a Blocked Users screen in Settings with unblock
  - Admin login gating with a delete-any-message browser and live delete broadcast
  - 30-day message retention prune in cron (cascading to reactions)
- **Cold-start skeletons** - Loading skeletons on Home, Pool, and Chat for a smoother startup

### Changed
- Chat feed rebuilt on LegendList with day dividers and scroll-back pagination; hi-fi design pass on the Chat screen
- Send icon swapped to a mono ↵ glyph; toast themed to the terminal aesthetic
- Legal links point at the mrv777.com/paraapp/ subdirectory

### Fixed
- Avalon miners in standby/idle mode now handled correctly
- Notification preference sync no longer overwrites account-wide prefs on device register
- Reactions and reports guarded to real messages; feed resets cleanly on identity switch
- Expired token refreshed on nickname save; reaction echo to sibling sockets on the same address
- Hardened WebSocket / Durable Object edge cases and device-layer miner writes

### Performance
- Cached chat identity, debounced presence, and coalesced reactions to cut chatter

### Security
- Sender keys truncated on the wire; block, report, and history paths hardened

## [0.4.0] - 2026-07-01

### Added
- **Terminal/Brutalist Redesign** - App-wide restyle to a monochrome, square-cornered "terminal" aesthetic matching parasite.space (pure-black canvas, hairline borders, mono data labels)
- Space Grotesk (titles) + JetBrains Mono (data/numbers) typography throughout
- **2-Column Miner Card Grid** - New card view for the Miners tab: hashrate hero with 2×2 vitals (temp/power/best diff/fan), per-type thermal color ramp, swipe-to-remove and tap-to-detail
- Shared UI primitives: square stat cells, animated toggles, framed settings cards, segmented controls

### Changed
- Full Settings screen rebuild with framed cards, address VALID chip, and larger title
- Home, Pool, and Miners screens restyled to the new design system (hashrate heroes, stat grids, leaderboards, blocks)
- Charts, tab bar, skeletons, and banners updated to match

### Fixed
- Push notifications now gated on the master notification toggle
- Android widget update control refinements
- Various review findings across miners, charts, and server
- Avalon miner discovery save path

### Security
- Updated dependencies and cleared outstanding security advisories

## [0.3.5] - 2026-06-22

### Added
- **Android Home-Screen Widgets** - Personal Mining and Pool Overview widgets for Android (mirrors the iOS widget pipeline), with best-effort self-refresh on a ~30-minute tick even when the app is never opened
- **Work Rank & Rounds** - New Work Rank stat on Home plus a phone-friendly per-round table (diff/work/blocks rank, participant totals, tap-through to parasite.space)
- **Best Shares Feed** - Pool tab now lists the highest-difficulty share submitted per block, linking to parasite.space
- Reusable info sheets with contextual help icons

### Fixed
- Push notification deduplication via atomic block claim and single-flight cron (no more duplicate block alerts)
- Monotonic block detection to prevent out-of-order notifications
- Eliminated D1 read amplification in the notification cron
- Android widgets honor the Widget Updates opt-out setting

## [0.3.4] - 2026-06-19

### Added
- **Refinery Operator Badge** - New achievement badge with a unified badge detail sheet (round stats, mempool link, share)

### Changed
- Replaced `@gorhom/bottom-sheet` with a custom RN Modal + Reanimated sheet that renders correctly on the RN 0.85 / New Architecture stack; migrated all sheets (badge, language, worker note, sort/filter, alias, Avalon auth) with drag-to-dismiss and keyboard avoidance

## [0.3.0] - 2026-06-15

### Added
- **iOS Home-Screen Widgets** - At-a-glance widgets for your mining stats, refreshed event-driven via silent push within APNs budget

### Fixed
- Guarded a native iOS crash (`SIGABRT` on nil host) when Avalon TCP connections were in flight during background→foreground transitions
- Hardened widget refresh against unhydrated settings and stale stats
- Fixed widget text truncation and staleness thresholds (aligned to refresh cadence)

## [0.2.12] - 2026-05-14

### Added
- **Dispenser / Rewards Card** - New Home screen card showing mining rewards

### Fixed
- Hardened the rewards card against stale data and text overflow
- Avalon chip voltage parsing (ATA1) and Nano 3S power fallback

## [0.2.11] - 2026-05-07

### Added
- Tappable miner IP address row to open the device's web UI in a browser

### Fixed
- Corrected Avalon stats parsing and added Avalon-aware temperature thresholds
- Live power now read from `PS[6]` instead of the MPO setting
- Avalon no longer auto-reboots after a work-mode change
- Fixed intermittent blank tab screens
- Clarified Avalon air-temperature wording

## [0.2.10] - 2026-05-02

### Added
- **Canaan Avalon Miner Support** - Monitor and manage Avalon miners (Q, Nano, Mini) alongside AxeOS and Hammer devices
- CGMiner JSON-RPC client over TCP with a web CGI fallback for pool config
- Dual-port network discovery (probes AxeOS/Hammer on port 80 and Avalon on port 4028)
- Avalon detail UI: work-mode picker, hashboard temps, per-fan RPMs, and a collapsible ASIC PVT heatmap
- Dedicated Avalon settings screen with 3 pool slots and admin-password auth (stored in secure storage)
- Auto-fan target temperature option in miner settings

### Fixed
- Taproot (`bc1p...`) addresses now validate correctly; added a non-blocking warning when a taproot address may be an Ordinals (Xverse) address unsuitable for payouts
- Tightened miner settings validation

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
