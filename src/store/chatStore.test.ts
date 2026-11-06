import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MESSAGES, selectHasUnread, useChatStore } from './chatStore';
import type { ChatMessage } from '@/constants/chat';

// The store persists lastSeenTs via AsyncStorage (native module — unavailable
// under vitest's node environment); an in-memory stub is all persist needs.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

const msg = (id: string, ts: number): ChatMessage => ({
  id,
  ts,
  address: 'bc1qxxx…yyyy',
  nickname: null,
  official: false,
  body: `m${id}`,
});

beforeEach(() => {
  useChatStore.getState().reset();
});

describe('chatStore.clearFeed — M16: scoped feed reset', () => {
  it('clears messages + historyLoaded but leaves connection/lastSeen/tombstones intact', () => {
    const store = useChatStore.getState();
    // Arrange a "live, healthy" state with a delete tombstone recorded.
    store.setConnectionState('connected');
    store.addMessages([msg('a', 100), msg('b', 200)]);
    store.markSeen(); // lastSeenTs → 200
    store.setHistoryLoaded(true);
    store.removeMessage('a'); // records a tombstone for 'a'

    useChatStore.getState().clearFeed();

    const s = useChatStore.getState();
    expect(s.messages).toHaveLength(0); // feed dropped
    expect(s.historyLoaded).toBe(false); // re-armed
    expect(s.connectionState).toBe('connected'); // NOT flipped to disconnected
    expect(s.lastSeenTs).toBe(200); // unread baseline preserved

    // Tombstone preserved: re-merging the deleted id must not resurrect it.
    useChatStore.getState().addMessages([msg('a', 100)]);
    expect(useChatStore.getState().messages.find((m) => m.id === 'a')).toBeUndefined();
  });

  it('full reset() DOES clear connection/lastSeen (contrast with clearFeed)', () => {
    const store = useChatStore.getState();
    store.setConnectionState('connected');
    store.addMessages([msg('a', 100)]);
    store.markSeen();

    useChatStore.getState().reset();

    const s = useChatStore.getState();
    expect(s.connectionState).toBe('disconnected');
    expect(s.lastSeenTs).toBe(0);
  });

  it('reset() clears latestKnownTs (identity switch must drop the probe baseline)', () => {
    useChatStore.getState().setLatestKnownTs(500);
    useChatStore.getState().reset();
    expect(useChatStore.getState().latestKnownTs).toBe(0);
  });
});

describe('chatStore unread — app-level probe (latestKnownTs)', () => {
  it('lights unread with zero loaded messages (cold start, Chat never mounted)', () => {
    expect(selectHasUnread(useChatStore.getState())).toBe(false);
    useChatStore.getState().setLatestKnownTs(100);
    expect(selectHasUnread(useChatStore.getState())).toBe(true);
  });

  it('stays read when the probe ts is not newer than lastSeenTs', () => {
    const store = useChatStore.getState();
    store.addMessages([msg('a', 100)]);
    store.markSeen(); // lastSeenTs → 100
    useChatStore.getState().setLatestKnownTs(100);
    expect(selectHasUnread(useChatStore.getState())).toBe(false);
  });

  it('setLatestKnownTs is forward-only', () => {
    useChatStore.getState().setLatestKnownTs(200);
    useChatStore.getState().setLatestKnownTs(150);
    expect(useChatStore.getState().latestKnownTs).toBe(200);
  });

  it('markSeen advances past latestKnownTs even when newer than loaded messages', () => {
    const store = useChatStore.getState();
    store.addMessages([msg('a', 100)]);
    store.setLatestKnownTs(300); // probe saw something newer than the loaded feed
    useChatStore.getState().markSeen();
    const s = useChatStore.getState();
    expect(s.lastSeenTs).toBe(300);
    expect(selectHasUnread(s)).toBe(false);
  });
});

describe('chatStore persistence', () => {
  it('persists only lastSeenTs (messages/latestKnownTs stay session-only)', () => {
    const store = useChatStore.getState();
    store.addMessages([msg('a', 100)]);
    store.markSeen();
    store.setLatestKnownTs(999);
    const partialize = useChatStore.persist.getOptions().partialize!;
    expect(partialize(useChatStore.getState())).toEqual({ lastSeenTs: 100 });
  });
});

describe('English translation derivatives', () => {
  const english = { text: 'Good morning', sourceLanguage: 'de' };

  it('merges history translations separately and preserves them across original-only refreshes', () => {
    const original = { ...msg('a', 100), body: 'Guten Morgen' };
    const store = useChatStore.getState();
    store.addMessages([{ ...original, englishTranslation: english }]);
    store.addMessages([original]);
    const state = useChatStore.getState();
    expect(state.translations.a).toEqual(english);
    expect(state.messages[0].body).toBe('Guten Morgen');
    expect(state.messages[0].englishTranslation).toBeUndefined();
  });

  it('live translation changes neither messages, reactions, order nor unread state', () => {
    const store = useChatStore.getState();
    store.addMessages([msg('a', 100), msg('b', 200)]);
    store.applyReaction('a', '👍', 2, true);
    store.markSeen();
    const before = useChatStore.getState();
    store.applyTranslation('a', english);
    const after = useChatStore.getState();
    expect(after.messages).toBe(before.messages);
    expect(after.translations.a).toEqual(english);
    expect(after.lastSeenTs).toBe(before.lastSeenTs);
    expect(selectHasUnread(after)).toBe(false);
  });

  it('drops deleted/blocked derivatives and ignores late completions or deleted history', () => {
    const store = useChatStore.getState();
    store.addMessages([
      { ...msg('deleted', 100), address: 'one', englishTranslation: english },
      { ...msg('blocked', 200), address: 'two', englishTranslation: english },
    ]);
    store.removeMessage('deleted');
    store.removeMessagesFrom('two');
    store.applyTranslation('deleted', english);
    store.applyTranslation('blocked', english);
    store.applyTranslation('unloaded', english);
    store.addMessages([{ ...msg('deleted', 100), englishTranslation: english }]);
    expect(useChatStore.getState().translations).toEqual({});
    expect(useChatStore.getState().messages).toEqual([]);
  });

  it('bounds translation memory to retained messages and clears it on feed/identity reset', () => {
    const store = useChatStore.getState();
    store.addMessages(Array.from({ length: MAX_MESSAGES + 1 }, (_, index) => ({
      ...msg(String(index), index + 1), englishTranslation: english,
    })));
    expect(Object.keys(useChatStore.getState().translations)).toHaveLength(MAX_MESSAGES);
    expect(useChatStore.getState().translations['0']).toBeUndefined();
    store.clearFeed();
    expect(useChatStore.getState().translations).toEqual({});
    store.addMessages([{ ...msg('a', 100), englishTranslation: english }]);
    store.setTranslationStatus({ enabled: true, used: 500, monthlyLimit: 500, resetsAt: 2000 });
    store.reset();
    expect(useChatStore.getState().translations).toEqual({});
    expect(useChatStore.getState().translationStatus).toBeNull();
  });

  it('does not roll back live quota usage with a slower history response; accepts a new month', () => {
    const store = useChatStore.getState();
    store.setTranslationStatus({ enabled: true, used: 500, monthlyLimit: 500, resetsAt: 2000 });
    store.setTranslationStatus({ enabled: true, used: 499, monthlyLimit: 500, resetsAt: 2000 });
    expect(useChatStore.getState().translationStatus?.used).toBe(500);
    store.setTranslationStatus({ enabled: true, used: 1, monthlyLimit: 500, resetsAt: 3000 });
    store.setTranslationStatus({ enabled: true, used: 500, monthlyLimit: 500, resetsAt: 2000 });
    expect(useChatStore.getState().translationStatus?.used).toBe(1);
    store.setTranslationStatus({ enabled: false, used: 1, monthlyLimit: 500, resetsAt: 3000 });
    expect(useChatStore.getState().translationStatus?.enabled).toBe(false);
  });

  it('preserves a character-budget limit independently of message usage until the next month', () => {
    const store = useChatStore.getState();
    store.setTranslationStatus({ enabled: true, used: 12, monthlyLimit: 500, resetsAt: 2000, limitReached: true });
    store.setTranslationStatus({ enabled: true, used: 11, monthlyLimit: 500, resetsAt: 2000, limitReached: false });
    expect(useChatStore.getState().translationStatus?.limitReached).toBe(true);
    store.setTranslationStatus({ enabled: true, used: 0, monthlyLimit: 500, resetsAt: 3000, limitReached: false });
    expect(useChatStore.getState().translationStatus?.limitReached).toBe(false);
  });
});
