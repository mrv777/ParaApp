/**
 * AddAddressPrompt - CTA card prompting user to add Bitcoin address
 */

import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../Card';
import { Text } from '../Text';
import { Button } from '../Button';
import { colors } from '@/constants/colors';

export interface AddAddressPromptProps {
  onPress: () => void;
  className?: string;
}

export function AddAddressPrompt({ onPress, className = '' }: AddAddressPromptProps) {
  return (
    <Card className={className}>
      <View className="items-center py-4">
        <View className="w-14 h-14 rounded-full bg-secondary items-center justify-center mb-4">
          <Ionicons name="wallet-outline" size={28} color={colors.text} />
        </View>
        <Text variant="subtitle" className="text-center mb-2">
          Track Your Mining Stats
        </Text>
        <Text variant="body" color="muted" className="text-center mb-4 px-4">
          Add your Bitcoin address to see your hashrate, workers, and mining progress
        </Text>
        <Button variant="primary" icon="add-circle-outline" onPress={onPress}>
          Add Bitcoin Address
        </Button>
      </View>
    </Card>
  );
}
