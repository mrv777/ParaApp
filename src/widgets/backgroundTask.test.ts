import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: 'android',
  tasks: new Map<string, (body: any) => unknown>(),
  backgroundRegister: vi.fn(),
  backgroundUnregister: vi.fn(),
  expirationListener: vi.fn(),
  notificationRegister: vi.fn(),
  notificationUnregister: vi.fn(),
  isTaskRegistered: vi.fn(),
  refreshWidgets: vi.fn(),
  cancelWidgetRefresh: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.platform;
    },
  },
}));

vi.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: mocks.backgroundRegister,
  unregisterTaskAsync: mocks.backgroundUnregister,
  addExpirationListener: mocks.expirationListener,
}));

vi.mock('expo-notifications', () => ({
  BackgroundNotificationTaskResult: { NewData: 0, NoData: 1, Failed: 2 },
  registerTaskAsync: mocks.notificationRegister,
  unregisterTaskAsync: mocks.notificationUnregister,
}));

vi.mock('expo-task-manager', () => ({
  defineTask: (name: string, executor: (body: any) => unknown) => {
    mocks.tasks.set(name, executor);
  },
  isTaskRegisteredAsync: mocks.isTaskRegistered,
}));

vi.mock('./updater', () => ({
  cancelWidgetRefresh: mocks.cancelWidgetRefresh,
  refreshWidgetsFromBackend: mocks.refreshWidgets,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.tasks.clear();
  mocks.platform = 'android';
  mocks.isTaskRegistered.mockResolvedValue(true);
  mocks.refreshWidgets.mockResolvedValue(true);
});

describe('widget background task registration', () => {
  it('removes legacy Expo workers on Android without registering replacements', async () => {
    const { registerWidgetRefreshTasks, WIDGET_BACKGROUND_TASK, WIDGET_NOTIFICATION_TASK } =
      await import('./backgroundTask');

    await registerWidgetRefreshTasks();

    expect(mocks.backgroundUnregister).toHaveBeenCalledWith(WIDGET_BACKGROUND_TASK);
    expect(mocks.notificationUnregister).toHaveBeenCalledWith(WIDGET_NOTIFICATION_TASK);
    expect(mocks.backgroundRegister).not.toHaveBeenCalled();
    expect(mocks.notificationRegister).not.toHaveBeenCalled();
  });

  it('makes persisted Android task wakeups immediate no-ops before cleanup', async () => {
    const { WIDGET_BACKGROUND_TASK, WIDGET_NOTIFICATION_TASK } =
      await import('./backgroundTask');

    const scheduledResult = await mocks.tasks.get(WIDGET_BACKGROUND_TASK)?.({});
    const notificationResult = await mocks.tasks.get(WIDGET_NOTIFICATION_TASK)?.({
      data: {
        notification: null,
        data: { dataString: JSON.stringify({ type: 'widget_refresh' }) },
      },
      error: null,
    });

    expect(scheduledResult).toBe(1); // BackgroundTaskResult.Success
    expect(notificationResult).toBe(1); // BackgroundNotificationTaskResult.NoData
    expect(mocks.refreshWidgets).not.toHaveBeenCalled();
  });

  it('retains scheduled and silent widget refresh fallbacks on iOS', async () => {
    mocks.platform = 'ios';
    mocks.isTaskRegistered.mockResolvedValue(false);
    const { registerWidgetRefreshTasks, WIDGET_BACKGROUND_TASK, WIDGET_NOTIFICATION_TASK } =
      await import('./backgroundTask');

    await registerWidgetRefreshTasks();

    expect(mocks.backgroundRegister).toHaveBeenCalledWith(WIDGET_BACKGROUND_TASK, {
      minimumInterval: 30,
    });
    expect(mocks.notificationRegister).toHaveBeenCalledWith(WIDGET_NOTIFICATION_TASK);
    expect(mocks.expirationListener).toHaveBeenCalledWith(
      mocks.cancelWidgetRefresh
    );
  });

  it('still removes the notification task if background-task cleanup fails', async () => {
    mocks.backgroundUnregister.mockRejectedValueOnce(new Error('background cleanup'));
    const { registerWidgetRefreshTasks, WIDGET_NOTIFICATION_TASK } =
      await import('./backgroundTask');

    await expect(registerWidgetRefreshTasks()).rejects.toThrow('background cleanup');
    expect(mocks.notificationUnregister).toHaveBeenCalledWith(WIDGET_NOTIFICATION_TASK);
  });

  it('does no widget work for visible notifications', async () => {
    mocks.platform = 'ios';
    const { WIDGET_NOTIFICATION_TASK } = await import('./backgroundTask');
    const executor = mocks.tasks.get(WIDGET_NOTIFICATION_TASK);

    const result = await executor?.({
      data: {
        notification: { title: 'Worker offline' },
        data: { dataString: JSON.stringify({ type: 'worker_status' }) },
      },
      error: null,
    });

    expect(result).toBe(1); // BackgroundNotificationTaskResult.NoData
    expect(mocks.refreshWidgets).not.toHaveBeenCalled();
  });

  it('refreshes widgets only for a silent widget_refresh notification', async () => {
    mocks.platform = 'ios';
    const { WIDGET_NOTIFICATION_TASK } = await import('./backgroundTask');
    const executor = mocks.tasks.get(WIDGET_NOTIFICATION_TASK);

    const result = await executor?.({
      data: {
        notification: null,
        data: { dataString: JSON.stringify({ type: 'widget_refresh' }) },
      },
      error: null,
    });

    expect(result).toBe(0); // BackgroundNotificationTaskResult.NewData
    expect(mocks.refreshWidgets).toHaveBeenCalledTimes(1);
  });
});
