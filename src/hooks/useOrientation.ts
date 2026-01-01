/**
 * Hook to track device orientation changes
 */

import { useState, useEffect } from 'react';
import { Dimensions } from 'react-native';

export type Orientation = 'portrait' | 'landscape';

export interface UseOrientationReturn {
  isLandscape: boolean;
  orientation: Orientation;
}

export function useOrientation(): UseOrientationReturn {
  const [isLandscape, setIsLandscape] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return width > height;
  });

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setIsLandscape(window.width > window.height);
    });

    return () => subscription.remove();
  }, []);

  return {
    isLandscape,
    orientation: isLandscape ? 'landscape' : 'portrait',
  };
}
