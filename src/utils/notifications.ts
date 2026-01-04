/**
 * Push notification utilities
 */

import { Platform, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Request notification permissions
 * Returns the permission status
 */
export async function requestPermissions(): Promise<PermissionStatus> {
  // Physical device required for push notifications
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return 'denied';
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === 'granted') {
    return 'granted';
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status as PermissionStatus;
}

/**
 * Get current permission status without prompting
 */
export async function getPermissionStatus(): Promise<PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status as PermissionStatus;
}

/**
 * Get Expo push token for this device
 * Returns null if unable to get token
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    // Physical device required
    if (!Device.isDevice) {
      console.warn('Push notifications require a physical device');
      return null;
    }

    // Get project ID from expo config
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.error('No EAS project ID found in app config');
      return null;
    }

    // Android requires notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#ededed',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

/**
 * Open system settings for notification permissions
 */
export function openNotificationSettings(): void {
  if (Platform.OS === 'ios') {
    Linking.openURL('app-settings:');
  } else {
    Linking.openSettings();
  }
}

/**
 * Check if device can receive push notifications
 */
export function canReceivePushNotifications(): boolean {
  return Device.isDevice;
}
