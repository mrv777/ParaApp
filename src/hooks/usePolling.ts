/**
 * Generic polling hook with configurable interval
 * Automatically pauses when app is backgrounded
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useAppState } from './useAppState';

export interface UsePollingOptions {
  /** Callback to execute on each poll */
  onPoll: () => Promise<void> | void;
  /** Override polling interval in ms (uses settingsStore if not provided) */
  interval?: number;
  /** Enable/disable polling (default: true) */
  enabled?: boolean;
  /** Execute immediately on mount (default: true) */
  immediate?: boolean;
}

export interface UsePollingReturn {
  /** Manually trigger a poll */
  refresh: () => Promise<void>;
  /** Whether a poll is currently in progress */
  isPolling: boolean;
  /** Time of last successful poll (ms since epoch) */
  lastPollTime: number | null;
}

/**
 * Poll at a configurable interval, respecting app state and user preferences
 */
export function usePolling({
  onPoll,
  interval: intervalOverride,
  enabled = true,
  immediate = true,
}: UsePollingOptions): UsePollingReturn {
  const pollingInterval = useSettingsStore((s) => s.pollingInterval);
  const interval = intervalOverride ?? pollingInterval;

  const { isActive } = useAppState();
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPollRef = useRef(onPoll);
  const isPollingRef = useRef(false);
  const hasInitialPolledRef = useRef(false);

  // Keep callback ref fresh without retriggering effect
  useEffect(() => {
    onPollRef.current = onPoll;
  }, [onPoll]);

  const executePoll = useCallback(async () => {
    // Prevent overlapping polls using ref (more reliable than state)
    if (isPollingRef.current) return;

    isPollingRef.current = true;
    setIsPolling(true);

    try {
      await onPollRef.current();
      setLastPollTime(Date.now());
    } finally {
      isPollingRef.current = false;
      setIsPolling(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await executePoll();
  }, [executePoll]);

  // Main polling effect
  useEffect(() => {
    const shouldPoll = enabled && isActive;

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!shouldPoll) {
      // Reset so next enable (or foreground) triggers immediate poll
      hasInitialPolledRef.current = false;
      return;
    }

    // Execute immediately if requested and hasn't polled yet
    if (immediate && !hasInitialPolledRef.current) {
      hasInitialPolledRef.current = true;
      executePoll();
    }

    // Set up interval
    intervalRef.current = setInterval(executePoll, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, isActive, interval, immediate, executePoll]);

  return { refresh, isPolling, lastPollTime };
}
