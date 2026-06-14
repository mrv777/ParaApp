import { Platform } from 'react-native';

import { isSuccess } from '@/api';
import {
  getPoolWidgetSnapshot,
  getUserWidgetSnapshot,
} from '@/api/push';
import { usePoolStore } from '@/store/poolStore';
import { useSettingsStore } from '@/store/settingsStore';
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
  const userCached = useUserStore.getState().stats;

  if (poolCached?.data) {
    updatePoolOverviewWidget(
      buildPoolOverviewSnapshot(poolCached.data, poolCached.timestamp)
    );
  }

  if (settings.bitcoinAddress && userCached?.data) {
    updatePersonalMiningWidget(
      buildPersonalMiningSnapshot(
        settings.bitcoinAddress,
        userCached.data,
        userCached.timestamp
      )
    );
  } else {
    updatePersonalMiningWidget(buildNoAddressPersonalSnapshot());
  }

  return true;
}

export async function refreshWidgetsFromBackend(): Promise<boolean> {
  if (!canUpdateWidgets()) return false;

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
