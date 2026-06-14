import { Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { refreshWidgetsFromBackend } from './updater';

export const WIDGET_BACKGROUND_TASK = 'paraapp-widget-background-refresh';
export const WIDGET_NOTIFICATION_TASK = 'paraapp-widget-silent-refresh';

TaskManager.defineTask(WIDGET_BACKGROUND_TASK, async () => {
  try {
    const updated = await refreshWidgetsFromBackend();
    return updated
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  } catch (error) {
    console.warn('[Widgets] Background refresh failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

TaskManager.defineTask(WIDGET_NOTIFICATION_TASK, async () => {
  try {
    await refreshWidgetsFromBackend();
  } catch (error) {
    console.warn('[Widgets] Silent push refresh failed:', error);
  }
});

export async function registerWidgetRefreshTasks(): Promise<void> {
  if (Platform.OS !== 'ios') return;

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
  if (Platform.OS !== 'ios') return;

  const isBackgroundTaskRegistered = await TaskManager.isTaskRegisteredAsync(
    WIDGET_BACKGROUND_TASK
  );
  if (isBackgroundTaskRegistered) {
    await BackgroundTask.unregisterTaskAsync(WIDGET_BACKGROUND_TASK);
  }

  const isNotificationTaskRegistered = await TaskManager.isTaskRegisteredAsync(
    WIDGET_NOTIFICATION_TASK
  );
  if (isNotificationTaskRegistered) {
    await Notifications.unregisterTaskAsync(WIDGET_NOTIFICATION_TASK);
  }
}
