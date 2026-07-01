import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildNoAddressPersonalSnapshot,
} from '../snapshots';
import type {
  PersonalMiningWidgetSnapshot,
  PoolOverviewWidgetSnapshot,
} from '../types';

// Android analog of the iOS App Group: the headless WidgetTaskHandler runs in a
// separate JS context from the app, so the latest snapshot is persisted here for
// the handler to read when it re-renders a placed widget.
const PERSONAL_KEY = 'paraapp.widget.personal';
const POOL_KEY = 'paraapp.widget.pool';

const POOL_PLACEHOLDER: PoolOverviewWidgetSnapshot = {
  kind: 'pool',
  poolHashrate: '-- H/s',
  users: '--',
  workers: '--',
  highestDiff: '--',
  lastBlock: '--',
  fetchedAt: 0,
  source: 'placeholder',
};

export async function setPersonalSnapshot(
  snapshot: PersonalMiningWidgetSnapshot
): Promise<void> {
  await AsyncStorage.setItem(PERSONAL_KEY, JSON.stringify(snapshot));
}

export async function setPoolSnapshot(
  snapshot: PoolOverviewWidgetSnapshot
): Promise<void> {
  await AsyncStorage.setItem(POOL_KEY, JSON.stringify(snapshot));
}

export async function getPersonalSnapshot(): Promise<PersonalMiningWidgetSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(PERSONAL_KEY);
    if (raw) return JSON.parse(raw) as PersonalMiningWidgetSnapshot;
  } catch {
    // fall through to placeholder
  }
  return buildNoAddressPersonalSnapshot(0);
}

export async function getPoolSnapshot(): Promise<PoolOverviewWidgetSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(POOL_KEY);
    if (raw) return JSON.parse(raw) as PoolOverviewWidgetSnapshot;
  } catch {
    // fall through to placeholder
  }
  return POOL_PLACEHOLDER;
}
