import { beforeEach, describe, expect, it } from 'vitest';

import { useChatStore } from './chatStore';
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
});
