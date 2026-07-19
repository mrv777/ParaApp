import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getUserDifficultyHits: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

vi.mock('@/api', () => ({
  parasite: {
    getUserDifficultyHits: apiMocks.getUserDifficultyHits,
  },
  refinery: {},
  isSuccess: (result: { success: boolean }) => result.success,
}));

const { useSettingsStore } = await import('./settingsStore');
const { useUserStore } = await import('./userStore');

const ADDRESS_A = 'bc1qaddressa';
const ADDRESS_B = 'bc1qaddressb';
const HIT = { blockHeight: 958_773, difficulty: 39_440_398, timestamp: 1_784_490_924_000 };

beforeEach(() => {
  vi.useRealTimers();
  apiMocks.getUserDifficultyHits.mockReset();
  useSettingsStore.setState({ bitcoinAddress: ADDRESS_A });
  useUserStore.setState({
    difficultyHits: null,
    difficultyHitsAddress: null,
    difficultyHitsLastAttempt: null,
    isLoadingDifficultyHits: false,
    error: null,
  });
});

describe('userStore difficulty hits', () => {
  it('caches hits and reuses them for five minutes unless forced', async () => {
    const now = new Date('2026-07-19T20:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    apiMocks.getUserDifficultyHits.mockResolvedValue({ success: true, data: [HIT] });

    await useUserStore.getState().fetchDifficultyHits();
    await useUserStore.getState().fetchDifficultyHits();

    expect(apiMocks.getUserDifficultyHits).toHaveBeenCalledOnce();
    expect(useUserStore.getState().difficultyHits?.data).toEqual([HIT]);

    await useUserStore.getState().fetchDifficultyHits({ force: true });
    expect(apiMocks.getUserDifficultyHits).toHaveBeenCalledTimes(2);
  });

  it('prevents concurrent duplicate requests', async () => {
    let resolveRequest!: (value: unknown) => void;
    apiMocks.getUserDifficultyHits.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const first = useUserStore.getState().fetchDifficultyHits();
    const second = useUserStore.getState().fetchDifficultyHits();
    expect(apiMocks.getUserDifficultyHits).toHaveBeenCalledOnce();

    resolveRequest({ success: true, data: [HIT] });
    await Promise.all([first, second]);
  });

  it('preserves stale hits and the primary error after a failure', async () => {
    const cached = { data: [HIT], timestamp: Date.now() - 10 * 60 * 1000 };
    const primaryError = { message: 'stats offline' };
    useUserStore.setState({
      difficultyHits: cached,
      difficultyHitsAddress: ADDRESS_A,
      error: primaryError,
    });
    apiMocks.getUserDifficultyHits.mockResolvedValue({
      success: false,
      error: { message: 'hits offline' },
    });

    await useUserStore.getState().fetchDifficultyHits();
    await useUserStore.getState().fetchDifficultyHits();

    expect(apiMocks.getUserDifficultyHits).toHaveBeenCalledOnce();
    expect(useUserStore.getState().difficultyHits).toBe(cached);
    expect(useUserStore.getState().error).toBe(primaryError);
    expect(useUserStore.getState().isLoadingDifficultyHits).toBe(false);
  });

  it('discards a response after the wallet changes', async () => {
    let resolveRequest!: (value: unknown) => void;
    apiMocks.getUserDifficultyHits.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const request = useUserStore.getState().fetchDifficultyHits();
    useSettingsStore.setState({ bitcoinAddress: ADDRESS_B });
    useUserStore.getState().clearUserData();
    resolveRequest({ success: true, data: [HIT] });
    await request;

    expect(useUserStore.getState().difficultyHits).toBeNull();
    expect(useUserStore.getState().isLoadingDifficultyHits).toBe(false);
  });
});
