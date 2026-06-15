import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import {
  registerWidgetRefreshTasks,
  unregisterWidgetRefreshTasks,
} from '@/widgets/backgroundTask';
import { updateWidgetsFromStores } from '@/widgets/updater';
import { useMinerStore } from '@/store/minerStore';
import { usePoolStore } from '@/store/poolStore';
import {
  selectBitcoinAddress,
  selectIsHydrated,
  selectWidgetUpdatesEnabled,
  useSettingsStore,
} from '@/store/settingsStore';
import { useUserStore } from '@/store/userStore';

export function useWidgetUpdates() {
  const isHydrated = useSettingsStore(selectIsHydrated);
  const bitcoinAddress = useSettingsStore(selectBitcoinAddress);
  const widgetUpdatesEnabled = useSettingsStore(selectWidgetUpdatesEnabled);
  const poolTimestamp = usePoolStore((state) => state.stats?.timestamp);
  const userTimestamp = useUserStore((state) => state.stats?.timestamp);

  useEffect(() => {
    if (!isHydrated || Platform.OS !== 'ios') return;
    updateWidgetsFromStores();
  }, [isHydrated, bitcoinAddress, poolTimestamp, userTimestamp]);

  useEffect(() => {
    if (!isHydrated || Platform.OS !== 'ios') return;

    if (widgetUpdatesEnabled) {
      registerWidgetRefreshTasks().catch((error) => {
        console.warn('[Widgets] Failed to register refresh tasks:', error);
      });
    } else {
      unregisterWidgetRefreshTasks().catch((error) => {
        console.warn('[Widgets] Failed to unregister refresh tasks:', error);
      });
    }
  }, [isHydrated, widgetUpdatesEnabled]);

  // When the app leaves the foreground: push the latest in-memory stats into the
  // widget so it reflects last-seen data even if iOS never runs a background refresh,
  // and abort any in-flight discovery scan. The scan's many TCP connects to Avalon
  // miners would otherwise fire their native `connect` callback on resume — the source
  // of the nil-host crash patched in react-native-tcp-socket.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') return;
      useMinerStore.getState().stopDiscovery();
      if (isHydrated) {
        updateWidgetsFromStores();
      }
    });

    return () => subscription.remove();
  }, [isHydrated]);
}
