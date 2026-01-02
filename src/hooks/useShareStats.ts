/**
 * useShareStats - Hook for capturing and sharing stats card images
 */

import { useCallback, useState, RefObject } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { haptics } from '@/utils/haptics';

export interface UseShareStatsReturn {
  isSharing: boolean;
  shareError: string | null;
  captureAndShare: () => Promise<void>;
  clearError: () => void;
  shouldRenderCard: boolean;
}

export function useShareStats(
  viewRef: RefObject<View | null>
): UseShareStatsReturn {
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shouldRenderCard, setShouldRenderCard] = useState(false);

  const captureAndShare = useCallback(async () => {
    setIsSharing(true);
    setShareError(null);

    // Mount the card first
    setShouldRenderCard(true);

    // Wait for view to mount and render (needed for Android compatibility)
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (!viewRef.current) {
      setShareError('Unable to capture stats');
      setShouldRenderCard(false);
      setIsSharing(false);
      return;
    }

    try {
      // Capture the view as PNG
      const uri = await captureRef(viewRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Sharing not available on this device');
      }

      // Open native share sheet
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share Mining Stats',
      });

      await haptics.success();
    } catch (error) {
      // User cancellation is not an error
      if (error instanceof Error && error.message.includes('cancel')) {
        // User cancelled, no action needed
      } else {
        const message =
          error instanceof Error ? error.message : 'Failed to share';
        setShareError(message);
        await haptics.error();
      }
    } finally {
      setShouldRenderCard(false);
      setIsSharing(false);
    }
  }, [viewRef]);

  const clearError = useCallback(() => {
    setShareError(null);
  }, []);

  return {
    isSharing,
    shareError,
    captureAndShare,
    clearError,
    shouldRenderCard,
  };
}
