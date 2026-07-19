import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getNetworkDifficulty: vi.fn(),
}));

vi.mock('@/api', () => ({
  parasite: {},
  mempool: {
    getNetworkDifficulty: apiMocks.getNetworkDifficulty,
  },
  isSuccess: (result: { success: boolean }) => result.success,
}));

const { usePoolStore } = await import('./poolStore');

beforeEach(() => {
  apiMocks.getNetworkDifficulty.mockReset();
  usePoolStore.setState({
    networkDifficulty: null,
    networkDifficultyLastAttempt: null,
    isLoadingNetworkDifficulty: false,
  });
});

describe('poolStore network difficulty', () => {
  it('caches a valid response', async () => {
    apiMocks.getNetworkDifficulty.mockResolvedValue({ success: true, data: 127e12 });

    await usePoolStore.getState().fetchNetworkDifficulty();

    expect(usePoolStore.getState().networkDifficulty?.data).toBe(127e12);
    expect(usePoolStore.getState().isLoadingNetworkDifficulty).toBe(false);
  });

  it('does not request again within an hour unless forced', async () => {
    const now = Date.now();
    usePoolStore.setState({
      networkDifficulty: { data: 127e12, timestamp: now },
      networkDifficultyLastAttempt: now,
    });
    apiMocks.getNetworkDifficulty.mockResolvedValue({ success: true, data: 128e12 });

    await usePoolStore.getState().fetchNetworkDifficulty();
    expect(apiMocks.getNetworkDifficulty).not.toHaveBeenCalled();

    await usePoolStore.getState().fetchNetworkDifficulty({ force: true });
    expect(apiMocks.getNetworkDifficulty).toHaveBeenCalledOnce();
    expect(usePoolStore.getState().networkDifficulty?.data).toBe(128e12);
  });

  it('preserves cached data and rate-limits retries after a failure', async () => {
    const cached = { data: 126e12, timestamp: Date.now() - 2 * 60 * 60 * 1000 };
    usePoolStore.setState({ networkDifficulty: cached });
    apiMocks.getNetworkDifficulty.mockResolvedValue({
      success: false,
      error: { message: 'offline' },
    });

    await usePoolStore.getState().fetchNetworkDifficulty();
    await usePoolStore.getState().fetchNetworkDifficulty();

    expect(apiMocks.getNetworkDifficulty).toHaveBeenCalledOnce();
    expect(usePoolStore.getState().networkDifficulty).toBe(cached);
    expect(usePoolStore.getState().isLoadingNetworkDifficulty).toBe(false);
  });
});
