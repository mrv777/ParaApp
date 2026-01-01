/**
 * MinersStack - Stack navigator for Miners tab screens
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MinersScreen } from '@/screens';
import { MinerDetailScreen } from '@/screens/miners';
import { colors } from '@/constants/colors';
import type { MinersStackParamList } from '@/types/navigation';

const Stack = createNativeStackNavigator<MinersStackParamList>();

export function MinersStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="MinersMain" component={MinersScreen} />
      <Stack.Screen name="MinerDetail" component={MinerDetailScreen} />
    </Stack.Navigator>
  );
}
