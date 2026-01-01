/**
 * EmptyMinersState - Empty state when no miners are saved
 * Prompts user to start discovery or add manually
 */

import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { Button } from '../Button';
import { colors } from '@/constants/colors';

export interface EmptyMinersStateProps {
  onStartDiscovery: () => void;
  className?: string;
}

export function EmptyMinersState({
  onStartDiscovery,
  className = '',
}: EmptyMinersStateProps) {
  return (
    <View className={`items-center justify-center py-16 px-8 ${className}`}>
      <View className="w-20 h-20 rounded-full bg-secondary items-center justify-center mb-6">
        <Ionicons name="hardware-chip-outline" size={40} color={colors.textMuted} />
      </View>

      <Text variant="subtitle" align="center" className="mb-2">
        No Miners Found
      </Text>

      <Text variant="body" color="muted" align="center" className="mb-8">
        Scan your network to discover Bitaxe miners, or add one manually by IP address.
      </Text>

      <Button
        variant="primary"
        size="lg"
        icon="search"
        onPress={onStartDiscovery}
      >
        Scan Network
      </Button>
    </View>
  );
}
