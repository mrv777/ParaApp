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
import { personalMiningWidget, poolOverviewWidget } from './widgets';
import type {
  PersonalMiningWidgetSnapshot,
  PoolOverviewWidgetSnapshot,
} from './types';

function canUpdateWidgets(): boolean {
  return Platform.OS === 'ios';
}

export function updatePersonalMiningWidget(
  snapshot: PersonalMiningWidgetSnapshot
): boolean {
  if (!canUpdateWidgets()) return false;
  try {
    personalMiningWidget.updateTimeline(buildWidgetTimeline(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function updatePoolOverviewWidget(
  snapshot: PoolOverviewWidgetSnapshot
): boolean {
  if (!canUpdateWidgets()) return false;
  try {
    poolOverviewWidget.updateTimeline(buildWidgetTimeline(snapshot));
    return true;
  } catch {
    return false;
  }
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

export async function refreshWidgetsFromBackend(): Promise<boolean> {
  if (!canUpdateWidgets()) return false;

  // Headless/background launches may run before AsyncStorage rehydrates; without
  // this, bitcoinAddress reads as null and overwrites a real user's widget.
  await awaitSettingsHydration();

  const settings = useSettingsStore.getState();
  let updated = false;

  const poolResult = await getPoolWidgetSnapshot();
  if (isSuccess(poolResult) && poolResult.data.success) {
    updated = updatePoolOverviewWidget({
      ...poolResult.data.data,
      source: 'server',
    }) || updated;
  }

  if (settings.bitcoinAddress) {
    const userResult = await getUserWidgetSnapshot(settings.bitcoinAddress);
    if (isSuccess(userResult) && userResult.data.success) {
      updated = updatePersonalMiningWidget({
        ...userResult.data.data,
        source: 'server',
      }) || updated;
    }
  } else {
    updated = updatePersonalMiningWidget(buildNoAddressPersonalSnapshot()) || updated;
  }

  return updated;
}
