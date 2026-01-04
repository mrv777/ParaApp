/**
 * Push notification backend API client
 */

import Constants from 'expo-constants';
import { postJson, fetchWithTimeout } from './client';
import type { ApiResult } from '@/types';
import type { NotificationPrefs } from '@/store/settingsStore';

const BASE_URL =
  Constants.expoConfig?.extra?.pushApiUrl ??
  'https://paraapp-notifications.7fmqnkfyfq.workers.dev';

interface RegisterRequest {
  pushToken: string;
  btcAddress: string;
  preferences?: NotificationPrefs;
}

interface RegisterResponse {
  success: boolean;
}

interface PreferencesResponse {
  success: boolean;
  preferences: {
    blocks: boolean;
    workers: boolean;
    bestDiff: boolean;
  };
}

/**
 * Register device for push notifications
 */
export async function registerDevice(
  pushToken: string,
  btcAddress: string,
  preferences?: NotificationPrefs
): Promise<ApiResult<RegisterResponse>> {
  const body: RegisterRequest = { pushToken, btcAddress };
  if (preferences) {
    body.preferences = preferences;
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
  btcAddress: string,
  preferences: NotificationPrefs
): Promise<ApiResult<{ success: boolean }>> {
  return fetchWithTimeout<{ success: boolean }>(`${BASE_URL}/preferences`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ btcAddress, ...preferences }),
  });
}

/**
 * Get notification preferences for an address
 */
export async function getPreferences(
  btcAddress: string
): Promise<ApiResult<PreferencesResponse>> {
  return fetchWithTimeout<PreferencesResponse>(
    `${BASE_URL}/preferences/${encodeURIComponent(btcAddress)}`
  );
}
