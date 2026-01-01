/**
 * ChartSkeleton component - Loading placeholder for charts
 */

import { View } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';

export interface ChartSkeletonProps {
  height?: number;
  className?: string;
}

export function ChartSkeleton({
  height = 200,
  className = '',
}: ChartSkeletonProps) {
  return (
    <View
      className={`bg-secondary rounded-xl overflow-hidden ${className}`}
      style={{ height }}
    >
      <SkeletonLoader variant="rectangle" height={height} />
    </View>
  );
}
