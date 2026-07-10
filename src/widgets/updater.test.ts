import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: 'ios',
  settings: {
    widgetUpdatesEnabled: true,
    bitcoinAddress: 'bc1qtest',
  },
  poolFetch: vi.fn(),
  userFetch: vi.fn(),
  hydrate: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.platform;
    },
  },
}));

vi.mock('@/api', () => ({
  isSuccess: (result: { success: boolean }) => result.success,
}));

vi.mock('@/api/push', () => ({
  getPoolWidgetSnapshot: mocks.poolFetch,
  getUserWidgetSnapshot: mocks.userFetch,
}));

vi.mock('@/store/settingsStore', () => ({
  awaitSettingsHydration: mocks.hydrate,
  useSettingsStore: {
    getState: () => mocks.settings,
    persist: { hasHydrated: () => true },
  },
}));

vi.mock('@/store/poolStore', () => ({
  usePoolStore: { getState: () => ({ stats: null }) },
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: { getState: () => ({ stats: null, statsAddress: null }) },
}));

const failedResult = {
  success: false as const,
  error: { message: 'offline' },
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useRealTimers();
  mocks.platform = 'ios';
  mocks.settings.widgetUpdatesEnabled = true;
  mocks.settings.bitcoinAddress = 'bc1qtest';
  mocks.hydrate.mockResolvedValue(undefined);
});

describe('background widget updater', () => {
  it('starts pool and personal requests in parallel with bounded no-retry options', async () => {
    let resolvePool!: (value: typeof failedResult) => void;
    let resolveUser!: (value: typeof failedResult) => void;
    mocks.poolFetch.mockReturnValue(
      new Promise((resolve) => {
        resolvePool = resolve;
      })
    );
    mocks.userFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveUser = resolve;
      })
    );
    const { fetchServerWidgetSnapshots } = await import('./updater');

    const pending = fetchServerWidgetSnapshots();
    await vi.waitFor(() => {
      expect(mocks.poolFetch).toHaveBeenCalledTimes(1);
      expect(mocks.userFetch).toHaveBeenCalledTimes(1);
    });

    expect(mocks.poolFetch.mock.calls[0][0]).toMatchObject({
      timeout: 6000,
      retries: 0,
    });
    expect(mocks.userFetch.mock.calls[0][1]).toMatchObject({
      timeout: 6000,
      retries: 0,
    });
    resolvePool(failedResult);
    resolveUser(failedResult);
    await expect(pending).resolves.toEqual({});
  });

  it('shares one in-flight refresh across concurrent task triggers', async () => {
    let resolvePool!: (value: typeof failedResult) => void;
    let resolveUser!: (value: typeof failedResult) => void;
    mocks.poolFetch.mockReturnValue(
      new Promise((resolve) => {
        resolvePool = resolve;
      })
    );
    mocks.userFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveUser = resolve;
      })
    );
    const { refreshWidgetsFromBackend } = await import('./updater');

    const first = refreshWidgetsFromBackend();
    const second = refreshWidgetsFromBackend();
    expect(second).toBe(first);

    await vi.waitFor(() => expect(mocks.userFetch).toHaveBeenCalledTimes(1));
    resolvePool(failedResult);
    resolveUser(failedResult);
    await expect(first).resolves.toBe(false);
    expect(mocks.poolFetch).toHaveBeenCalledTimes(1);
  });

  it('aborts refresh requests at the 15-second task deadline', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const pendingUntilAbort = (options: { signal: AbortSignal }) => {
      signals.push(options.signal);
      return new Promise<typeof failedResult>((resolve) => {
        options.signal.addEventListener('abort', () => resolve(failedResult), {
          once: true,
        });
      });
    };
    mocks.poolFetch.mockImplementation(pendingUntilAbort);
    mocks.userFetch.mockImplementation(
      (_address: string, options: { signal: AbortSignal }) =>
        pendingUntilAbort(options)
    );
    const { refreshWidgetsFromBackend } = await import('./updater');

    const pending = refreshWidgetsFromBackend();
    await vi.advanceTimersByTimeAsync(15000);

    await expect(pending).resolves.toBe(false);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
