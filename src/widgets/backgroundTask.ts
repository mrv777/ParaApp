import { Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { isWidgetRefreshNotification } from './notificationPayload';
import { cancelWidgetRefresh, refreshWidgetsFromBackend } from './updater';

export const WIDGET_BACKGROUND_TASK = 'paraapp-widget-background-refresh';
export const WIDGET_NOTIFICATION_TASK = 'paraapp-widget-silent-refresh';

TaskManager.defineTask(WIDGET_BACKGROUND_TASK, async () => {
  // Android widgets have their own placed-widget-only WorkManager path. Older
  // releases may still have this Expo task persisted; make those wakeups a
  // harmless no-op until the next foreground launch unregisters them.
  if (Platform.OS !== 'ios') return BackgroundTask.BackgroundTaskResult.Success;

  try {
    await refreshWidgetsFromBackend();
    // "No new snapshot" is a successful run, not a scheduler failure.
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.warn('[Widgets] Background refresh failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  WIDGET_NOTIFICATION_TASK,
  async ({ data, error }) => {
    // Android refreshes placed widgets through react-native-android-widget's
    // WIDGET_UPDATE worker. Also ignore visible notifications and action taps;
    // expo-notifications invokes this task for those too while the app is alive.
    if (
      Platform.OS !== 'ios' ||
      error ||
      !isWidgetRefreshNotification(data)
    ) {
      return Notifications.BackgroundNotificationTaskResult.NoData;
    }

    try {
      const updated = await refreshWidgetsFromBackend();
      return updated
        ? Notifications.BackgroundNotificationTaskResult.NewData
        : Notifications.BackgroundNotificationTaskResult.NoData;
    } catch (taskError) {
      console.warn('[Widgets] Silent push refresh failed:', taskError);
      return Notifications.BackgroundNotificationTaskResult.Failed;
    }
  }
);

if (Platform.OS === 'ios') {
  BackgroundTask.addExpirationListener(cancelWidgetRefresh);
}

function isWidgetPlatform(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function registerWidgetRefreshTasks(): Promise<void> {
  if (!isWidgetPlatform()) return;

  if (Platform.OS === 'android') {
    // A previous release registered both Expo workers on Android. Registrations
    // persist across upgrades, so explicitly remove them when the app next opens.
    await unregisterWidgetRefreshTasks();
    return;
  }

  await BackgroundTask.registerTaskAsync(WIDGET_BACKGROUND_TASK, {
    minimumInterval: 30,
  });

  const isNotificationTaskRegistered = await TaskManager.isTaskRegisteredAsync(
    WIDGET_NOTIFICATION_TASK
  );
  if (!isNotificationTaskRegistered) {
    await Notifications.registerTaskAsync(WIDGET_NOTIFICATION_TASK);
  }
}

export async function unregisterWidgetRefreshTasks(): Promise<void> {
  if (!isWidgetPlatform()) return;

  // Attempt both cleanups even if the first native module call fails.
  let cleanupError: unknown;
  try {
    const isBackgroundTaskRegistered = await TaskManager.isTaskRegisteredAsync(
      WIDGET_BACKGROUND_TASK
    );
    if (isBackgroundTaskRegistered) {
      await BackgroundTask.unregisterTaskAsync(WIDGET_BACKGROUND_TASK);
    }
  } catch (error) {
    cleanupError = error;
  }

  try {
    const isNotificationTaskRegistered = await TaskManager.isTaskRegisteredAsync(
      WIDGET_NOTIFICATION_TASK
    );
    if (isNotificationTaskRegistered) {
      await Notifications.unregisterTaskAsync(WIDGET_NOTIFICATION_TASK);
    }
  } catch (error) {
    cleanupError ??= error;
  }

  if (cleanupError) throw cleanupError;
}
