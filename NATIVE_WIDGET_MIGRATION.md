# Native Widget Migration

Status: **DEFERRED 2026-07-10 — not approved for implementation**  
Created: 2026-07-10  
Current app version at time of writing: 0.5.3  

> ## ⚠️ Read this before acting on anything below
>
> This document was reviewed on 2026-07-10. Its factual claims were checked against the
> vendored package sources and upstream docs and **all of them hold**. The migration was
> nonetheless **deferred**, and several gaps in the plan need resolving first. Do not
> execute the "Recommended next-session starting procedure" or its suggested prompt as
> written.
>
> **Why deferred.** The only problem that genuinely requires a native rewrite is iOS
> staleness, and no user reports of stale widgets have surfaced to justify the cost. The
> standing revisit trigger is *user-reported* staleness, not architectural
> dissatisfaction. Android's headline defect turned out to be a five-line patch
> (now applied: `patches/react-native-android-widget.patch`).
>
> **What was done instead (0.5.4):**
> - Patched the Android widget-deletion NPE (upstream #143).
> - Bumped `expo-widgets` 56.0.18 → 56.0.22, and `@expo/ui` 56.0.17 → 56.0.21 to keep a
>   single resolved copy (verified: timeline still `.atEnd`, still no `URLSession`).
>
> ### Gaps to resolve before implementing
>
> 1. **The target architecture bakes in a user-visible regression.**
>    `server/src/widget-snapshots.ts` hardcodes `hashrate1h` and `hashrate24h` to
>    `'-- H/s'`. Both widgets render those fields (`widgets.tsx`,
>    `PersonalMiningAndroidWidget.tsx`); they are populated *only* by the app-pushed path
>    in `src/widgets/snapshots.ts`. The moment a native widget self-fetches
>    `/widget/user/:address`, those two rows go permanently to `--`. Fixing the server
>    (and possibly the upstream Parasite API) is a **hard prerequisite** for iOS native.
>    The plan says "consume the existing server snapshot JSON" and "DTOs must include all
>    fields currently declared in `src/widgets/types.ts`" without noticing the server does
>    not populate two of them.
>
> 2. **Sequencing is inverted.** The plan does Android first "because it has the strongest
>    crash report." That crash was a five-line null guard. iOS is the platform whose
>    limitation is architectural and unfixable within `expo-widgets`. **iOS first, if ever.
>    Android Glance is not justified by current evidence** — its 30-minute WorkManager
>    fetch works today.
>
> 3. **Phase 4's feature-flagged rollout is impossible on iOS.** Placed widgets bind to
>    extension bundle id + `kind` string, which this document correctly requires
>    preserving so widgets survive upgrade. Therefore the old and new extensions cannot
>    coexist and cannot be runtime-switched. Rollback is an App Store update. "Compare
>    widget freshness and background crash rates with the baseline" contradicts the
>    identity-preservation constraint.
>
> 4. **Phase 0's observability prerequisite is unbuildable as implied.** The repo has no
>    crash reporting, so acceptance criterion #8 has no baseline. But adding a crash SDK
>    would *not* fix that: an iOS WidgetKit extension is a separate process, and a stock
>    `@sentry/react-native` install instruments the app process only (sentry-cocoa#1656,
>    #3695). Crashlytics has the same blind spot. **Use App Store Connect → Crashes /
>    Xcode Organizer (captures widget-extension crashes, free, no SDK) and Play Console →
>    Android vitals.** Open decision #11 is miscast.
>
> 5. **"iOS runs native, Android runs JS" is not accurate.** The `expo-widgets` iOS
>    extension already ships a Hermes bundle to render the widget-marked JSX
>    (expo/expo#43646) — inside a 30 MB-hard-limited extension. This *strengthens* the
>    eventual iOS-native case, but the framing below is wrong.
>
> 6. **Android widgets are PNG bitmaps, not RemoteViews text.** `RNWidget.java` calls
>    `saveBitmapToDisk` unconditionally per render (light + dark). Every refresh does a
>    view measure, canvas draw, PNG compress and disk write inside headless JS. Heavier
>    than described below — and the reason image cleanup exists on delete at all.
>
> 7. **Version drift.** `expo-widgets` 56.x latest is 56.0.22 (SDK 57 has shipped).
>    Jetpack Glance stable is **1.1.1**; 1.2.0 is RC only — this document never pins a
>    version. `react-native-android-widget` 0.20.3 is still latest.
>
> ### If this is ever revived
>
> iOS only. Fix the server's `hashrate1h`/`hashrate24h` first, or drop those two rows from
> the widget. Expect ~400 lines of SwiftUI: the server already returns pre-formatted
> display strings, and the existing `@expo/ui/swift-ui` JSX is `Text`/`VStack`/`HStack`/
> `Spacer` only, so it translates nearly 1:1. The real win is WidgetKit's 40–70
> self-fetching timeline reloads/day versus the handful of silent pushes Apple's
> `content-available` budget actually delivers. Weigh that against a solo maintainer
> permanently owning Swift plus a bespoke idempotent config plugin across Expo SDK upgrades.

## Executive summary

ParaApp currently uses two different JavaScript-driven widget packages:

- iOS: `expo-widgets` renders SwiftUI widget layouts from widget-marked JSX and
  reads timelines that the React Native app previously wrote into an App Group.
- Android: `react-native-android-widget` starts a React Native Headless JS task
  for widget lifecycle events, fetches data, renders React elements into
  `RemoteViews`, and asks Android to redraw the widget.

The current implementation has been hardened with bounded network calls,
single-flight refreshes, cancellation, reduced background wakeups, and strict
separation between visible notifications and widget-only silent pushes. Those
changes are appropriate for the 0.5.3 release, but the underlying packages
still impose architectural limits:

- The iOS widget extension cannot independently fetch fresh data through the
  installed Expo widget provider. Fresh snapshots must first be written by the
  app after a foreground refresh, an iOS background task, or a delivered silent
  push.
- Android widget updates start the React Native/Hermes runtime in the
  background. This is significantly heavier and has more failure modes than a
  native Glance widget backed by a native WorkManager worker.
- The Android package contains a confirmed null-crash path during widget image
  cleanup on widget deletion. The upstream Android 16 report remains open, and
  the unsafe code is still present in 0.20.3.
- Widget work and notification infrastructure are currently coupled on iOS
  because silent widget refreshes use an `expo-notifications` background task.

The recommended destination is a pair of small native widget implementations:

- SwiftUI + WidgetKit on iOS.
- Kotlin + Jetpack Glance + WorkManager on Android.

Both native implementations should consume the existing server snapshot JSON.
React Native remains responsible for settings and foreground behavior, but the
widgets should be able to refresh and render without starting the full React
Native runtime. Visible notifications must remain on their existing pipeline
and must not be changed as part of this migration.

This document is intentionally a planning handoff, not a final specification.
The next session should validate the open decisions, produce an implementation
plan, and then implement the migration in phases.

## Goals

1. Improve widget background reliability and reduce background app-process
   crashes.
2. Give iOS widgets an opportunity to fetch current data when WidgetKit invokes
   their native timeline provider.
3. Stop starting React Native Headless JS solely to update Android widgets.
4. Isolate widget failures, scheduling, and push delivery from visible
   notifications.
5. Keep the existing pool and personal widget designs and deep links.
6. Preserve already-installed widgets across app upgrades wherever the
   platforms allow it.
7. Continue using the server's cached widget endpoints so widgets do not query
   Parasite Pool directly and do not duplicate snapshot-building logic.
8. Keep the implementation compatible with Expo development builds, Prebuild,
   and EAS Build.

## Non-goals

- Replacing or redesigning visible notifications.
- Guaranteeing an exact widget refresh interval. iOS and Android ultimately
  control background scheduling.
- Matching the refresh behavior of Apple's Weather widget. Apple system apps
  may use system services and scheduling behavior unavailable to third-party
  applications.
- Adding Live Activities or Dynamic Island functionality during this migration.
- Replacing the existing server notification system.
- Making local miners reachable from a widget while the phone is away from the
  local network.
- Introducing another cross-platform widget package solely to reduce the
  amount of Swift or Kotlin in the repository.

## Notification safety is the highest priority

The user-visible notification system is more important than widgets. The
following are hard invariants for every migration phase:

1. Do not change visible notification payload construction, sound, priority,
   categories, permissions, token registration, receipt handling, or routing.
2. Do not unregister the app's standard Expo push token when widgets are
   disabled or migrated.
3. Do not reuse a visible-notification payload as a widget-refresh command.
4. Any legacy silent widget task must continue to reject visible notifications
   and notification action responses.
5. A widget refresh failure must not return failure for, consume, suppress, or
   delay a visible notification.
6. Android widget refreshes should not use FCM or Expo notifications for their
   baseline schedule.
7. iOS WidgetKit push notifications, if adopted for iOS 26+, must use their
   dedicated WidgetKit push token and server path. They are not a replacement
   for or modification of the normal Expo notification token.
8. Removal of legacy widget tasks must happen only after the native widgets are
   proven to refresh independently.

## Current implementation

### Shared data path

The Cloudflare Worker server already exposes purpose-built, cached snapshots:

- `GET /widget/pool`
- `GET /widget/user/:address`

The relevant server code is in:

- `server/src/index.ts`
- `server/src/widget-snapshots.ts`
- `server/src/db.ts`
- `server/src/cron.ts`
- `server/src/push.ts`

The app-side TypeScript contract and transformations are in:

- `src/widgets/types.ts`
- `src/widgets/snapshots.ts`
- `src/api/push.ts`
- `src/widgets/updater.ts`

The server should remain the source of truth for formatted widget snapshot
data. Native widgets should decode that JSON and render it, not recreate pool
business logic independently.

### iOS today

Configuration:

- Package: `expo-widgets` 56.0.18 at the time of this document.
- Extension target: `ExpoWidgetsTarget`.
- Extension bundle identifier:
  `app.parasite.paraapp.ExpoWidgetsTarget`.
- App Group: `group.app.parasite.paraapp`.
- Widget kinds: `PersonalMiningWidget` and `PoolOverviewWidget`.
- Families: `systemSmall`, `systemMedium`, and `accessoryRectangular`.

Layout code is in `src/widgets/widgets.tsx`. The installed Expo timeline
provider reads serialized entries from App Group `UserDefaults`. It does not
run our asynchronous API calls when WidgetKit asks it for a timeline.

Fresh data arrives through these paths:

1. The React Native app refreshes its stores while foregrounded and writes new
   widget snapshots.
2. An Expo iOS background task runs at a system-selected time and calls
   `refreshWidgetsFromBackend()`.
3. A widget-only silent push is delivered, the registered notification task
   verifies that it is a silent `widget_refresh`, and then refreshes snapshots.

The timeline built in `src/widgets/snapshots.ts` schedules re-renders at 0, 60,
120, 150, 151, and 180 minutes. Every entry contains the same data. These
entries keep the freshness label accurate, but they do not fetch new data.

### Android today

Configuration:

- Package: `react-native-android-widget` 0.20.3, which is the latest published
  release at the time of this document.
- Receiver classes:
  - `app.paraapp.widget.PersonalMiningWidget`
  - `app.paraapp.widget.PoolOverviewWidget`
- Periodic request: `updatePeriodMillis: 1800000` (30 minutes, subject to
  Android scheduling and battery policy).

Layout code is in:

- `src/widgets/android/PersonalMiningAndroidWidget.tsx`
- `src/widgets/android/PoolOverviewAndroidWidget.tsx`
- `src/widgets/android/taskHandler.tsx`
- `src/widgets/android/storage.ts`

The package's `AppWidgetProvider` enqueues a WorkManager job for widget add,
update, resize, deletion, and some click events. That job initializes the React
Native host and starts a Headless JS task with a 30-second timeout. The package
also maintains a one-time WorkManager request delayed by ten years as a
workaround for an Android WorkManager/AppWidget update issue.

The 0.5.3 hardening removed redundant Expo background and notification tasks
from Android, but the remaining Android widget update still starts Headless JS.

## Why native implementations are preferable

### iOS

A native `TimelineProvider` can:

- Read a cached snapshot immediately for fast rendering.
- Make a bounded `URLSession` request while the widget extension is active.
- Decode the server snapshot directly.
- Return a fresh entry when the request succeeds.
- Return cached data and a later retry date when it fails.
- Ask WidgetKit for the next timeline after an appropriate interval.
- Receive dedicated WidgetKit push notifications on iOS 26+ if we decide to
  build that optional path.

WidgetKit still applies a dynamic refresh budget. A requested 30-minute reload
is not a guarantee, and the system may delay or skip it. Native code improves
the available refresh mechanisms; it does not bypass iOS policy.

### Android

A native Glance implementation can:

- Render the widget without React Native or Hermes.
- Use a native `CoroutineWorker` for bounded snapshot requests.
- Schedule unique periodic work only while at least one widget is installed.
- Apply network and battery constraints explicitly.
- Store small snapshots and preferences in DataStore or SharedPreferences.
- Redraw all installed widget instances after successful persistence.
- Handle add, resize, update, and delete events without crossing the React
  Native bridge.

This reduces startup work, memory pressure, and the number of components that
can fail during a background widget event.

## Alternatives evaluated

### Keep the current packages indefinitely

This has the lowest migration risk, and the 0.5.3 changes make it safer than it
was. It does not solve the iOS independent-fetch limitation or the Android
Headless JS architecture. This is an acceptable release baseline but not the
preferred long-term design.

### Upgrade `expo-widgets`

The SDK 56 patch line has releases newer than 56.0.18. A compatible patch
upgrade should be evaluated separately, but current releases do not change the
core iOS snapshot/timeline model described above. It should not be treated as
the native migration.

Expo has merged Android widget support upstream, including a widget JS bundle
and a dedicated Hermes runtime. It is not documented as part of the current
stable cross-platform API. When it becomes stable it may be a useful
maintainability option, but a JavaScript runtime remains involved, so it should
be benchmarked against the native reliability goal rather than adopted solely
because it unifies JSX.

### Voltra

Voltra is actively developed and uses Jetpack Glance for Android widgets. Its
documented iOS surface focuses on Live Activities and Dynamic Island rather
than ordinary iOS home-screen widgets. It is also young and has open work around
Android headless execution, on-device updates, and per-instance configuration.
It is not a complete replacement for ParaApp's two-platform widget needs.

### Another community widget bridge

Switching from one Headless JS or generated-native bridge to another would add
migration risk without necessarily removing background-runtime failure modes.
No researched package currently provides a mature, released, two-platform
solution that is clearly safer than small native implementations.

## Proposed target architecture

```text
                         ParaApp server
                  cached widget snapshot JSON
                     /widget/pool
                     /widget/user/:address
                              |
             +----------------+----------------+
             |                                 |
      iOS WidgetKit extension          Android WorkManager worker
       SwiftUI TimelineProvider             Kotlin coroutine
             |                                 |
      App Group cached JSON             DataStore cached JSON
             |                                 |
        SwiftUI widgets                   Glance widgets

             React Native application
       writes widget settings/configuration only
       requests foreground refresh when appropriate

             Visible notification pipeline
       remains separate and unchanged end-to-end
```

## Shared native data contract

The native platforms need stable DTOs matching the server responses. Before
implementation, define and freeze a versioned widget snapshot contract.

Recommended response envelope:

```json
{
  "success": true,
  "data": {
    "kind": "pool",
    "fetchedAt": 1783700000000,
    "source": "server"
  }
}
```

The actual DTOs must include all fields currently declared in
`src/widgets/types.ts`. Decide during planning whether to:

1. Keep manually mirrored Swift `Codable` and Kotlin serialization models,
   with contract fixture tests; or
2. Add a JSON Schema/OpenAPI source and generate TypeScript, Swift, and Kotlin
   models.

For only two small snapshot types, manual native models plus shared JSON
fixtures may be simpler and more transparent. The tests must fail if a required
field or type drifts.

Native widgets should treat unknown fields as forward-compatible and should
preserve the last good cached snapshot if decoding or networking fails.

## iOS design

### Extension structure

The custom extension should contain approximately these components:

- `PersonalMiningWidget.swift`
- `PoolOverviewWidget.swift`
- `PersonalMiningView.swift`
- `PoolOverviewView.swift`
- `WidgetSnapshotModels.swift`
- `WidgetSnapshotClient.swift`
- `WidgetSnapshotStore.swift`
- `WidgetDeepLinks.swift`
- `WidgetBundle.swift`

Exact paths should be generated by a local Expo config plugin rather than
maintained as undocumented edits to generated native projects.

### Timeline behavior

For each widget timeline request:

1. Load the last good snapshot from the App Group.
2. If the context is a widget-gallery preview, return deterministic preview
   data without networking.
3. Read the widget-enabled flag and current Bitcoin address from the App Group.
4. If updates are disabled, return cached data with a conservative future
   timeline date and perform no network call.
5. Request the relevant server snapshot using an ephemeral `URLSession` and a
   short timeout, provisionally 6 seconds.
6. Validate the HTTP response and decode the response envelope.
7. Atomically persist a valid snapshot to the App Group.
8. Return the new snapshot. On any error, return cached data.
9. Request a next timeline no sooner than 30 minutes. The final interval should
   be selected after measuring WidgetKit behavior and server load.

Never erase a good cached snapshot because of a timeout, decoding error, missing
address during a transient migration, or server error.

### iOS refresh triggers

Baseline triggers:

- WidgetKit timeline invocation with direct fetch.
- App foreground refresh writes updated configuration/snapshot and calls
  `WidgetCenter.reloadTimelines(ofKind:)`.
- Settings/address changes update App Group values and reload both widget kinds.

Supplemental triggers:

- Keep the existing strictly filtered silent widget push path during the
  migration and for older iOS versions if testing shows it materially improves
  freshness.
- Investigate `WidgetPushHandler` and dedicated WidgetKit push tokens for iOS
  26+. This is a separate APNs integration and must not reuse or alter Expo
  notification tokens.

The direct timeline fetch must remain sufficient for basic functionality even
when notification permission is denied and silent pushes are unavailable.

### iOS state shared from the app

At minimum, the app must mirror these values into the App Group:

- Schema/storage version.
- `widgetUpdatesEnabled`.
- Bitcoin address, or an explicit no-address marker.
- Last good pool snapshot.
- Last good personal snapshot.
- Optional last refresh attempt/success timestamps for diagnostics.

Do not make the widget extension parse React Native AsyncStorage files.
Introduce a narrow native bridge that writes explicit, versioned App Group
keys.

### iOS identity compatibility

To maximize the chance that existing installed widgets survive the update,
preserve:

- Extension target name: `ExpoWidgetsTarget`, unless planning confirms the
  target name can change without affecting installation.
- Extension bundle identifier:
  `app.parasite.paraapp.ExpoWidgetsTarget`.
- App Group: `group.app.parasite.paraapp`.
- Widget kind names: `PersonalMiningWidget` and `PoolOverviewWidget`.
- Supported widget families.
- Existing deep-link URLs.

Test an App Store-style upgrade from 0.5.3 to a migration build with both widget
kinds already placed. A clean install is not an adequate migration test.

## Android design

### Native components

The custom Android implementation should contain approximately:

- `PersonalMiningWidget : GlanceAppWidget`
- `PersonalMiningWidgetReceiver : GlanceAppWidgetReceiver`, or a receiver class
  structured to preserve the current component name.
- `PoolOverviewWidget : GlanceAppWidget`
- `PoolOverviewWidgetReceiver : GlanceAppWidgetReceiver`, with the same identity
  consideration.
- `WidgetRefreshWorker : CoroutineWorker`
- `WidgetRefreshScheduler`
- `WidgetSnapshotClient`
- `WidgetSnapshotStore`
- Kotlin serialization DTOs.
- Glance theme and shared layout components.
- A small Expo native module for configuration mirroring and immediate refresh
  requests.

### Work scheduling

Recommended behavior:

1. When the first widget instance is enabled, enqueue unique periodic widget
   refresh work.
2. When the last widget instance is disabled, cancel that unique work.
3. Require network connectivity.
4. Use a provisional 30- or 60-minute interval, subject to device testing,
   battery behavior, and Android's recommendation to update infrequently.
5. Use unique work names so app upgrades do not create duplicate schedules.
6. On widget add, render cache immediately and enqueue a one-time refresh.
7. On resize, render from cache without networking.
8. On periodic update, fetch both required snapshots once, persist them, then
   update every installed instance.
9. On failure, keep cached data and use bounded WorkManager retry/backoff only
   when it provides value. Do not create a rapid crash/retry loop.
10. Widget deletion must never start React Native and must safely tolerate
    missing image/cache directories.

### Android state shared from the app

Mirror the same minimal configuration used on iOS into native DataStore or
SharedPreferences:

- Schema/storage version.
- `widgetUpdatesEnabled`.
- Bitcoin address or explicit no-address state.
- Optional diagnostics timestamps.

The worker should store its own last good native snapshots. It should not parse
AsyncStorage or depend on Zustand hydration.

### Android identity compatibility

The current manifest components are:

- `app.paraapp.widget.PersonalMiningWidget`
- `app.paraapp.widget.PoolOverviewWidget`

Changing an Android widget provider component can orphan or remove placed
widgets. The implementation plan must determine how to retain those exact
component names while changing their superclass/implementation to Glance.

Also preserve:

- Widget descriptions and labels.
- Provider XML sizing, resizing, categories, and preview behavior.
- Deep links.
- Package name `app.paraapp`.

Test an upgrade with multiple widget instances and different launcher vendors.

## Expo/CNG integration

Do not rely on hand-editing `ios/` and `android/` generated files. Implement the
native widgets as a local Expo module plus config plugin, or as a carefully
scoped local plugin with native source templates.

The integration must:

- Add/copy Swift widget-extension sources.
- Configure the existing extension target, bundle ID, App Group, Info.plist,
  entitlements, build phases, and EAS app-extension credentials.
- Add/copy Kotlin widget sources and resources.
- Configure Glance, WorkManager, Kotlin serialization, manifest receivers, and
  provider XML.
- Expose a narrow app-facing module for mirrored settings, cached foreground
  snapshots, and manual reload requests.
- Produce the same result from a clean `expo prebuild` as from an incremental
  prebuild.
- Avoid changing notification entitlements or the `expo-notifications` plugin.
- Be idempotent so repeated Prebuild runs do not create duplicate targets,
  receivers, build phases, or dependencies.

Before implementation, inspect how `expo-widgets` currently creates the
extension and decide whether to replace that plugin entirely or retain only a
small portion of its generated configuration. Do not run both generators if
they create duplicate widget kinds or targets.

## Migration phases

### Phase 0: stabilize the current release

- Keep the 0.5.3 bounded/cancellable widget refresh changes.
- Add or carry a local patch for the Android widget deletion null crash unless
  upstream releases a verified fix first.
- Add production crash reporting breadcrumbs that identify widget-owned work
  without recording Bitcoin addresses or push tokens.
- Establish baseline metrics before the native migration.

The deletion patch should defensively handle `folder.listFiles(...) == null`.
It is widget-only and must not touch notification code.

### Phase 1: implementation plan and contract fixtures

- Decide native source/plugin directory structure.
- Freeze the widget snapshot DTOs.
- Add representative valid, partial, stale, malformed, and forward-compatible
  JSON fixtures.
- Define App Group/DataStore key names and storage versioning.
- Define refresh intervals and timeout constants.
- Document upgrade identity requirements in tests.
- Decide the minimum supported iOS behavior for direct WidgetKit push support.

### Phase 2: Android native prototype

Android goes first because it has the strongest crash report and the current
architecture starts the full React Native runtime.

- Implement native DTOs, cache, HTTP client, worker, and one widget layout.
- Prove that periodic/add/resize/delete events do not initialize React Native.
- Prove that work only exists while a widget is installed.
- Measure cold background memory, execution duration, server calls, and battery
  scheduling on representative devices.
- Implement the second widget after the architecture is validated.
- Verify upgrade identity from 0.5.3.
- Keep normal notifications enabled throughout every test.

### Phase 3: iOS native prototype

- Implement native DTOs, App Group store, client, and one timeline provider.
- Verify direct fetch while the app is not active.
- Measure actual refresh age over several days; do not rely only on simulator
  behavior.
- Verify denied notification permission does not prevent baseline widget
  timeline refresh.
- Implement all families and the second widget.
- Verify upgrade identity from 0.5.3.
- Evaluate whether silent pushes still add enough freshness to retain.
- Separately prototype iOS 26 WidgetKit push tokens if justified.

### Phase 4: controlled rollout

- Release behind build-time or native feature flags if feasible.
- Use internal/TestFlight/closed Play testing first.
- Compare widget freshness and background crash rates with the baseline.
- Confirm visible notification delivery and interaction metrics are unchanged.
- Test upgrades, clean installs, widget removal/re-addition, notification denial,
  low-power mode, force-stop, reboot, poor connectivity, and address changes.

### Phase 5: remove legacy widget runtime paths

Only after successful rollout:

- Remove `react-native-android-widget` and its Headless JS registration.
- Remove Android widget JSX, AsyncStorage snapshot storage, and task handler.
- Remove `expo-widgets` only after the native iOS extension fully replaces its
  target and renderer.
- Remove Expo background/silent widget tasks only if native timeline refresh and
  the selected push strategy make them unnecessary.
- Keep normal `expo-notifications` dependencies and app notification code.
- Remove server-side widget silent pushes only after older app versions no
  longer require them or the server gates by app capability/version.

Server compatibility is important: old installed versions may continue to
depend on widget silent pushes during the migration window.

## Observability

Before and during rollout, capture privacy-safe widget diagnostics:

- Platform and app version.
- Widget implementation generation: `legacy-js`, `native-v1`, etc.
- Widget kind and family/size, without address.
- Refresh trigger: foreground, timeline, periodic worker, manual, legacy silent
  push, or WidgetKit push.
- Attempt time, duration, outcome category, cache age, and whether rendering
  used fresh or cached data.
- WorkManager run-attempt count and stop reason where available.
- Whether any widget instance exists.
- Native crash stack traces through the app's crash reporting provider.

Never log:

- Full Bitcoin addresses.
- Push tokens or WidgetKit push tokens.
- Full snapshot response bodies.
- Local miner IP addresses.

Useful release-level metrics:

- Background crash-free users.
- Median and 95th-percentile widget data age when rendered.
- Widget refresh success rate.
- Number of server calls per installed widget per day.
- Visible notification delivery/open behavior compared with the pre-migration
  baseline.

## Verification matrix

### Functional

- Pool and personal widget render all supported sizes.
- No-address personal state is correct.
- Address changes never temporarily show a previous address's data.
- Stale and last-updated labels advance without needing fresh network data.
- Deep links open the correct app destination.
- Widget update setting disables background network calls but leaves cached
  rendering intact.
- Notifications continue when widgets are disabled.
- Widgets continue baseline timeline/worker refresh when visible notification
  permission is denied, within platform limitations.

### Lifecycle

- Add first widget.
- Add multiple instances.
- Resize repeatedly.
- Delete one of several instances.
- Delete the last instance.
- Reboot with a widget installed.
- Upgrade from 0.5.3 with widgets already installed.
- Upgrade with no widgets installed.
- Force-stop and later reopen.
- Background app restriction/deep standby.
- Low-power/battery-saver mode.
- Offline, slow network, timeout, server 500, invalid JSON, and recovery.

### Platforms/devices

- Oldest supported iOS version.
- iOS 18 and current iOS 26, including tinted/Lock Screen rendering.
- At least one physical iPhone; background behavior cannot be approved from the
  simulator alone.
- Android versions spanning the app's supported minimum through Android 16.
- Pixel/AOSP launcher.
- Samsung One UI launcher, because the reported repeated-crash/deep-standby
  behavior came from Android users and the upstream deletion crash was reported
  on Samsung.
- At least one additional vendor with aggressive background management if
  available.

### Build and regression

- Clean and incremental `expo prebuild` produce equivalent native projects.
- iOS simulator and physical-device Release builds.
- Android Release assemble/bundle.
- TypeScript typecheck, unit tests, lint, and server typecheck.
- Native Swift/Kotlin unit tests for decoding, cache fallback, and scheduling.
- Contract tests run against shared JSON fixtures.
- Diff generated manifests, entitlements, Info.plists, and Xcode targets to
  confirm notification configuration is unchanged.

## Acceptance criteria

The migration is complete only when all of these are true:

1. Android periodic widget updates do not initialize React Native/Hermes.
2. Android schedules no widget periodic work when no widget is installed.
3. iOS can obtain fresh server data from its native timeline provider without
   first launching React Native.
4. Both platforms preserve last good data on all network and decoding failures.
5. Existing widgets survive a tested 0.5.3-to-native upgrade, or any unavoidable
   platform limitation is explicitly documented before release.
6. Visible notification registration, delivery, sound, routing, and actions are
   unchanged and regression-tested.
7. Denying visible notification permission does not disable the native
   baseline widget refresh mechanisms.
8. Background crash-free user rate is no worse than 0.5.3 and Android
   widget-related crash signatures decline.
9. Server load remains within an agreed budget.
10. Legacy widget tasks and packages are removed only after old-version server
    compatibility is handled.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Existing widgets disappear after upgrade | Preserve extension bundle ID, widget kinds, Android provider component names, App Group, and provider metadata; run upgrade tests. |
| Native DTOs drift from TypeScript/server | Use shared fixtures and contract tests; consider schema generation if manual models become burdensome. |
| Widget refresh increases server load | Continue using cached server snapshot endpoints, add jitter where possible, measure calls, and use conservative intervals. |
| Native timeline/worker returns invalid data | Validate and atomically cache only fully decoded snapshots; always retain last good state. |
| Widget work affects notifications | Keep separate tokens, tasks, modules, and server paths; regression-test notifications at every phase. |
| Config plugin corrupts generated projects | Make it idempotent and test clean/incremental Prebuild plus native project diffs. |
| iOS still refreshes less often than desired | Set realistic expectations, measure physical devices, combine native timelines with foreground reloads and optional WidgetKit pushes. |
| Android vendors defer periodic work | Render cache immediately, use standard WorkManager constraints, avoid abusive expedited jobs, and display honest freshness. |
| Native implementation duplicates layout code | Share colors, constants, fixtures, and design specs; accept platform-native view code as the reliability tradeoff. |
| Old app versions still require silent pushes | Add capability/app-version gating and retain the server path through an explicit deprecation window. |

## Open decisions for the next planning session

1. Should Android or iOS be implemented first? Research recommends Android
   first, but release priorities may change this.
2. Should native source live in a local Expo module under `modules/`, or in a
   dedicated config-plugin package under `plugins/` with generated templates?
3. Can the existing iOS `ExpoWidgetsTarget` be cleanly converted in place, or
   should the plugin recreate it with the exact same identifier?
4. What is the safest method to retain the exact Android provider component
   names while switching to Glance?
5. Should native snapshot DTOs be manually mirrored with fixtures or generated
   from a schema?
6. What refresh interval balances data freshness, WidgetKit/WorkManager policy,
   battery use, and server load?
7. Should the iOS native widget fetch both pool and user snapshots in one server
   request to reduce extension execution time?
8. Should the server add ETag/`If-None-Match`, `Last-Modified`, or a combined
   snapshot endpoint?
9. How long must the server continue sending legacy widget silent pushes?
10. Is iOS 26 WidgetKit push support worth the APNs/token-storage complexity in
    the first native release, or should it be a later enhancement?
11. Which crash/telemetry provider will record native widget extension and
    worker diagnostics?
12. Should users retain a Widget Updates toggle once widgets use platform-native
    scheduling, and what exactly should disabling it do?

## Recommended next-session starting procedure

In a fresh session:

1. Read `.claude/CLAUDE.md` and this document completely.
2. Inspect current `git status` and preserve unrelated/user changes.
3. Confirm the 0.5.3 widget-crash hardening is present before designing against
   the current code.
4. Re-check current official Expo, WidgetKit, Glance, WorkManager, and package
   release notes because these APIs are changing quickly.
5. Inspect the generated iOS extension target and Android widget receivers.
6. Answer the open identity and plugin-structure questions.
7. Produce a concrete file-by-file implementation plan with phases, rollback
   points, and notification regression checks.
8. Implement the Android deletion null guard independently if it has not already
   been patched or fixed upstream.
9. Begin with a small native proof of concept rather than removing either
   legacy package immediately.

Suggested prompt for the next session:

**Superseded — see the deferral notice at the top of this document.** This migration is
not approved. Steps 8 and 9 above are done (the Android null guard is applied as
`patches/react-native-android-widget.patch`; no legacy package was removed). Do not run
the prompt below without first re-reading the deferral notice, in particular the
`hashrate1h`/`hashrate24h` server prerequisite and the corrected iOS-first sequencing.

> Read `NATIVE_WIDGET_MIGRATION.md` and the repository instructions. Re-validate
> the current widget packages and platform documentation, inspect the generated
> native projects, resolve the open architecture/identity decisions, and create
> a detailed implementation plan. Notifications are higher priority than
> widgets and must remain unchanged. Do not remove the legacy widget paths until
> the native proof of concept and upgrade tests pass.

## Research sources

- Expo Widgets documentation:
  <https://docs.expo.dev/versions/latest/sdk/widgets/>
- Expo custom native code guidance:
  <https://docs.expo.dev/workflow/customizing/>
- Expo iOS app extensions guidance:
  <https://docs.expo.dev/build-reference/app-extensions/>
- Apple, Keeping a widget up to date:
  <https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date>
- Apple, Making network requests in a widget extension:
  <https://developer.apple.com/documentation/widgetkit/making-network-requests-in-a-widget-extension>
- Apple, Updating widgets with WidgetKit push notifications:
  <https://developer.apple.com/documentation/widgetkit/updating-widgets-with-widgetkit-push-notifications>
- Android, Create an app widget with Glance:
  <https://developer.android.com/develop/ui/compose/glance/create-app-widget>
- Android, Define WorkManager work requests:
  <https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work>
- `react-native-android-widget` Android 16 deletion crash:
  <https://github.com/sAleksovski/react-native-android-widget/issues/143>
- Voltra repository and documented platform support:
  <https://github.com/callstackincubator/voltra>

## Repository references

- `app.json`
- `package.json`
- `index.ts`
- `src/hooks/useWidgetUpdates.ts`
- `src/hooks/useNotifications.ts`
- `src/widgets/backgroundTask.ts`
- `src/widgets/notificationPayload.ts`
- `src/widgets/snapshots.ts`
- `src/widgets/types.ts`
- `src/widgets/updater.ts`
- `src/widgets/widgets.tsx`
- `src/widgets/android/PersonalMiningAndroidWidget.tsx`
- `src/widgets/android/PoolOverviewAndroidWidget.tsx`
- `src/widgets/android/storage.ts`
- `src/widgets/android/taskHandler.tsx`
- `src/api/client.ts`
- `src/api/push.ts`
- `server/src/cron.ts`
- `server/src/db.ts`
- `server/src/index.ts`
- `server/src/push.ts`
- `server/src/widget-snapshots.ts`

