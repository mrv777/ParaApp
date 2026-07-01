import { Platform } from 'react-native';

import { isSuccess } from '@/api';
import {
  getPoolWidgetSnapshot,
  getUserWidgetSnapshot,
} from '@/api/push';
import { usePoolStore } from '@/store/poolStore';
import { awaitSettingsHydration, useSettingsStore } from '@/store/settingsStore';
import { useUserStore } from '@/store/userStore';
import {
  buildNoAddressPersonalSnapshot,
  buildPersonalMiningSnapshot,
  buildPoolOverviewSnapshot,
  buildWidgetTimeline,
} from './snapshots';
import {
  PERSONAL_WIDGET_NAME,
  POOL_WIDGET_NAME,
  type PersonalMiningWidgetSnapshot,
  type PoolOverviewWidgetSnapshot,
} from './types';

function canUpdateWidgets(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

// iOS pushes a re-render timeline into the App Group via expo-widgets. Loaded
// lazily so the SwiftUI JSX (`@expo/ui/swift-ui`) never evaluates on Android.
function updateIosWidget(
  name: typeof PERSONAL_WIDGET_NAME | typeof POOL_WIDGET_NAME,
  snapshot: PersonalMiningWidgetSnapshot | PoolOverviewWidgetSnapshot
): boolean {
  try {
    const { personalMiningWidget, poolOverviewWidget } = require('./widgets');
    const widget =
      name === PERSONAL_WIDGET_NAME ? personalMiningWidget : poolOverviewWidget;
    widget.updateTimeline(buildWidgetTimeline(snapshot));
    return true;
  } catch {
    return false;
  }
}

// Android persists the snapshot for the headless task handler, then asks any
// placed widgets to redraw. Loaded lazily so react-native-android-widget (an
// Android-only native module) never loads on iOS.
//
// Awaitable: persists FIRST (durability is the real guarantee), then fully
// awaits render+draw of every placed widget via requestWidgetUpdateById. We
// avoid requestWidgetUpdate here because its internal forEach(async) does NOT
// await its callbacks, so a headless task could tear down the JS runtime before
// the draw actually lands (drawWidgetById itself is a synchronous native call).
async function updateAndroidWidgetAsync(
  name: typeof PERSONAL_WIDGET_NAME | typeof POOL_WIDGET_NAME,
  snapshot: PersonalMiningWidgetSnapshot | PoolOverviewWidgetSnapshot
): Promise<boolean> {
  let persisted = false;
  try {
    const {
      getWidgetInfo,
      requestWidgetUpdateById,
    } = require('react-native-android-widget');
    const { renderWidgetForInfo } = require('./android/taskHandler');
    const {
      setPersonalSnapshot,
      setPoolSnapshot,
    } = require('./android/storage');

    await (name === PERSONAL_WIDGET_NAME
      ? setPersonalSnapshot(snapshot)
      : setPoolSnapshot(snapshot));
    persisted = true;

    const infos: { widgetId: number }[] = await getWidgetInfo(name);
    // allSettled (not all): one failed widget must not skip its siblings.
    await Promise.allSettled(
      infos.map((info) =>
        requestWidgetUpdateById({
          widgetName: name,
          widgetId: info.widgetId,
          renderWidget: renderWidgetForInfo,
        })
      )
    );
    return true;
  } catch {
    // The snapshot is durable even if the draw threw; the next WIDGET_UPDATE /
    // WIDGET_ADDED tick redraws it from storage.
    return persisted;
  }
}

// Foreground (app alive): fire-and-forget is fine. Background/headless callers
// must use updatePersonalMiningWidgetAsync / updatePoolOverviewWidgetAsync so the
// persist+draw completes before the task's promise resolves.
function updateAndroidWidget(
  name: typeof PERSONAL_WIDGET_NAME | typeof POOL_WIDGET_NAME,
  snapshot: PersonalMiningWidgetSnapshot | PoolOverviewWidgetSnapshot
): boolean {
  void updateAndroidWidgetAsync(name, snapshot).catch(() => {});
  return true;
}

export function updatePersonalMiningWidget(
  snapshot: PersonalMiningWidgetSnapshot
): boolean {
  if (!canUpdateWidgets()) return false;
  return Platform.OS === 'android'
    ? updateAndroidWidget(PERSONAL_WIDGET_NAME, snapshot)
    : updateIosWidget(PERSONAL_WIDGET_NAME, snapshot);
}

export function updatePoolOverviewWidget(
  snapshot: PoolOverviewWidgetSnapshot
): boolean {
  if (!canUpdateWidgets()) return false;
  return Platform.OS === 'android'
    ? updateAndroidWidget(POOL_WIDGET_NAME, snapshot)
    : updateIosWidget(POOL_WIDGET_NAME, snapshot);
}

// Awaitable variants for background/headless callers (refreshWidgetsFromBackend).
// The iOS branch returns the synchronous updateIosWidget result (updateTimeline
// stays synchronous); only Android has real async persist+draw work to await.
export async function updatePersonalMiningWidgetAsync(
  snapshot: PersonalMiningWidgetSnapshot
): Promise<boolean> {
  if (!canUpdateWidgets()) return false;
  return Platform.OS === 'android'
    ? updateAndroidWidgetAsync(PERSONAL_WIDGET_NAME, snapshot)
    : updateIosWidget(PERSONAL_WIDGET_NAME, snapshot);
}

export async function updatePoolOverviewWidgetAsync(
  snapshot: PoolOverviewWidgetSnapshot
): Promise<boolean> {
  if (!canUpdateWidgets()) return false;
  return Platform.OS === 'android'
    ? updateAndroidWidgetAsync(POOL_WIDGET_NAME, snapshot)
    : updateIosWidget(POOL_WIDGET_NAME, snapshot);
}

export function updateWidgetsFromStores(): boolean {
  if (!canUpdateWidgets()) return false;

  const settings = useSettingsStore.getState();
  const poolCached = usePoolStore.getState().stats;
  const userState = useUserStore.getState();
  const userCached = userState.stats;
  const statsMatchAddress = userState.statsAddress === settings.bitcoinAddress;

  let updated = false;

  if (poolCached?.data) {
    updated = updatePoolOverviewWidget(
      buildPoolOverviewSnapshot(poolCached.data, poolCached.timestamp)
    ) || updated;
  }

  if (!settings.bitcoinAddress) {
    updated = updatePersonalMiningWidget(buildNoAddressPersonalSnapshot()) || updated;
  } else if (userCached?.data && statsMatchAddress) {
    updated = updatePersonalMiningWidget(
      buildPersonalMiningSnapshot(
        settings.bitcoinAddress,
        userCached.data,
        userCached.timestamp
      )
    ) || updated;
  }
  // Address set but stats missing or belonging to a previous address: leave the
  // widget unchanged. It self-corrects when the new address's stats arrive (the
  // useWidgetUpdates effect re-runs on userTimestamp) or via backend refresh.

  return updated;
}

export interface FetchedWidgetSnapshots {
  pool?: PoolOverviewWidgetSnapshot;
  personal?: PersonalMiningWidgetSnapshot;
}

// Fetch the latest server snapshots WITHOUT persisting or drawing. Shared by
// refreshWidgetsFromBackend (which then persists + draws via the *Async update
// functions) and the Android WIDGET_UPDATE task handler (which persists only).
// A field is left undefined when its fetch fails, so callers never clobber a good
// stored snapshot with an error placeholder.
export async function fetchServerWidgetSnapshots(): Promise<FetchedWidgetSnapshots> {
  // Headless/background launches may run before AsyncStorage rehydrates; without
  // this, bitcoinAddress reads as null and we'd overwrite a real user's widget.
  await awaitSettingsHydration();

  const settings = useSettingsStore.getState();
  const out: FetchedWidgetSnapshots = {};

  const poolResult = await getPoolWidgetSnapshot();
  if (isSuccess(poolResult) && poolResult.data.success) {
    out.pool = { ...poolResult.data.data, source: 'server' };
  }

  if (settings.bitcoinAddress) {
    const userResult = await getUserWidgetSnapshot(settings.bitcoinAddress);
    if (isSuccess(userResult) && userResult.data.success) {
      out.personal = { ...userResult.data.data, source: 'server' };
    }
    // User fetch failed → leave personal undefined (keep the stored snapshot).
  } else if (useSettingsStore.persist.hasHydrated()) {
    // Only assert "no address" once hydration truly finished — awaitSettingsHydration
    // can resolve on its 5s safety timeout with a real address not yet loaded, and we
    // must not overwrite that user's widget with the "Add address" placeholder.
    out.personal = buildNoAddressPersonalSnapshot();
  }

  return out;
}

export async function refreshWidgetsFromBackend(): Promise<boolean> {
  if (!canUpdateWidgets()) return false;

  const { pool, personal } = await fetchServerWidgetSnapshots();
  let updated = false;

  if (pool) {
    updated = (await updatePoolOverviewWidgetAsync(pool)) || updated;
  }
  if (personal) {
    updated = (await updatePersonalMiningWidgetAsync(personal)) || updated;
  }

  return updated;
}
