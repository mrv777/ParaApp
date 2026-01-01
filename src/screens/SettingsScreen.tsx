import { View, Text } from 'react-native';

import type { MainTabScreenProps } from '@/types/navigation';

type Props = MainTabScreenProps<'Settings'>;

export function SettingsScreen(_props: Props) {
  return (
    <View className="flex-1 bg-background items-center justify-center">
      <Text className="text-foreground text-2xl font-bold">Settings</Text>
      <Text className="text-muted text-base mt-2">Bitcoin address & preferences</Text>
    </View>
  );
}
