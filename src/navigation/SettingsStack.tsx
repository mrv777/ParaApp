/**
 * SettingsStack - Stack navigator for Settings tab screens
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsMainScreen, QRScannerScreen } from '@/screens/settings';
import { colors } from '@/constants/colors';
import type { SettingsStackParamList } from '@/types/navigation';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="SettingsMain" component={SettingsMainScreen} />
      <Stack.Screen
        name="QRScanner"
        component={QRScannerScreen}
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack.Navigator>
  );
}
