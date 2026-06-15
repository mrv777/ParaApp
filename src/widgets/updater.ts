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
  personalMiningWidget.updateTimeline(buildWidgetTimeline(snapshot));
  return true;
}

export function updatePoolOverviewWidget(
  snapshot: PoolOverviewWidgetSnapshot
): boolean {
  if (!canUpdateWidgets()) return false;
  poolOverviewWidget.updateTimeline(buildWidgetTimeline(snapshot));
  return true;
}

export function updateWidgetsFromStores(): boolean {
  if (!canUpdateWidgets()) return false;

  const settings = useSettingsStore.getState();
  const poolCached = usePoolStore.getState().stats;
  const userState = useUserStore.getState();
  const userCached = userState.stats;
  const statsMatchAddress = userState.statsAddress === settings.bitcoinAddress;

  if (poolCached?.data) {
    updatePoolOverviewWidget(
      buildPoolOverviewSnapshot(poolCached.data, poolCached.timestamp)
    );
  }

  if (!settings.bitcoinAddress) {
    updatePersonalMiningWidget(buildNoAddressPersonalSnapshot());
  } else if (userCached?.data && statsMatchAddress) {
    updatePersonalMiningWidget(
      buildPersonalMiningSnapshot(
        settings.bitcoinAddress,
        userCached.data,
        userCached.timestamp
      )
    );
  }
  // Address set but stats missing or belonging to a previous address: leave the
  // widget unchanged. It self-corrects when the new address's stats arrive (the
  // useWidgetUpdates effect re-runs on userTimestamp) or via backend refresh.

  return true;
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
    updatePoolOverviewWidget({
      ...poolResult.data.data,
      source: 'server',
    });
    updated = true;
  }

  if (settings.bitcoinAddress) {
    const userResult = await getUserWidgetSnapshot(settings.bitcoinAddress);
    if (isSuccess(userResult) && userResult.data.success) {
      updatePersonalMiningWidget({
        ...userResult.data.data,
        source: 'server',
      });
      updated = true;
    }
  } else {
    updatePersonalMiningWidget(buildNoAddressPersonalSnapshot());
    updated = true;
  }

  return updated;
}
