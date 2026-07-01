/**
 * ChartSkeleton component - Loading placeholder for charts
 */

import { View } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';

export interface ChartSkeletonProps {
  height?: number;
  className?: string;
  /** Square (borderRadius 0) + transparent — for the in-card chart variant. */
  square?: boolean;
}

export function ChartSkeleton({
  height = 200,
  className = '',
  square = false,
}: ChartSkeletonProps) {
  return (
    <View
      className={`overflow-hidden ${square ? '' : 'bg-secondary rounded-xl'} ${className}`}
      style={{ height }}
    >
      <SkeletonLoader variant="rectangle" height={height} />
    </View>
  );
}
