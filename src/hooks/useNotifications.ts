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
  selectWidgetUpdatesEnabled,
  type NotificationPrefs,
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
  const widgetUpdatesEnabled = useSettingsStore(selectWidgetUpdatesEnabled);

  const setPushToken = useSettingsStore((s) => s.setPushToken);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const setNotificationPrefs = useSettingsStore((s) => s.setNotificationPrefs);

  // Track previous address for re-registration
  const prevAddressRef = useRef<string | null>(null);
  const prevNotificationsEnabledRef = useRef(notificationsEnabled);
  const prevWidgetUpdatesEnabledRef = useRef(widgetUpdatesEnabled);
  const isRegistering = useRef(false);
  const prefsSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRefreshAttempted = useRef(false);
  const justFetchedPrefs = useRef(false);
  const pendingRegistrationRef = useRef(false);
  const registerRef = useRef<() => void>(() => {});

  const applyFetchedPrefs = useCallback(
    (targetAddress: string, prefs: NotificationPrefs) => {
      const current = useSettingsStore.getState();
      if (current.bitcoinAddress !== targetAddress) return;
      setNotificationPrefs(prefs);
      justFetchedPrefs.current = true;
    },
    [setNotificationPrefs]
  );

  /**
   * Register the latest desired backend state. This reads from the store at
   * execution time so a rerun after an in-flight registration uses fresh address
   * and toggle values rather than the closure that started the old request.
   */
  const performRegistration = useCallback(async () => {
    const initial = useSettingsStore.getState();
    const targetAddress = initial.bitcoinAddress;

    if (
      !targetAddress ||
      (!initial.notificationsEnabled && !initial.widgetUpdatesEnabled) ||
      !canReceivePushNotifications()
    ) {
      return;
    }

    isRegistering.current = true;
    let attemptedToken: string | null = null;

    try {
      // Request permissions if not already granted. Widget updates can still
      // use background refresh if permission is denied, but silent pushes need a token.
      const status = await requestPermissions();
      const afterPermission = useSettingsStore.getState();

      if (
        afterPermission.bitcoinAddress !== targetAddress ||
        (!afterPermission.notificationsEnabled && !afterPermission.widgetUpdatesEnabled)
      ) {
        pendingRegistrationRef.current = true;
        return;
      }

      if (status !== 'granted') {
        if (afterPermission.notificationsEnabled) {
          setNotificationsEnabled(false);
        }
        return;
      }

      // Get push token
      let token = afterPermission.pushToken;
      if (!token) {
        token = await getExpoPushToken();
        if (!token) {
          console.warn('[Notifications] Failed to get push token');
          return;
        }
        setPushToken(token);
      }
      attemptedToken = token;

      const beforeRegister = useSettingsStore.getState();
      if (
        beforeRegister.bitcoinAddress !== targetAddress ||
        (!beforeRegister.notificationsEnabled && !beforeRegister.widgetUpdatesEnabled)
      ) {
        pendingRegistrationRef.current = true;
        return;
      }

      // Register with backend - returns existing preferences for cross-device sync
      // Read prefs from store directly to avoid dependency cycle
      const currentPrefs = beforeRegister.notificationPrefs;
      const result = await registerDevice(
        token,
        targetAddress,
        currentPrefs,
        beforeRegister.widgetUpdatesEnabled,
        beforeRegister.notificationsEnabled
      );

      // Sync preferences from backend if they exist (cross-device sync)
      if (result.success && result.data?.preferences) {
        applyFetchedPrefs(targetAddress, {
          blocks: result.data.preferences.blocks,
          workers: result.data.preferences.workers,
          bestDiff: result.data.preferences.bestDiff,
        });
      }

      if (!result.success) {
        console.warn('[Notifications] Failed to register:', result.error);

        // If registration failed and we haven't tried refreshing the token yet,
        // the token might be stale (e.g., after app reinstall)
        if (
          useSettingsStore.getState().bitcoinAddress === targetAddress &&
          !tokenRefreshAttempted.current
        ) {
          tokenRefreshAttempted.current = true;
          console.log('[Notifications] Attempting token refresh...');

          // Clear stored token and get a fresh one
          setPushToken(null);
          const freshToken = await getExpoPushToken();

          if (freshToken && freshToken !== token) {
            console.log('[Notifications] Got fresh token, retrying registration');
            setPushToken(freshToken);
            attemptedToken = freshToken;

            const beforeRetry = useSettingsStore.getState();
            if (
              beforeRetry.bitcoinAddress !== targetAddress ||
              (!beforeRetry.notificationsEnabled && !beforeRetry.widgetUpdatesEnabled)
            ) {
              pendingRegistrationRef.current = true;
              return;
            }

            // Retry registration with fresh token - use store prefs to avoid stale closure
            const retryPrefs = beforeRetry.notificationPrefs;
            const retryResult = await registerDevice(
              freshToken,
              targetAddress,
              retryPrefs,
              beforeRetry.widgetUpdatesEnabled,
              beforeRetry.notificationsEnabled
            );
            if (retryResult.success) {
              console.log('[Notifications] Registration succeeded with fresh token');
              tokenRefreshAttempted.current = false; // Reset for next time
              // Sync preferences from backend if they exist
              if (retryResult.data?.preferences) {
                applyFetchedPrefs(targetAddress, {
                  blocks: retryResult.data.preferences.blocks,
                  workers: retryResult.data.preferences.workers,
                  bestDiff: retryResult.data.preferences.bestDiff,
                });
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
      const current = useSettingsStore.getState();
      if (
        attemptedToken &&
        (!current.bitcoinAddress || current.bitcoinAddress !== targetAddress)
      ) {
        try {
          await unregisterDevice(attemptedToken);
        } catch (error) {
          console.error('Notification unregistration error:', error);
        }
      } else if (
        attemptedToken &&
        current.bitcoinAddress === targetAddress &&
        !current.notificationsEnabled &&
        !current.widgetUpdatesEnabled
      ) {
        updatePreferences(
          attemptedToken,
          targetAddress,
          current.notificationPrefs,
          false,
          false
        ).catch((error) => {
          console.warn('Failed to sync disabled push preferences:', error);
        });
      }

      isRegistering.current = false;

      if (pendingRegistrationRef.current) {
        pendingRegistrationRef.current = false;
        registerRef.current();
      }
    }
  }, [
    applyFetchedPrefs,
    setNotificationsEnabled,
    setPushToken,
  ]);

  /**
   * Register device with backend
   */
  const register = useCallback(() => {
    if (isRegistering.current) {
      pendingRegistrationRef.current = true;
      return;
    }
    void performRegistration();
  }, [
    performRegistration,
  ]);

  useEffect(() => {
    registerRef.current = register;
  }, [register]);

  /**
   * Unregister device from backend
   */
  const unregister = useCallback(async (tokenOverride?: string | null) => {
    const token = tokenOverride ?? useSettingsStore.getState().pushToken;
    if (!token) return;

    try {
      await unregisterDevice(token);
    } catch (error) {
      console.error('Notification unregistration error:', error);
    }
  }, []);

  // Initialize on mount (after hydration + address set)
  useEffect(() => {
    if (!isHydrated || !bitcoinAddress || (!notificationsEnabled && !widgetUpdatesEnabled)) {
      return;
    }

    if (!canReceivePushNotifications()) {
      return;
    }

    register();
  }, [isHydrated, bitcoinAddress, notificationsEnabled, widgetUpdatesEnabled, register]);

  // Re-register when address changes
  useEffect(() => {
    if (!isHydrated) return;

    const prevAddress = prevAddressRef.current;
    prevAddressRef.current = bitcoinAddress;

    // Skip initial render
    if (prevAddress === null && bitcoinAddress === null) return;
    if (prevAddress === bitcoinAddress) return;

    // Address changed
    if (!bitcoinAddress) {
      // Address removed - unregister
      pendingRegistrationRef.current = true;
      unregister();
    } else if (
      prevAddress !== null &&
      (notificationsEnabled || widgetUpdatesEnabled)
    ) {
      // New address set - re-register
      void (async () => {
        await unregister();
        register();
      })();
    }
  }, [
    isHydrated,
    bitcoinAddress,
    notificationsEnabled,
    widgetUpdatesEnabled,
    register,
    unregister,
  ]);

  // Sync preferences to backend when they change (debounced)
  useEffect(() => {
    if (
      !isHydrated ||
      (!notificationsEnabled && !widgetUpdatesEnabled) ||
      !bitcoinAddress ||
      !pushToken
    ) return;

    // Skip sync while a device registration is in flight. registerDevice sets
    // the push token mid-flight, which retriggers this effect (pushToken dep)
    // before the backend prefs have been fetched — syncing local defaults now
    // would clobber account-wide prefs (the same class of bug e0921b2 fixed on
    // /register, re-entering via the /preferences PATCH). Don't consume the
    // flag; registration clears it in its finally block.
    if (isRegistering.current) {
      pendingRegistrationRef.current = true;
      return;
    }

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
      updatePreferences(
        pushToken,
        bitcoinAddress,
        notificationPrefs,
        widgetUpdatesEnabled,
        notificationsEnabled
      ).catch((error) => {
        console.warn('Failed to sync notification preferences:', error);
      });
      // Clear the ref once fired so the background-flush gate
      // (handleAppStateChange) doesn't treat this expired timer as a pending
      // sync and re-assert prefs on the next backgrounding.
      prefsSyncTimeoutRef.current = null;
    }, 500);

    return () => {
      if (prefsSyncTimeoutRef.current) {
        clearTimeout(prefsSyncTimeoutRef.current);
        prefsSyncTimeoutRef.current = null;
      }
    };
  }, [
    isHydrated,
    notificationsEnabled,
    widgetUpdatesEnabled,
    bitcoinAddress,
    pushToken,
    notificationPrefs,
  ]);

  // Sync preferences immediately when app goes to background
  // Ensures preferences are saved even if debounce timeout hasn't fired yet
  useEffect(() => {
    if (
      !isHydrated ||
      (!notificationsEnabled && !widgetUpdatesEnabled) ||
      !bitcoinAddress ||
      !pushToken
    ) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' && prefsSyncTimeoutRef.current) {
        // Clear pending debounced sync and sync immediately
        clearTimeout(prefsSyncTimeoutRef.current);
        prefsSyncTimeoutRef.current = null;
        updatePreferences(
          pushToken,
          bitcoinAddress,
          notificationPrefs,
          widgetUpdatesEnabled,
          notificationsEnabled
        ).catch((error) => {
          console.warn('Failed to sync preferences on background:', error);
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [
    isHydrated,
    notificationsEnabled,
    widgetUpdatesEnabled,
    bitcoinAddress,
    pushToken,
    notificationPrefs,
  ]);

  // When both visible notifications AND widget updates are off, the normal
  // debounced sync bails (there's nothing to keep the subscription alive for),
  // so it never tells the backend the flags went false. Whichever toggle was
  // flipped last to reach the all-off state, push both flags = false once so the
  // cron stops sending visible pushes (gated on notifications_enabled) and silent
  // widget refreshes (gated on widget_updates_enabled). Covers both orderings.
  useEffect(() => {
    const wasNotificationsEnabled = prevNotificationsEnabledRef.current;
    const wasWidgetUpdatesEnabled = prevWidgetUpdatesEnabledRef.current;
    prevNotificationsEnabledRef.current = notificationsEnabled;
    prevWidgetUpdatesEnabledRef.current = widgetUpdatesEnabled;

    if (
      !isHydrated ||
      notificationsEnabled ||
      widgetUpdatesEnabled ||
      !bitcoinAddress ||
      !pushToken
    ) {
      return;
    }

    // Only act on the transition INTO the all-off state (one flag was on last
    // render); avoids re-sending on unrelated re-renders while already all-off.
    if (!wasNotificationsEnabled && !wasWidgetUpdatesEnabled) return;

    updatePreferences(
      pushToken,
      bitcoinAddress,
      notificationPrefs,
      false,
      false
    ).catch((error) => {
      console.warn('Failed to sync disabled push preferences:', error);
    });
  }, [
    isHydrated,
    notificationsEnabled,
    widgetUpdatesEnabled,
    bitcoinAddress,
    pushToken,
    notificationPrefs,
  ]);

  // Handle foreground notifications
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body } = notification.request.content;
      if (!title && !body) return;

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
