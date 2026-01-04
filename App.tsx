import './global.css';
import '@/i18n'; // Initialize i18n

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

import { PoolScreen } from '@/screens';
import { TabBar } from '@/components/navigation/TabBar';
import { Toast } from '@/components/Toast';
import { HomeStack, MinersStack, SettingsStack } from '@/navigation';
import { colors } from '@/constants/colors';
import { changeLanguage } from '@/i18n';
import { useSettingsStore, selectIsHydrated, selectLanguage } from '@/store/settingsStore';
import { useNotifications } from '@/hooks/useNotifications';
import type { MainTabParamList } from '@/types/navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();

const navigationTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.text,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};

export default function App() {
  const isHydrated = useSettingsStore(selectIsHydrated);
  const language = useSettingsStore(selectLanguage);

  // Initialize push notifications
  useNotifications();

  // Sync language preference on app startup
  useEffect(() => {
    if (isHydrated) {
      changeLanguage(language);
    }
  }, [isHydrated, language]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={navigationTheme}>
          <BottomSheetModalProvider>
            <Tab.Navigator
              tabBar={(props) => <TabBar {...props} />}
              screenOptions={{
                headerShown: false,
                animation: 'fade',
              }}
            >
              <Tab.Screen name="Home" component={HomeStack} />
              <Tab.Screen name="Pool" component={PoolScreen} />
              <Tab.Screen name="Miners" component={MinersStack} />
              <Tab.Screen name="Settings" component={SettingsStack} />
            </Tab.Navigator>
            {/* Toast inside BottomSheetModalProvider to render above bottom sheets */}
            <Toast />
          </BottomSheetModalProvider>
        </NavigationContainer>
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
