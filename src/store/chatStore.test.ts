import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store persists lastSeenTs via AsyncStorage (native module — unavailable
// under vitest's node environment); an in-memory stub is all persist needs.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

import { selectHasUnread, useChatStore } from './chatStore';
import type { ChatMessage } from '@/constants/chat';

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
