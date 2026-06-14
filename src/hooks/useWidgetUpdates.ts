import { useEffect } from 'react';
import { Platform } from 'react-native';

import {
  registerWidgetRefreshTasks,
  unregisterWidgetRefreshTasks,
} from '@/widgets/backgroundTask';
import { updateWidgetsFromStores } from '@/widgets/updater';
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
}
