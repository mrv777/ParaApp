/**
 * Push notifications lifecycle hook
 * Handles registration, foreground notifications, and re-registration on address change
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import Toast from 'react-native-toast-message';

import {
  useSettingsStore,
  selectIsHydrated,
  selectBitcoinAddress,
  selectNotificationsEnabled,
  selectNotificationPrefs,
  selectPushToken,
} from '@/store/settingsStore';
import {
  requestPermissions,
  getExpoPushToken,
  canReceivePushNotifications,
} from '@/utils/notifications';
import { registerDevice, unregisterDevice, updatePreferences } from '@/api/push';

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false, // Don't show system notification in foreground
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

export function useNotifications() {
  const isHydrated = useSettingsStore(selectIsHydrated);
  const bitcoinAddress = useSettingsStore(selectBitcoinAddress);
  const notificationsEnabled = useSettingsStore(selectNotificationsEnabled);
  const notificationPrefs = useSettingsStore(selectNotificationPrefs);
  const pushToken = useSettingsStore(selectPushToken);

  const setPushToken = useSettingsStore((s) => s.setPushToken);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const setNotificationPrefs = useSettingsStore((s) => s.setNotificationPrefs);

  // Track previous address for re-registration
  const prevAddressRef = useRef<string | null>(null);
  const isRegistering = useRef(false);
  const prefsSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRefreshAttempted = useRef(false);
  const justFetchedPrefs = useRef(false);

  /**
   * Register device with backend
   */
  const register = useCallback(async () => {
    if (!bitcoinAddress || isRegistering.current) {
      return;
    }

    isRegistering.current = true;

    try {
      // Request permissions if not already granted
      const status = await requestPermissions();
      if (status !== 'granted') {
        setNotificationsEnabled(false);
        isRegistering.current = false;
        return;
      }

      // Get push token
      let token = pushToken;
      if (!token) {
        token = await getExpoPushToken();
        if (!token) {
          console.warn('[Notifications] Failed to get push token');
          isRegistering.current = false;
          return;
        }
        setPushToken(token);
      }

      // Register with backend - returns existing preferences for cross-device sync
      const result = await registerDevice(token, bitcoinAddress, notificationPrefs);

      // Sync preferences from backend if they exist (cross-device sync)
      if (result.success && result.data?.preferences) {
        const fetchedPrefs = {
          blocks: result.data.preferences.blocks,
          workers: result.data.preferences.workers,
          bestDiff: result.data.preferences.bestDiff,
        };
        setNotificationPrefs(fetchedPrefs);
        justFetchedPrefs.current = true;
      }

      if (!result.success) {
        console.warn('[Notifications] Failed to register:', result.error);

        // If registration failed and we haven't tried refreshing the token yet,
        // the token might be stale (e.g., after app reinstall)
        if (!tokenRefreshAttempted.current) {
          tokenRefreshAttempted.current = true;
          console.log('[Notifications] Attempting token refresh...');

          // Clear stored token and get a fresh one
          setPushToken(null);
          const freshToken = await getExpoPushToken();

          if (freshToken && freshToken !== token) {
            console.log('[Notifications] Got fresh token, retrying registration');
            setPushToken(freshToken);

            // Retry registration with fresh token
            const retryResult = await registerDevice(freshToken, bitcoinAddress, notificationPrefs);
            if (retryResult.success) {
              console.log('[Notifications] Registration succeeded with fresh token');
              tokenRefreshAttempted.current = false; // Reset for next time
              // Sync preferences from backend if they exist
              if (retryResult.data?.preferences) {
                setNotificationPrefs({
                  blocks: retryResult.data.preferences.blocks,
                  workers: retryResult.data.preferences.workers,
                  bestDiff: retryResult.data.preferences.bestDiff,
                });
                justFetchedPrefs.current = true;
              }
            } else {
              console.warn('[Notifications] Registration failed even with fresh token');
            }
          }
        }
      } else {
        // Success - reset refresh flag for future
        tokenRefreshAttempted.current = false;
      }
    } catch (error) {
      console.error('[Notifications] Registration error:', error);
    } finally {
      isRegistering.current = false;
    }
  }, [bitcoinAddress, pushToken, notificationPrefs, setPushToken, setNotificationsEnabled, setNotificationPrefs]);

  /**
   * Unregister device from backend
   */
  const unregister = useCallback(async () => {
    if (!pushToken) return;

    try {
      await unregisterDevice(pushToken);
    } catch (error) {
      console.error('Notification unregistration error:', error);
    }
  }, [pushToken]);

  // Initialize on mount (after hydration + address set)
  useEffect(() => {
    if (!isHydrated || !bitcoinAddress || !notificationsEnabled) {
      return;
    }

    if (!canReceivePushNotifications()) {
      return;
    }

    register();
  }, [isHydrated, bitcoinAddress, notificationsEnabled, register]);

  // Re-register when address changes
  useEffect(() => {
    if (!isHydrated || !notificationsEnabled) return;

    const prevAddress = prevAddressRef.current;
    prevAddressRef.current = bitcoinAddress;

    // Skip initial render
    if (prevAddress === null && bitcoinAddress === null) return;
    if (prevAddress === bitcoinAddress) return;

    // Address changed
    if (!bitcoinAddress) {
      // Address removed - unregister
      unregister();
    } else if (prevAddress !== null) {
      // New address set - re-register
      register();
    }
  }, [isHydrated, bitcoinAddress, notificationsEnabled, register, unregister]);

  // Sync preferences to backend when they change (debounced)
  useEffect(() => {
    if (!isHydrated || !notificationsEnabled || !bitcoinAddress || !pushToken) return;

    // Skip sync if preferences were just fetched from backend
    if (justFetchedPrefs.current) {
      justFetchedPrefs.current = false;
      return;
    }

    // Clear any pending sync
    if (prefsSyncTimeoutRef.current) {
      clearTimeout(prefsSyncTimeoutRef.current);
    }

    // Debounce preference syncs to avoid rapid API calls
    prefsSyncTimeoutRef.current = setTimeout(() => {
      updatePreferences(pushToken, bitcoinAddress, notificationPrefs).catch((error) => {
        console.warn('Failed to sync notification preferences:', error);
      });
    }, 500);

    return () => {
      if (prefsSyncTimeoutRef.current) {
        clearTimeout(prefsSyncTimeoutRef.current);
      }
    };
  }, [isHydrated, notificationsEnabled, bitcoinAddress, pushToken, notificationPrefs]);

  // Sync preferences immediately when app goes to background
  // Ensures preferences are saved even if debounce timeout hasn't fired yet
  useEffect(() => {
    if (!isHydrated || !notificationsEnabled || !bitcoinAddress || !pushToken) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' && prefsSyncTimeoutRef.current) {
        // Clear pending debounced sync and sync immediately
        clearTimeout(prefsSyncTimeoutRef.current);
        prefsSyncTimeoutRef.current = null;
        updatePreferences(pushToken, bitcoinAddress, notificationPrefs).catch((error) => {
          console.warn('Failed to sync preferences on background:', error);
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isHydrated, notificationsEnabled, bitcoinAddress, pushToken, notificationPrefs]);

  // Handle foreground notifications
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body } = notification.request.content;

      Toast.show({
        type: 'info',
        text1: title ?? 'Notification',
        text2: body ?? undefined,
        visibilityTime: 4000,
      });
    });

    return () => subscription.remove();
  }, []);
}
