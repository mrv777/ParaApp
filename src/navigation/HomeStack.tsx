/**
 * HomeStack - Stack navigator for Home tab screens
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeMainScreen, WorkersListScreen } from '@/screens/home';
import { colors } from '@/constants/colors';
import type { HomeStackParamList } from '@/types/navigation';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="HomeMain" component={HomeMainScreen} />
      <Stack.Screen name="WorkersList" component={WorkersListScreen} />
    </Stack.Navigator>
  );
}
