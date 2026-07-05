/**
 * App-level chat unread probe. The chat socket lives inside ChatScreen, which
 * lazy-mounts on first visit — so without this, the tab-bar unread dot could
 * never light until the user had already opened Chat once per launch. On cold
 * start and on each background→foreground, fetch just the newest message and
 * feed its ts into the store (latestKnownTs) for selectHasUnread to compare
 * against the persisted lastSeenTs.
 *
 * Skipped while the ChatScreen socket is connected (live events already feed
 * the store). The fetch is un-tokened, so a newest message from a blocked
 * sender can light the dot spuriously — rare, and it self-clears on the next
 * Chat visit; not worth minting a session per foreground to filter.
 */

import { useEffect, useRef } from 'react';

import { fetchChatHistory } from '@/api/chat';
import { isError } from '@/api/client';
import { awaitChatHydration, useChatStore } from '@/store/chatStore';

import { useAppState } from './useAppState';

export function useChatUnreadCheck(): void {
  const { isActive } = useAppState();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!isActive) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    (async () => {
      try {
        // Compare against the real persisted lastSeenTs, not the initial 0 —
        // otherwise the dot would flash on every cold start.
        await awaitChatHydration();
        if (useChatStore.getState().connectionState === 'connected') return;
        const result = await fetchChatHistory({ limit: 1 });
        if (isError(result)) return; // dot just stays as-is
        const newest = result.data.data?.messages?.[0];
        if (newest) useChatStore.getState().setLatestKnownTs(newest.ts);
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [isActive]);
}
