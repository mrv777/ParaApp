import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from './settingsStore';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

beforeEach(() => {
  useSettingsStore.setState({
    chatDisplayLanguage: 'original',
    bitcoinAddress: null,
    notificationPrefs: { blocks: true, workers: true, bestDiff: true, rewards: true },
  });
});

describe('chat reading preference', () => {
  it('defaults to originals and persists the selected English view', () => {
    expect(useSettingsStore.getInitialState().chatDisplayLanguage).toBe('original');
    useSettingsStore.getState().setChatDisplayLanguage('en');
    const partialize = useSettingsStore.persist.getOptions().partialize!;
    expect(partialize(useSettingsStore.getState())).toMatchObject({ chatDisplayLanguage: 'en' });
    useSettingsStore.getState().setChatDisplayLanguage('original');
    expect(useSettingsStore.getState().chatDisplayLanguage).toBe('original');
  });
});

describe('settingsStore address identity', () => {
  it('stores uppercase Bech32 addresses in canonical lowercase form', () => {
    useSettingsStore.getState().setBitcoinAddress('BC1QABC123');
    expect(useSettingsStore.getState().bitcoinAddress).toBe('bc1qabc123');
  });

  it('preserves case-sensitive Base58 addresses', () => {
    const address = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
    useSettingsStore.getState().setBitcoinAddress(address);
    expect(useSettingsStore.getState().bitcoinAddress).toBe(address);
  });
});

describe('settingsStore notification preferences', () => {
  it('keeps the existing object reference when an update changes no values', () => {
    const before = useSettingsStore.getState().notificationPrefs;
    useSettingsStore.getState().setNotificationPrefs({ blocks: true });
    expect(useSettingsStore.getState().notificationPrefs).toBe(before);
  });
});
