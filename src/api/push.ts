/**
 * Push notification backend API client
 */

import Constants from 'expo-constants';
import { postJson, fetchWithTimeout } from './client';
import type { ApiResult, FetchOptions } from '@/types';
import type { NotificationPrefs } from '@/store/settingsStore';
import type {
  PersonalMiningWidgetSnapshot,
  PoolOverviewWidgetSnapshot,
  WidgetSnapshotResponse,
} from '@/widgets/types';

const BASE_URL =
  Constants.expoConfig?.extra?.pushApiUrl ??
  'https://paraapp-notifications.7fmqnkfyfq.workers.dev';

interface RegisterRequest {
  pushToken: string;
  btcAddress: string;
  preferences?: NotificationPrefs;
  widgetUpdatesEnabled?: boolean;
  notificationsEnabled?: boolean;
}

interface RegisterResponse {
  success: boolean;
  preferences?: {
    blocks: boolean;
    workers: boolean;
    bestDiff: boolean;
  } | null;
}

/**
 * Register device for push notifications
 */
export async function registerDevice(
  pushToken: string,
  btcAddress: string,
  preferences?: NotificationPrefs,
  widgetUpdatesEnabled?: boolean,
  notificationsEnabled?: boolean
): Promise<ApiResult<RegisterResponse>> {
  const body: RegisterRequest = { pushToken, btcAddress };
  if (preferences) {
    body.preferences = preferences;
  }
  if (widgetUpdatesEnabled !== undefined) {
    body.widgetUpdatesEnabled = widgetUpdatesEnabled;
  }
  if (notificationsEnabled !== undefined) {
    body.notificationsEnabled = notificationsEnabled;
  }
  return postJson<RegisterResponse>(`${BASE_URL}/register`, body);
}

/**
 * Unregister device from push notifications
 */
export async function unregisterDevice(
  pushToken: string
): Promise<ApiResult<{ success: boolean }>> {
  return fetchWithTimeout<{ success: boolean }>(`${BASE_URL}/unregister`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pushToken }),
  });
}

/**
 * Update notification preferences for an address
 */
export async function updatePreferences(
  pushToken: string,
  btcAddress: string,
  preferences: NotificationPrefs,
  widgetUpdatesEnabled?: boolean,
  notificationsEnabled?: boolean
): Promise<ApiResult<{ success: boolean }>> {
  return fetchWithTimeout<{ success: boolean }>(`${BASE_URL}/preferences`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pushToken,
      btcAddress,
      ...preferences,
      widgetUpdatesEnabled,
      notificationsEnabled,
    }),
  });
}

export async function getPoolWidgetSnapshot(
  options: FetchOptions & Pick<RequestInit, 'signal'> = {}
): Promise<ApiResult<WidgetSnapshotResponse<PoolOverviewWidgetSnapshot>>> {
  return fetchWithTimeout<WidgetSnapshotResponse<PoolOverviewWidgetSnapshot>>(
    `${BASE_URL}/widget/pool`,
    { retries: 1, ...options }
  );
}

export async function getUserWidgetSnapshot(
  btcAddress: string,
  options: FetchOptions & Pick<RequestInit, 'signal'> = {}
): Promise<ApiResult<WidgetSnapshotResponse<PersonalMiningWidgetSnapshot>>> {
  return fetchWithTimeout<WidgetSnapshotResponse<PersonalMiningWidgetSnapshot>>(
    `${BASE_URL}/widget/user/${encodeURIComponent(btcAddress)}`,
    { retries: 1, ...options }
  );
}
