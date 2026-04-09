/**
 * AchievementsCard - Displays round participation badges as SVG medals
 */

import { ScrollView, View, Pressable, Linking } from 'react-native';
import Svg, { Circle, Rect, Path, G, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../Card';
import { Text } from '../Text';
import { SkeletonLoader } from '../SkeletonLoader';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { UserRoundsResponse } from '@/types';

export interface AchievementsCardProps {
  rounds: UserRoundsResponse | null;
  isLoading?: boolean;
  className?: string;
}

function BlockBadge({ blockHeight }: { blockHeight: number }) {
  const handlePress = () => {
    Linking.openURL(`https://mempool.space/block/${blockHeight}`);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Svg width={44} height={44} viewBox="0 0 48 48">
        {/* Outer metallic ring */}
        <Circle cx={24} cy={24} r={22} fill="#b0b0b0" />

        {/* Medal face */}
        <Circle cx={24} cy={24} r={18.5} fill="#1a1a1a" />

        {/* Inner ring detail */}
        <Circle
          cx={24} cy={24} r={16}
          fill="none"
          stroke="#555"
          strokeWidth={0.5}
          strokeOpacity={0.6}
        />

        {/* Crossed pickaxes */}
        <G opacity={0.8} transform="translate(24, 19)">
          <G transform="rotate(-35)">
            <Rect x={-0.8} y={-9} width={1.6} height={15} rx={0.8} fill="#ccc" />
            <Path d="M-7-10c2-2 5-2 7-2s5 0 7 2l-7 2z" fill="#ccc" />
          </G>
          <G transform="rotate(35)">
            <Rect x={-0.8} y={-9} width={1.6} height={15} rx={0.8} fill="#ccc" />
            <Path d="M-7-10c2-2 5-2 7-2s5 0 7 2l-7 2z" fill="#ccc" />
          </G>
        </G>

        {/* Block height text */}
        <SvgText
          x={24} y={34}
          textAnchor="middle"
          fill="#ddd"
          fontSize={7.5}
          fontFamily="monospace"
          fontWeight="bold"
        >
          {blockHeight}
        </SvgText>
      </Svg>
    </Pressable>
  );
}

export function AchievementsCard({
  rounds,
  isLoading = false,
  className = '',
}: AchievementsCardProps) {
  const { t } = useTranslation();

  if (isLoading && !rounds) {
    return (
      <Card padding="sm" className={className}>
        <View className="flex-row items-center gap-2 mb-2">
          <Ionicons name="star-outline" size={18} color={colors.textMuted} />
          <Text variant="subtitle" className="text-base">
            {t('home.achievements')}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <SkeletonLoader variant="circle" width={44} height={44} />
          <SkeletonLoader variant="circle" width={44} height={44} />
          <SkeletonLoader variant="circle" width={44} height={44} />
        </View>
      </Card>
    );
  }

  if (!rounds || (rounds.history.length === 0 && rounds.rounds_won === 0)) {
    return null;
  }

  return (
    <Card padding="sm" className={className}>
      {/* Header */}
      <View className="flex-row items-center gap-2 mb-3">
        <Ionicons name="star-outline" size={18} color={colors.textMuted} />
        <Text variant="subtitle" className="text-base">
          {t('home.achievements')}
        </Text>
      </View>

      {/* Badge row */}
      {rounds.history.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {rounds.history.map((entry) => (
            <BlockBadge
              key={entry.block_height}
              blockHeight={entry.block_height}
            />
          ))}
        </ScrollView>
      )}
    </Card>
  );
}
