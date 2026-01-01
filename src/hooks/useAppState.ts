/**
 * Hook to track app foreground/background state
 * Used to pause polling when app is backgrounded
 */

import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export interface UseAppStateReturn {
  /** Whether app is in foreground (active) */
  isActive: boolean;
  /** Current AppState value */
  appState: AppStateStatus;
}

/**
 * Track app foreground/background state using React Native AppState API
 */
export function useAppState(): UseAppStateReturn {
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  return {
    isActive: appState === 'active',
    appState,
  };
}
