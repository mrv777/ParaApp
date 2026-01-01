/**
 * SkeletonLoader component with shimmer animation
 * Used for loading placeholders matching content shapes
 */

import { useEffect } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';

export type SkeletonVariant = 'text' | 'circle' | 'rectangle' | 'card';

export interface SkeletonLoaderProps {
  variant?: SkeletonVariant;
  width?: DimensionValue;
  height?: DimensionValue;
  className?: string;
}

const variantDefaults: Record<
  SkeletonVariant,
  { width: DimensionValue; height: DimensionValue; borderRadius: string }
> = {
  text: { width: '100%', height: 16, borderRadius: 'rounded' },
  circle: { width: 40, height: 40, borderRadius: 'rounded-full' },
  rectangle: { width: '100%', height: 100, borderRadius: 'rounded-lg' },
  card: { width: '100%', height: 120, borderRadius: 'rounded-xl' },
};

export function SkeletonLoader({
  variant = 'text',
  width,
  height,
  className = '',
}: SkeletonLoaderProps) {
  const shimmerProgress = useSharedValue(0);

  useEffect(() => {
    shimmerProgress.value = withRepeat(
      withTiming(1, {
        duration: 1500,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [shimmerProgress]);

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      shimmerProgress.value,
      [0, 0.5, 1],
      [0.3, 0.6, 0.3],
    );
    return { opacity };
  });

  const defaults = variantDefaults[variant];
  const finalWidth = width ?? defaults.width;
  const finalHeight = height ?? defaults.height;

  // For circle variant, ensure width equals height
  const finalDimensions =
    variant === 'circle'
      ? {
          width: width ?? defaults.width,
          height: width ?? defaults.width,
        }
      : {
          width: finalWidth,
          height: finalHeight,
        };

  return (
    <Animated.View
      className={`bg-secondary ${defaults.borderRadius} ${className}`}
      style={[finalDimensions, animatedStyle]}
    />
  );
}

/**
 * Preset skeleton layouts for common use cases
 */
export function SkeletonText({
  lines = 1,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <View className={`gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonLoader
          key={index}
          variant="text"
          width={index === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </View>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <View className={`bg-secondary rounded-xl p-4 gap-3 ${className}`}>
      <View className="flex-row items-center gap-3">
        <SkeletonLoader variant="circle" width={48} />
        <View className="flex-1 gap-2">
          <SkeletonLoader variant="text" width="70%" />
          <SkeletonLoader variant="text" width="40%" />
        </View>
      </View>
      <SkeletonLoader variant="rectangle" height={60} />
    </View>
  );
}

export function SkeletonStatItem({ className = '' }: { className?: string }) {
  return (
    <View className={`gap-1.5 ${className}`}>
      <SkeletonLoader variant="text" width={80} height={12} />
      <SkeletonLoader variant="text" width={120} height={24} />
    </View>
  );
}
